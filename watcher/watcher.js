#!/usr/bin/env node
/**
 * OpenClaw Workspace Watcher — State-Aware Reload Orchestrator
 *
 * Runs as a persistent sidecar service. Watches workspace files for changes
 * and coordinates state-aware reloads across all active agent sessions without
 * interrupting in-flight requests.
 *
 * Architecture:
 *   - Chokidar watches 6 workspace files
 *   - Session registry tracks state (idle / active / queued) via heartbeats
 *   - SSE streams push reload events to connected Python watcher_clients
 *   - Clients POST back acknowledgment events to advance the reload state machine
 *
 * Endpoints:
 *   GET  /health                       → health check
 *   GET  /registry                     → debug: dump session registry
 *   GET  /events/:sessionId            → SSE stream for this session
 *   POST /heartbeat                    → session heartbeat (updates registry)
 *   POST /event/:sessionId/:eventName  → agent acknowledgment events
 */

'use strict';

const express = require('express');
const chokidar = require('chokidar');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT              = parseInt(process.env.PORT || '18791', 10);
const WORKSPACE_DIR     = process.env.WORKSPACE_DIR || '/workspace';
const STALE_SESSION_MS  = parseInt(process.env.STALE_SESSION_MS  || '30000', 10);
const DEBOUNCE_MS       = parseInt(process.env.DEBOUNCE_MS        || '500',   10);
const RATE_LIMIT_MS     = parseInt(process.env.RATE_LIMIT_MS      || '10000', 10);
const REQUEST_TIMEOUT   = parseInt(process.env.REQUEST_TIMEOUT    || '60000', 10);
const RELOAD_TIMEOUT    = parseInt(process.env.RELOAD_TIMEOUT     || '30000', 10);

const WATCHED_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'MEMORY.md',
  'TOOLS.md',
  'IDENTITY.md',
  'HEARTBEAT.md',
].map(f => path.join(WORKSPACE_DIR, f));

// Additional directories watched recursively for *.md changes.
// Lets users edit skill SKILL.md files or drop new knowledge docs and
// trigger a workspace reload without restarting containers.
const WATCHED_DIRS = [
  path.join(WORKSPACE_DIR, 'skills'),
  path.join(WORKSPACE_DIR, 'knowledge'),
];

// Glob patterns passed to chokidar — picks up any .md file under the watched dirs.
const WATCHED_GLOBS = WATCHED_DIRS.map(d => path.join(d, '**/*.md'));

// Walk a directory recursively and return all .md file paths (best-effort).
function listMdFiles(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMdFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * sessionRegistry: Map<sessionId, SessionEntry>
 *
 * SessionEntry = {
 *   sessionId:        string,
 *   userId:           string,
 *   channel:          string,
 *   state:            'idle' | 'active' | 'queued',
 *   lastHeartbeat:    number,  ← always set by server clock
 *   queueDepth:       number,
 *   currentRequestId: string | null,
 *   workspaceVersion: string | null,
 * }
 */
const sessionRegistry = new Map();

/**
 * sseClients: Map<sessionId, express.Response>
 * One SSE response object per connected session.
 */
const sseClients = new Map();

/**
 * subscriptions: Map<key, { callback, timer }>
 * Pending one-shot callbacks waiting for a specific event from a session.
 * key format: "<sessionId>:<eventName>[:<requestId>]"
 */
const subscriptions = new Map();

/**
 * reloadInProgress: Map<sessionId, boolean>
 * Prevents overlapping reload sequences for the same session.
 */
const reloadInProgress = new Map();

/**
 * lastReloadTime: Map<sessionId, number>
 * Rate limiting — track when we last triggered a reload for each session.
 */
const lastReloadTime = new Map();

// Current hash of all watched workspace files combined.
let currentWorkspaceVersion = computeWorkspaceVersion();

// ─── Workspace Version Hash ──────────────────────────────────────────────────

function computeWorkspaceVersion() {
  const combined = crypto.createHash('sha256');
  // Hash the top-level required files first (stable order).
  for (const filePath of WATCHED_FILES) {
    try {
      combined.update(fs.readFileSync(filePath));
    } catch (_) {
      // File missing or unreadable — skip
    }
  }
  // Then hash every .md file under skills/ and knowledge/ in sorted order.
  const dirFiles = [];
  for (const dir of WATCHED_DIRS) dirFiles.push(...listMdFiles(dir));
  dirFiles.sort();
  for (const filePath of dirFiles) {
    try {
      combined.update(Buffer.from(filePath));
      combined.update(fs.readFileSync(filePath));
    } catch (_) {
      // skip
    }
  }
  return combined.digest('hex');
}

// ─── Session Registry ────────────────────────────────────────────────────────

function updateSession(sessionId, data) {
  const existing = sessionRegistry.get(sessionId) || {};
  sessionRegistry.set(sessionId, {
    ...existing,
    sessionId,
    userId:           data.userId           || existing.userId           || 'unknown',
    channel:          data.channel          || existing.channel          || 'unknown',
    state:            data.state            || existing.state            || 'idle',
    lastHeartbeat:    Date.now(),            // Always use server clock (edge case 12)
    queueDepth:       data.queueDepth       != null ? data.queueDepth : (existing.queueDepth || 0),
    currentRequestId: data.currentRequestId !== undefined ? data.currentRequestId : existing.currentRequestId,
    workspaceVersion: data.workspaceVersion || existing.workspaceVersion || null,
  });
}

// Remove sessions with no heartbeat in STALE_SESSION_MS
function cleanStaleSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessionRegistry.entries()) {
    if (now - session.lastHeartbeat > STALE_SESSION_MS) {
      log(`[registry] Session stale, removing: ${sessionId}`);
      sessionRegistry.delete(sessionId);
      subscriptions.forEach((_, key) => {
        if (key.startsWith(sessionId)) {
          const sub = subscriptions.get(key);
          if (sub) clearTimeout(sub.timer);
          subscriptions.delete(key);
        }
      });
      reloadInProgress.delete(sessionId);
      lastReloadTime.delete(sessionId);
    }
  }
}

setInterval(cleanStaleSessions, 60_000);

// ─── SSE Helpers ─────────────────────────────────────────────────────────────

function sendEvent(sessionId, eventName, payload) {
  const res = sseClients.get(sessionId);
  if (!res) {
    log(`[sse] No SSE client for session ${sessionId} — event ${eventName} dropped`);
    return false;
  }
  const data = JSON.stringify({ event: eventName, ...payload });
  res.write(`event: ${eventName}\ndata: ${data}\n\n`);
  return true;
}

// ─── Subscription Helpers ─────────────────────────────────────────────────────

/**
 * Register a one-shot callback waiting for an event from a session.
 * If it doesn't fire within timeoutMs, the callback is called anyway (safety).
 */
function subscribe(key, callback, timeoutMs) {
  // Cancel previous sub for this key if any
  if (subscriptions.has(key)) {
    const old = subscriptions.get(key);
    clearTimeout(old.timer);
    subscriptions.delete(key);
  }

  const timer = setTimeout(() => {
    if (subscriptions.has(key)) {
      log(`[sub] Timeout for key "${key}" — proceeding with fallback`);
      subscriptions.delete(key);
      callback();
    }
  }, timeoutMs);

  subscriptions.set(key, { callback, timer });
}

function resolveSubscription(key) {
  const sub = subscriptions.get(key);
  if (sub) {
    clearTimeout(sub.timer);
    subscriptions.delete(key);
    sub.callback();
    return true;
  }
  return false;
}

function subscribeRequestComplete(sessionId, requestId, cb) {
  const key = `${sessionId}:request-complete:${requestId}`;
  subscribe(key, cb, REQUEST_TIMEOUT);
}

function subscribeReloadComplete(sessionId, cb) {
  subscribe(`${sessionId}:reload-complete`, cb, RELOAD_TIMEOUT);
}

function subscribeContextReloaded(sessionId, cb) {
  subscribe(`${sessionId}:context-reloaded`, cb, RELOAD_TIMEOUT);
}

// ─── Reload Orchestrator ─────────────────────────────────────────────────────

/**
 * Trigger a reload for a specific session, respecting rate limiting and
 * preventing overlapping sequences.
 */
function triggerReloadForSession(sessionId, changedFiles, version) {
  const now = Date.now();
  const lastReload = lastReloadTime.get(sessionId) || 0;

  // Rate limit: at most one reload per RATE_LIMIT_MS per session
  if (now - lastReload < RATE_LIMIT_MS) {
    const delay = RATE_LIMIT_MS - (now - lastReload);
    log(`[reload] Rate limiting session ${sessionId} — retry in ${delay}ms`);
    setTimeout(() => triggerReloadForSession(sessionId, changedFiles, version), delay);
    return;
  }

  // Prevent overlapping reloads for this session (edge case 10)
  if (reloadInProgress.get(sessionId)) {
    log(`[reload] Reload in-progress for ${sessionId} — queuing another`);
    subscribeReloadComplete(sessionId, () => {
      triggerReloadForSession(sessionId, changedFiles, version);
    });
    return;
  }

  reloadInProgress.set(sessionId, true);
  lastReloadTime.set(sessionId, now);

  sendEvent(sessionId, 'reload-workspace', { changedFiles, workspaceVersion: version });
  log(`[reload] Sent reload-workspace to ${sessionId}`);

  subscribeReloadComplete(sessionId, () => {
    reloadInProgress.delete(sessionId);
    log(`[reload] reload-complete received from ${sessionId}`);
  });
}

/**
 * Main orchestration: iterate all live sessions, route each one based on state.
 */
function triggerReloadOrchestration(changedFiles) {
  currentWorkspaceVersion = computeWorkspaceVersion();
  const version = currentWorkspaceVersion;
  const now = Date.now();

  log(`[orchestrator] Workspace changed: [${changedFiles.join(', ')}] → version ${version.slice(0, 8)}`);

  for (const [sessionId, session] of sessionRegistry.entries()) {
    // Skip stale sessions
    if (now - session.lastHeartbeat > STALE_SESSION_MS) continue;

    // Skip sessions already on this version
    if (session.workspaceVersion === version) continue;

    // Only act on sessions that have an active SSE connection
    if (!sseClients.has(sessionId)) {
      log(`[orchestrator] Session ${sessionId} has no SSE connection — skipping`);
      continue;
    }

    switch (session.state) {
      case 'idle': {
        log(`[orchestrator] Session ${sessionId} is idle → immediate reload`);
        triggerReloadForSession(sessionId, changedFiles, version);
        break;
      }

      case 'active': {
        log(`[orchestrator] Session ${sessionId} is active → waiting for request-complete`);
        subscribeRequestComplete(sessionId, session.currentRequestId, () => {
          log(`[orchestrator] Session ${sessionId} request complete → triggering reload`);
          triggerReloadForSession(sessionId, changedFiles, version);
        });
        break;
      }

      case 'queued': {
        log(`[orchestrator] Session ${sessionId} is queued → waiting for request-complete, then pause→reload→resume`);
        subscribeRequestComplete(sessionId, session.currentRequestId, () => {
          sendEvent(sessionId, 'pause-queue', {});
          log(`[orchestrator] Session ${sessionId} queue paused`);

          // Send reload-workspace
          reloadInProgress.set(sessionId, true);
          lastReloadTime.set(sessionId, Date.now());

          sendEvent(sessionId, 'reload-workspace', { changedFiles, workspaceVersion: version });

          subscribeReloadComplete(sessionId, () => {
            reloadInProgress.delete(sessionId);
            log(`[orchestrator] Session ${sessionId} reload complete → context reload`);

            sendEvent(sessionId, 'reload-context', {});

            subscribeContextReloaded(sessionId, () => {
              log(`[orchestrator] Session ${sessionId} context reloaded → resuming queue`);
              sendEvent(sessionId, 'resume-queue', {});
            });
          });
        });
        break;
      }
    }
  }
}

// ─── File Watcher ────────────────────────────────────────────────────────────

let debounceTimer = null;
const changedFilesBuffer = new Set();

function handleFileChange(filePath) {
  const relativeName = path.basename(filePath);
  changedFilesBuffer.add(relativeName);
  log(`[watcher] Change detected: ${relativeName} (debounce reset)`);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const files = Array.from(changedFilesBuffer);
    changedFilesBuffer.clear();
    triggerReloadOrchestration(files);
  }, DEBOUNCE_MS);
}

const REQUIRED_FILES = ['AGENTS.md', 'SOUL.md'];

function startFileWatcher() {
  // Wait until workspace dir exists
  if (!fs.existsSync(WORKSPACE_DIR)) {
    log(`[watcher] Workspace dir not found: ${WORKSPACE_DIR} — retrying in 5s`);
    setTimeout(startFileWatcher, 5000);
    return;
  }

  // Filter to only files that exist right now (missing files are watched anyway)
  const watchTargets = [...WATCHED_FILES, ...WATCHED_GLOBS];
  log(`[watcher] Starting chokidar on: ${watchTargets.join(', ')}`);

  const watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
    persistent: true,
  });

  watcher.on('change', handleFileChange);
  watcher.on('add',    handleFileChange);

  // Alert on deletion of required files (edge case 9)
  watcher.on('unlink', (filePath) => {
    const name = path.basename(filePath);
    if (REQUIRED_FILES.includes(name)) {
      log(`[watcher] ⚠️  CRITICAL: Required file deleted: ${name}`);
      // Broadcast alert to all connected sessions
      for (const sessionId of sseClients.keys()) {
        sendEvent(sessionId, 'workspace-file-deleted', { file: name, severity: 'critical' });
      }
    } else {
      log(`[watcher] Optional file deleted: ${name}`);
      handleFileChange(filePath);
    }
  });

  watcher.on('error', (err) => log(`[watcher] Error: ${err}`));
  watcher.on('ready', () => log(`[watcher] Ready — watching ${WATCHED_FILES.length} files + ${WATCHED_DIRS.length} dirs (skills/, knowledge/)`));
}

// ─── Express HTTP Server ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    sessions: sessionRegistry.size,
    connected: sseClients.size,
    workspaceVersion: currentWorkspaceVersion.slice(0, 8),
    watchedFiles: WATCHED_FILES.map(f => path.basename(f)),
    timestamp: new Date().toISOString(),
  });
});

// ── Debug registry ────────────────────────────────────────────────────────────
app.get('/registry', (_req, res) => {
  const entries = Array.from(sessionRegistry.values()).map(s => ({
    ...s,
    workspaceVersion: s.workspaceVersion ? s.workspaceVersion.slice(0, 8) : null,
    secondsSinceHeartbeat: ((Date.now() - s.lastHeartbeat) / 1000).toFixed(1),
    hasSSE: sseClients.has(s.sessionId),
    reloadInProgress: reloadInProgress.get(s.sessionId) || false,
  }));
  res.json({
    sessions: entries,
    subscriptions: Array.from(subscriptions.keys()),
    currentVersion: currentWorkspaceVersion.slice(0, 8),
  });
});

// ── Heartbeat ─────────────────────────────────────────────────────────────────
/**
 * POST /heartbeat
 * Body: { sessionId, userId, channel, state, queueDepth, currentRequestId, workspaceVersion }
 *
 * Called every 5 seconds by watcher_client.py instances.
 * Server always uses its own clock for lastHeartbeat (edge case 12).
 */
app.post('/heartbeat', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  const wasKnown = sessionRegistry.has(sessionId);
  updateSession(sessionId, req.body);
  const session = sessionRegistry.get(sessionId);

  // New session or version mismatch → trigger reload if needed
  if (!wasKnown || (session.workspaceVersion && session.workspaceVersion !== currentWorkspaceVersion)) {
    const isNew = !wasKnown;
    log(`[heartbeat] ${isNew ? 'New' : 'Version mismatch'} session ${sessionId} — scheduling reload`);
    // Small delay so the SSE connection can be established first
    setTimeout(() => {
      if (sseClients.has(sessionId)) {
        triggerReloadForSession(sessionId, WATCHED_FILES.map(f => path.basename(f)), currentWorkspaceVersion);
      } else {
        log(`[heartbeat] Session ${sessionId} has no SSE yet — reload deferred until SSE connect`);
      }
    }, 1000);
  }

  res.json({ ok: true, currentVersion: currentWorkspaceVersion.slice(0, 8) });
});

// ── SSE Event Stream ──────────────────────────────────────────────────────────
/**
 * GET /events/:sessionId
 *
 * Long-lived SSE connection. Each session may have only one connection at a time.
 * The watcher pushes events here; the client reads them and reacts.
 */
app.get('/events/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.flushHeaders();

  // Replace any existing SSE connection for this session
  const existing = sseClients.get(sessionId);
  if (existing) {
    log(`[sse] Replacing existing SSE connection for session ${sessionId}`);
    existing.end();
  }

  sseClients.set(sessionId, res);
  log(`[sse] Session connected: ${sessionId} (total: ${sseClients.size})`);

  // Send connected confirmation
  const data = JSON.stringify({ event: 'connected', sessionId, currentVersion: currentWorkspaceVersion.slice(0, 8) });
  res.write(`event: connected\ndata: ${data}\n\n`);

  // Keep-alive ping every 15s
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15_000);

  // Check if this session needs an immediate reload (version mismatch)
  const session = sessionRegistry.get(sessionId);
  if (session && session.workspaceVersion && session.workspaceVersion !== currentWorkspaceVersion) {
    log(`[sse] Session ${sessionId} connected with stale version — triggering reload`);
    setTimeout(() => {
      triggerReloadForSession(sessionId, WATCHED_FILES.map(f => path.basename(f)), currentWorkspaceVersion);
    }, 500);
  }

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(sessionId);
    log(`[sse] Session disconnected: ${sessionId} (total: ${sseClients.size})`);
  });
});

// ── Event Acknowledgments ─────────────────────────────────────────────────────
/**
 * POST /event/:sessionId/:eventName
 * Body: varies by event
 *
 * Events sent by watcher_client.py back to the watcher:
 *   request-complete  → { requestId }
 *   reload-complete   → { workspaceVersion, error? }
 *   context-reloaded  → { error? }
 *
 * Each fires the corresponding subscription callback (resolves the state machine step).
 */
app.post('/event/:sessionId/:eventName', (req, res) => {
  const { sessionId, eventName } = req.params;
  const data = req.body || {};

  log(`[event] ${sessionId} → ${eventName}`, data.error ? `(error: ${data.error})` : '');

  switch (eventName) {
    case 'request-complete': {
      const requestId = data.requestId;
      if (!requestId) {
        return res.status(400).json({ error: 'requestId required for request-complete' });
      }
      // Update session state back to idle/active depending on queue depth
      const session = sessionRegistry.get(sessionId);
      if (session) {
        session.currentRequestId = null;
      }
      const key = `${sessionId}:request-complete:${requestId}`;
      resolveSubscription(key);
      break;
    }

    case 'reload-complete': {
      // Update the session's known workspace version
      const session = sessionRegistry.get(sessionId);
      if (session && data.workspaceVersion) {
        session.workspaceVersion = data.workspaceVersion;
      }
      if (data.error) {
        log(`[event] reload-complete with error for ${sessionId}: ${data.error}`);
        // Still resolve so we don't hang
      }
      resolveSubscription(`${sessionId}:reload-complete`);
      break;
    }

    case 'context-reloaded': {
      if (data.error) {
        log(`[event] context-reloaded with error for ${sessionId}: ${data.error}`);
      }
      resolveSubscription(`${sessionId}:context-reloaded`);
      break;
    }

    default:
      return res.status(400).json({ error: `Unknown event: ${eventName}` });
  }

  res.json({ ok: true });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

app.listen(PORT, '0.0.0.0', () => {
  log(`OpenClaw Workspace Watcher listening on port ${PORT}`);
  log(`Workspace dir: ${WORKSPACE_DIR}`);
  log(`Stale session timeout: ${STALE_SESSION_MS}ms`);
  log(`Debounce: ${DEBOUNCE_MS}ms | Rate limit: ${RATE_LIMIT_MS}ms`);
  startFileWatcher();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received — shutting down');
  for (const res of sseClients.values()) res.end();
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  for (const res of sseClients.values()) res.end();
  process.exit(0);
});

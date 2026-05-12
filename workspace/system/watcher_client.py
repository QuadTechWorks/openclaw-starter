#!/usr/bin/env python3
"""
OpenClaw Workspace Watcher Client
===================================
Runs inside the openclaw-gateway container as a long-lived background daemon.

Responsibilities:
  1. Sends a heartbeat to the watcher service every 5 seconds, including
     - current session state (idle / active / queued)
     - current workspace version hash
  2. Maintains a persistent SSE connection to receive reload events:
        reload-workspace  → reload all 6 workspace files into shared state
        reload-context    → reload user memory / session log files
        pause-queue       → pause the request queue
        resume-queue      → resume the request queue
        workspace-file-deleted → log alert about missing required file
  3. Posts acknowledgment events back to the watcher:
        request-complete  → watcher knows it can proceed after active request
        reload-complete   → watcher advances the state machine
        context-reloaded  → watcher resumes the queue

Usage (standalone daemon, called by startup script):
  python3 watcher_client.py [--session-id <id>] [--channel <channel>] \\
                             [--user-id <uid>] [--watcher-url <url>]

When imported as a module:
  from watcher_client import WatcherClient, session_context, request_queue
  # session_context is a thread-safe dict populated with workspace file contents
  # request_queue is the RequestQueue instance
"""

import os
import sys
import json
import time
import glob
import signal
import hashlib
import logging
import argparse
import threading
import traceback
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [watcher_client] %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger('watcher_client')

# ─── Configuration ────────────────────────────────────────────────────────────

WORKSPACE_DIR    = os.environ.get('WORKSPACE_DIR',   '/home/node/.openclaw/workspace')
WATCHER_URL      = os.environ.get('WATCHER_URL',     'http://openclaw-watcher:18791')
HEARTBEAT_EVERY  = int(os.environ.get('HEARTBEAT_EVERY',  '5'))    # seconds
SSE_RETRY_DELAY  = int(os.environ.get('SSE_RETRY_DELAY',  '5'))    # seconds
CHANNEL_DEFAULT  = os.environ.get('OPENCLAW_CHANNEL', 'webchat')

WORKSPACE_FILES = [
    'AGENTS.md',
    'SOUL.md',
    'MEMORY.md',
    'TOOLS.md',
    'IDENTITY.md',
    'HEARTBEAT.md',
]

# ─── Shared State (module-level, thread-safe via lock) ───────────────────────

_state_lock = threading.Lock()

session_context: Dict[str, Any] = {}
"""Populated with workspace file contents after each reload."""

_session_state = {
    'state':            'idle',   # idle | active | queued
    'queue_depth':      0,
    'current_request_id': None,
    'workspace_version': None,
    'session_id':       None,
    'user_id':          'unknown',
    'channel':          CHANNEL_DEFAULT,
}

# ─── Workspace Version Hash ───────────────────────────────────────────────────

def compute_workspace_version() -> str:
    h = hashlib.sha256()
    for fname in WORKSPACE_FILES:
        fpath = os.path.join(WORKSPACE_DIR, fname)
        try:
            with open(fpath, 'rb') as f:
                h.update(f.read())
        except FileNotFoundError:
            pass
    return h.hexdigest()


# ─── Session State API (call from request processing code) ───────────────────

def mark_request_start(request_id: str):
    """Call when you start processing a request."""
    with _state_lock:
        qd = _session_state['queue_depth']
        _session_state['state'] = 'queued' if qd > 1 else 'active'
        _session_state['current_request_id'] = request_id

def mark_request_complete(request_id: str):
    """Call when a request finishes. Notifies the watcher."""
    with _state_lock:
        _session_state['current_request_id'] = None
        qd = _session_state['queue_depth']
        _session_state['state'] = 'idle' if qd == 0 else 'active'

    _post_event('request-complete', {'requestId': request_id})

def set_queue_depth(depth: int):
    with _state_lock:
        _session_state['queue_depth'] = depth
        if depth == 0:
            _session_state['state'] = 'idle'
        elif _session_state['state'] == 'idle':
            _session_state['state'] = 'active'


# ─── HTTP Helpers ─────────────────────────────────────────────────────────────

def _http_post(path: str, payload: dict, timeout: int = 5) -> Optional[dict]:
    url = f"{WATCHER_URL.rstrip('/')}{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log.warning(f"POST {path} failed: {e}")
        return None


def _post_event(event_name: str, payload: dict):
    sid = _session_state.get('session_id', 'unknown')
    _http_post(f'/event/{sid}/{event_name}', payload)


# ─── File Reload Logic ────────────────────────────────────────────────────────

def reload_all_workspace_files():
    """Read all 6 workspace files into session_context."""
    errors = []
    with _state_lock:
        for fname in WORKSPACE_FILES:
            fpath = os.path.join(WORKSPACE_DIR, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    session_context[fname] = f.read()
            except FileNotFoundError:
                session_context[fname] = None
                if fname in ('AGENTS.md', 'SOUL.md'):
                    errors.append(f'Required file missing: {fname}')
            except Exception as e:
                errors.append(f'Failed to read {fname}: {e}')
                raise

    if errors:
        for err in errors:
            log.warning(err)

    log.info('Workspace files reloaded into session_context')


def reload_context(channel: str, user_id: str):
    """Reload user-specific memory and recent session logs."""
    try:
        # User memory
        memory_path = os.path.join(
            WORKSPACE_DIR, 'memory', 'users', channel, user_id, 'MEMORY.md'
        )
        if os.path.exists(memory_path):
            with open(memory_path, 'r', encoding='utf-8') as f:
                session_context['user_memory'] = f.read()
        else:
            session_context['user_memory'] = None

        # Recent session logs (last 3 by mtime)
        logs_dir = os.path.join(
            WORKSPACE_DIR, 'memory', 'users', channel, user_id, 'sessions'
        )
        if os.path.exists(logs_dir):
            all_logs = sorted(
                glob.glob(os.path.join(logs_dir, '*.md')),
                key=os.path.getmtime,
                reverse=True,
            )[:3]
            session_context['recent_history'] = []
            for lp in all_logs:
                with open(lp, 'r', encoding='utf-8') as f:
                    session_context['recent_history'].append(f.read())

        log.info('Context reloaded (user memory + session logs)')

    except Exception as e:
        log.error(f'Context reload failed: {e}')
        raise


# ─── Reload Signal File ───────────────────────────────────────────────────────

# ─── Workspace Version Bulletin ──────────────────────────────────────────────
#
# Non-consumable version file checked by ALL agent sessions independently.
# Each session compares its own last-known version against the version in this
# file. If different → session re-reads workspace files and notes the new version.
#
# CRITICAL: This file is NEVER deleted. Multiple sessions (WhatsApp, Teams,
# webchat, cron) all read it concurrently. Deleting it would cause other
# sessions to miss the reload signal.
#
# Written to /tmp so it works regardless of whether the workspace is mounted
# read-only. The AI agent (running inside openclaw-gateway) can always read /tmp.

VERSION_BULLETIN_PATH = os.environ.get(
    'WATCHER_VERSION_BULLETIN_PATH', '/tmp/workspace-version-bulletin'
)


def _write_reload_signal(workspace_version: str, changed_files: list):
    """
    Write/overwrite the workspace version bulletin.

    This is NOT a consumable signal — it persists until the next change
    overwrites it. Every session independently compares its own version
    against the version in this file to decide whether to reload.
    """
    try:
        payload = {
            'workspaceVersion': workspace_version,
            'changedFiles': changed_files,
            'timestamp': time.time(),
            'shortVersion': workspace_version[:8],
        }
        # Atomic write: write to temp file, then rename (prevents partial reads)
        tmp_path = VERSION_BULLETIN_PATH + '.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
        os.replace(tmp_path, VERSION_BULLETIN_PATH)
        log.info(f'[signal] Updated version bulletin → {workspace_version[:8]}')
    except Exception as e:
        log.warning(f'[signal] Failed to write version bulletin: {e}')


def get_current_version() -> Optional[str]:
    """
    Read the current workspace version from the bulletin file.
    Returns the short (8-char) version hash, or None if no bulletin exists.
    """
    try:
        if os.path.exists(VERSION_BULLETIN_PATH):
            with open(VERSION_BULLETIN_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('shortVersion') or data.get('workspaceVersion', '')[:8]
    except Exception:
        pass
    return None


def check_reload_needed(session_version: Optional[str]) -> Optional[dict]:
    """
    Check if a session with the given workspace version needs to reload.

    Args:
        session_version: The short version hash the session last loaded.
                         Pass None if the session has never loaded.

    Returns:
        The bulletin dict if a reload is needed, None otherwise.
    """
    try:
        if os.path.exists(VERSION_BULLETIN_PATH):
            with open(VERSION_BULLETIN_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            bulletin_version = data.get('shortVersion') or data.get('workspaceVersion', '')[:8]
            if session_version is None or bulletin_version != session_version:
                return data
    except Exception:
        pass
    return None


# ─── Request Queue with Pause / Resume ───────────────────────────────────────

class RequestQueue:
    """
    Simple FIFO queue with pause/resume support for state-aware reloads.

    Usage:
        request_queue.enqueue(request)   # add a request
        # processing is automatic once the queue is running
    """

    def __init__(self):
        self._queue: list = []
        self._lock  = threading.Lock()
        self._paused_event  = threading.Event()
        self._paused_event.set()    # not paused initially
        self._processing    = False

    def enqueue(self, request: dict):
        """Add a request. Starts processing if idle and not paused."""
        with self._lock:
            request_id = request.get('id', str(time.time()))
            request['id'] = request_id
            self._queue.append(request)
            depth = len(self._queue)

        set_queue_depth(depth)
        log.debug(f'[queue] Enqueued {request_id} (depth={depth})')

        if not self._processing:
            threading.Thread(target=self._run, daemon=True).start()

    def pause(self):
        log.info('[queue] Paused')
        self._paused_event.clear()

    def resume(self):
        log.info('[queue] Resumed')
        self._paused_event.set()

    def _run(self):
        self._processing = True
        try:
            while True:
                # Wait if paused
                self._paused_event.wait()

                with self._lock:
                    if not self._queue:
                        break
                    request = self._queue[0]

                mark_request_start(request['id'])
                log.info(f'[queue] Processing request {request["id"]}')

                try:
                    handler = request.get('handler')
                    if callable(handler):
                        handler(request)
                    else:
                        log.warning(f'[queue] No handler for request {request["id"]}')
                except Exception as e:
                    log.error(f'[queue] Request {request["id"]} failed: {e}')
                finally:
                    mark_request_complete(request['id'])
                    with self._lock:
                        if self._queue and self._queue[0]['id'] == request['id']:
                            self._queue.pop(0)
                    set_queue_depth(len(self._queue))
        finally:
            self._processing = False


# Module-level queue instance
request_queue = RequestQueue()


# ─── SSE Client ──────────────────────────────────────────────────────────────

def _handle_sse_event(event_name: str, data: dict):
    """Dispatch a single SSE event to the appropriate handler."""
    log.info(f'[sse] Received event: {event_name}')

    if event_name == 'reload-workspace':
        changed_files    = data.get('changedFiles', [])
        workspace_version = data.get('workspaceVersion', '')
        try:
            reload_all_workspace_files()
            with _state_lock:
                _session_state['workspace_version'] = workspace_version
            _write_reload_signal(workspace_version, changed_files)
            _post_event('reload-complete', {
                'workspaceVersion': workspace_version,
            })
            log.info(f'[sse] reload-complete → version {workspace_version[:8]}')
        except Exception as e:
            log.error(f'[sse] reload-workspace failed: {e}')
            _post_event('reload-complete', {
                'workspaceVersion': workspace_version,
                'error': str(e),
            })

    elif event_name == 'reload-context':
        channel  = _session_state.get('channel', CHANNEL_DEFAULT)
        user_id  = _session_state.get('user_id', 'unknown')
        try:
            reload_context(channel, user_id)
            _post_event('context-reloaded', {})
        except Exception as e:
            log.error(f'[sse] context reload failed: {e}')
            _post_event('context-reloaded', {'error': str(e)})

    elif event_name == 'pause-queue':
        request_queue.pause()

    elif event_name == 'resume-queue':
        request_queue.resume()

    elif event_name == 'workspace-file-deleted':
        file_name = data.get('file', '?')
        severity  = data.get('severity', 'warning')
        log.error(f'[sse] WORKSPACE FILE DELETED: {file_name} (severity={severity}). '
                  'Restore from backup or git history immediately.')

    elif event_name == 'connected':
        log.info(f'[sse] Connected to watcher. Server version: {data.get("currentVersion", "?")}')

    # Silently ignore keepalive / unknown events


def _parse_sse_line(line: str, current_event: dict) -> Optional[dict]:
    """Parse one SSE line. Returns a complete event dict when an event is ready."""
    line = line.strip()
    if not line:
        # Empty line → dispatch event (if we have data)
        if current_event.get('data'):
            return current_event.copy()
        return None
    if line.startswith(':'):
        return None   # Comment / keepalive
    if ':' in line:
        field, _, value = line.partition(':')
        current_event[field.strip()] = value.strip()
    return None


def _sse_loop(session_id: str):
    """Blocking SSE loop. Reconnects indefinitely on disconnect."""
    url = f"{WATCHER_URL.rstrip('/')}/events/{session_id}"

    while True:
        log.info(f'[sse] Connecting to {url}')
        try:
            req = urllib.request.Request(url, headers={'Accept': 'text/event-stream'})
            with urllib.request.urlopen(req, timeout=None) as resp:
                current_event: dict = {}
                for raw_line in resp:
                    line = raw_line.decode('utf-8', errors='replace')
                    event = _parse_sse_line(line, current_event)
                    if event is not None:
                        event_name = event.get('event', 'message')
                        try:
                            data = json.loads(event.get('data', '{}'))
                        except json.JSONDecodeError:
                            data = {}
                        _handle_sse_event(event_name, data)
                        current_event = {}

        except urllib.error.URLError as e:
            log.warning(f'[sse] Connection lost: {e} — reconnecting in {SSE_RETRY_DELAY}s')
        except Exception as e:
            log.warning(f'[sse] Unexpected error: {e} — reconnecting in {SSE_RETRY_DELAY}s')

        time.sleep(SSE_RETRY_DELAY)


# ─── Heartbeat Loop ───────────────────────────────────────────────────────────

def _heartbeat_loop():
    """Sends a heartbeat to the watcher every HEARTBEAT_EVERY seconds."""
    while True:
        try:
            with _state_lock:
                payload = {
                    'sessionId':       _session_state['session_id'],
                    'userId':          _session_state['user_id'],
                    'channel':         _session_state['channel'],
                    'state':           _session_state['state'],
                    'queueDepth':      _session_state['queue_depth'],
                    'currentRequestId': _session_state['current_request_id'],
                    'workspaceVersion': _session_state['workspace_version'],
                }
            resp = _http_post('/heartbeat', payload)
            if resp:
                server_ver = resp.get('currentVersion', '?')
                if (_session_state['workspace_version'] and
                        _session_state['workspace_version'][:8] != server_ver):
                    log.info(f'[heartbeat] Version drift detected — local: '
                             f'{str(_session_state["workspace_version"])[:8]} server: {server_ver}')
        except Exception as e:
            log.warning(f'[heartbeat] Failed: {e}')

        time.sleep(HEARTBEAT_EVERY)


# ─── Main entry ───────────────────────────────────────────────────────────────

def run(session_id: str, user_id: str = 'unknown', channel: str = CHANNEL_DEFAULT):
    """
    Start the watcher client. This function blocks forever.
    Call from a daemon thread or from the main process.
    """
    with _state_lock:
        _session_state['session_id']       = session_id
        _session_state['user_id']          = user_id
        _session_state['channel']          = channel
        _session_state['workspace_version'] = compute_workspace_version()

    # Do an initial load of workspace files into session_context
    try:
        reload_all_workspace_files()
        log.info('[init] Workspace files loaded into session_context')
    except Exception as e:
        log.warning(f'[init] Initial workspace load failed: {e}')

    # Start heartbeat thread
    hb = threading.Thread(target=_heartbeat_loop, daemon=True, name='heartbeat')
    hb.start()

    # SSE loop runs in this thread (blocks)
    log.info(f'[init] Starting watcher client — session={session_id} channel={channel}')
    _sse_loop(session_id)


def main():
    global WATCHER_URL  # declared first — used below before assignment

    parser = argparse.ArgumentParser(description='OpenClaw Workspace Watcher Client')
    parser.add_argument('--session-id',  default=os.environ.get('OPENCLAW_SESSION_ID', f'session-{os.getpid()}'))
    parser.add_argument('--user-id',     default=os.environ.get('OPENCLAW_USER_ID', 'unknown'))
    parser.add_argument('--channel',     default=os.environ.get('OPENCLAW_CHANNEL', CHANNEL_DEFAULT))
    parser.add_argument('--watcher-url', default=WATCHER_URL)
    args = parser.parse_args()

    # Override global from CLI arg
    WATCHER_URL = args.watcher_url

    def _shutdown(sig, _frame):
        log.info(f'Received signal {sig} — exiting')
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    # Run forever — if this exits it's a fatal error
    try:
        run(session_id=args.session_id, user_id=args.user_id, channel=args.channel)
    except Exception as e:
        log.critical(f'Fatal error in watcher client: {e}\n{traceback.format_exc()}')
        sys.exit(1)


if __name__ == '__main__':
    main()

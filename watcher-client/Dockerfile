FROM python:3.11-slim

LABEL maintainer="OpenClaw"
LABEL description="Watcher client daemon — connects to openclaw-watcher and handles workspace reload events"

# No extra dependencies needed — watcher_client.py uses only stdlib
WORKDIR /app

# Non-root user
RUN addgroup --system watcher && adduser --system --ingroup watcher watcher

# The actual client lives in the workspace volume (mounted at runtime).
# This script is the entrypoint — it waits for the workspace mount then launches.
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER watcher

# Health check: watcher service reachable (shell form so WATCHER_URL env var is resolved at runtime)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD python3 -c "import urllib.request,sys,os; r=urllib.request.urlopen(os.environ.get('WATCHER_URL','http://openclaw-watcher:18791')+'/health',timeout=4); sys.exit(0 if r.status==200 else 1)"

CMD ["/app/entrypoint.sh"]

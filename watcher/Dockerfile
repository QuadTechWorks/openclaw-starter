FROM node:18-alpine

LABEL maintainer="OpenClaw"
LABEL description="Workspace file watcher and reload orchestrator"

WORKDIR /app

# Copy package files first for layer caching
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy watcher source
COPY watcher.js ./

# Non-root user for security
RUN addgroup -S watcher && adduser -S watcher -G watcher
USER watcher

# Health check using the /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18791/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 18791

CMD ["node", "watcher.js"]

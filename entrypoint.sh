#!/bin/sh
set -e

if [ -f /requirements.txt ]; then
    HASH_FILE="/home/node/.local/.requirements.hash"
    CURRENT_HASH=$(sha256sum /requirements.txt | cut -d' ' -f1)
    STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

    if [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
        echo "[entrypoint] Python dependencies up to date — skipping install."
    else
        echo "[entrypoint] Installing Python dependencies..."

        if command -v pip3 > /dev/null 2>&1; then
            PIP=pip3
        elif command -v pip > /dev/null 2>&1; then
            PIP=pip
        elif python3 -m pip --version > /dev/null 2>&1; then
            PIP="python3 -m pip"
        else
            echo "[entrypoint] pip not found — installing via get-pip.py..."
            curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages
            PIP="python3 -m pip"
        fi

        mkdir -p "$(dirname "$HASH_FILE")"
        $PIP install --no-cache-dir --break-system-packages --user -r /requirements.txt
        echo "$CURRENT_HASH" > "$HASH_FILE"
        echo "[entrypoint] Python dependencies installed."
    fi
fi

exec "$@"

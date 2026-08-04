#!/bin/bash
# Tenant Property Configuration Tool — local startup script
# Usage: ./run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
  echo "[run.sh] Creating virtualenv..."
  python3 -m venv venv
  source venv/bin/activate
  pip install --quiet -r requirements.txt
else
  source venv/bin/activate
fi

echo ""
echo "  ◈ SOL Tenant Property Configuration Tool"
echo "  → http://127.0.0.1:5065"
echo "  → Ctrl+C to stop"
echo ""

python3 app.py

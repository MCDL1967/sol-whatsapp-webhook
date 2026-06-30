#!/bin/bash
# LOGS v2 — local startup script
# Usage: ./run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create runtime dir if missing
mkdir -p ../logs_v2_runtime

# Install deps if venv not present
if [ ! -d "venv" ]; then
  echo "[run.sh] Creating virtualenv..."
  python3 -m venv venv
  source venv/bin/activate
  pip install --quiet -r requirements.txt
else
  source venv/bin/activate
fi

# Init DB
python3 -c "from logs_db import init_db; init_db()"

echo ""
echo "  ◈ LOGS v2 — SOL Ops Panel"
echo "  → http://127.0.0.1:5050"
echo "  → /seed to load demo data"
echo "  → Ctrl+C to stop"
echo ""

python3 logs_app.py

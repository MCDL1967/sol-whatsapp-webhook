#!/bin/bash
set -euo pipefail

# LOGS v2 sync runner
# Patch marker:
# - 2026-04-15
# - processes latest JSONL from inbox
# - runs ingest
# - exports all views
# - moves successfully processed JSONL to processed/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source venv/bin/activate

INBOX_DIR="/Users/MCDL1/Desktop/ICT_PROJECTS/1. SOL_PROJECT/middleware/LOGS/runtime/inbox"
PROCESSED_DIR="/Users/MCDL1/Desktop/ICT_PROJECTS/1. SOL_PROJECT/middleware/LOGS/runtime/processed"

mkdir -p "$PROCESSED_DIR"

LATEST_JSONL="$(ls -t "$INBOX_DIR"/*.jsonl 2>/dev/null | head -n 1 || true)"

if [ -z "${LATEST_JSONL:-}" ]; then
  echo "[sync] No JSONL found in: $INBOX_DIR"
  exit 1
fi

if [ ! -f "$LATEST_JSONL" ]; then
  echo "[sync] Latest JSONL path is invalid: $LATEST_JSONL"
  exit 1
fi

BASENAME="$(basename "$LATEST_JSONL")"
DEST_PATH="$PROCESSED_DIR/$BASENAME"

if [ -e "$DEST_PATH" ]; then
  TS="$(date +%Y%m%d_%H%M%S)"
  DEST_PATH="$PROCESSED_DIR/${BASENAME%.jsonl}_$TS.jsonl"
fi

echo "[sync] Latest JSONL: $LATEST_JSONL"

python3 logs_ingest.py "$LATEST_JSONL"
python3 logs_export.py all

mv "$LATEST_JSONL" "$DEST_PATH"

echo "[sync] Moved processed file to: $DEST_PATH"
echo "[sync] Done."
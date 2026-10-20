#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/astraverse"
python3 -c 'import sys; assert sys.version_info >= (3, 12), "需要 Python 3.12+"'
python3 -m venv "$API/.venv"
"$API/.venv/bin/python" -m pip install -r "$API/requirements.lock.txt"
"$API/.venv/bin/python" -m pip install --no-deps -e "$API"
npm --prefix "$ROOT/apps/astraverse-web" ci

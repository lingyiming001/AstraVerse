#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -x "$ROOT/apps/astraverse/.venv/bin/python" || ! -f "$ROOT/apps/astraverse-web/node_modules/vite/bin/vite.js" ]]; then
  echo '请先运行 bash deploy/setup.sh 安装应用依赖。' >&2
  exit 1
fi
npm --prefix "$ROOT/apps/astraverse-web" run build
exec python3 "$ROOT/deploy/local.py" restart

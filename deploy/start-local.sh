#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d .venv ]]; then
  echo '请先按 README 安装 Python 依赖。'
  exit 1
fi
npm run build
printf '\n请保持 Python API 运行于 127.0.0.1:8000。构建版即将在 127.0.0.1:5174 启动。\n'
exec npm start

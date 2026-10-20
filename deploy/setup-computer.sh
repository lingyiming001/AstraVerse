#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" ]]; then echo '当前电脑操作适配器需要 macOS 14+。' >&2; exit 1; fi
command -v swiftc >/dev/null || { echo '请先安装 Xcode Command Line Tools。' >&2; exit 1; }
mkdir -p "$ROOT/.local/bin"
swiftc -parse-as-library -O "$ROOT/deploy/computer-bridge.swift" -o "$ROOT/.local/bin/computer-bridge"
printf '%s\n' '电脑操作桥接器已安装；请在系统设置中检查屏幕录制与辅助功能权限。'

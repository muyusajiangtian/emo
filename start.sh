#!/bin/bash
echo "========================================"
echo "  语音情绪虚拟头部 V3 - FACS驱动系统"
echo "  Voice Emotion Virtual Head V3"
echo "========================================"
echo ""

cd "$(dirname "$0")"

if command -v python3 &> /dev/null; then
    echo "[启动] 使用 Python HTTP 服务器..."
    echo "[地址] http://localhost:8080"
    echo "[提示] 按 Ctrl+C 停止服务器"
    echo ""
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    echo "[启动] 使用 Python HTTP 服务器..."
    echo "[地址] http://localhost:8080"
    python -m http.server 8080
elif command -v npx &> /dev/null; then
    echo "[启动] 使用 npx serve..."
    echo "[地址] http://localhost:8080"
    npx serve -l 8080
else
    echo "[错误] 未找到 Python 或 Node.js"
    echo "[安装] 请安装 Python 或 Node.js"
fi

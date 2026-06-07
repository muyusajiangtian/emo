@echo off
chcp 65001 >nul
echo ========================================
echo   语音情绪虚拟头部 V3 - FACS驱动系统
echo   Voice Emotion Virtual Head V3
echo ========================================
echo.

:: 检查Python http.server是否可用
where python >nul 2>&1
if %errorlevel% == 0 (
    echo [启动] 使用 Python HTTP 服务器...
    echo [地址] http://localhost:8080
    echo [提示] 按 Ctrl+C 停止服务器
    echo.
    cd /d "%~dp0"
    python -m http.server 8080
    goto :end
)

:: 检查npx是否可用
where npx >nul 2>&1
if %errorlevel% == 0 (
    echo [启动] 使用 npx serve...
    echo [地址] http://localhost:8080
    echo.
    cd /d "%~dp0"
    npx serve -l 8080
    goto :end
)

:: 都没有则提示
echo [错误] 未找到 Python 或 Node.js
echo [安装] 请安装以下任一工具:
echo   - Python: https://www.python.org/downloads/
echo   - Node.js: https://nodejs.org/
echo.
pause

:end

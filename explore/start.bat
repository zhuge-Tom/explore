@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Explore - 哪里不懂点哪里
echo ============================================

if not exist node_modules (
  echo [首次运行] 正在安装依赖,可能需要几分钟...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败,请手动运行 npm install
    pause
    exit /b 1
  )
)

if not exist prisma\dev.db (
  echo [首次运行] 正在初始化数据库...
  call npm run db:push
) else (
  rem 每次启动自动备份数据库,保留最近 7 份
  if not exist backups mkdir backups
  for /f "tokens=1-3 delims=/- " %%a in ("%date%") do set TODAY=%%a%%b%%c
  copy /y prisma\dev.db "backups\dev-%TODAY%.db" >nul 2>nul
  for /f "skip=7 delims=" %%f in ('dir /b /o-d backups\dev-*.db 2^>nul') do del "backups\%%f" >nul 2>nul
)

findstr /r "^ANTHROPIC_API_KEY=sk" .env >nul 2>nul
if errorlevel 1 (
  echo.
  echo [提示] .env 中尚未配置 ANTHROPIC_API_KEY
  echo        卡片生成功能不可用,请编辑 .env 填入 Key 后重启
  echo.
)

echo 启动中... 浏览器将自动打开 http://localhost:3000
start "" "http://localhost:3000"
call npm run dev
pause

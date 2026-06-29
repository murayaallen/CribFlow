@echo off
echo Starting RentFlow...
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo Node.js not found. Opening with Python fallback...
  python -m http.server 5500 --directory "%~dp0"
  goto end
)
cd /d "%~dp0"
npx --yes serve . -p 5500 -c serve.json
:end
pause

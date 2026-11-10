@echo off
setlocal
cd /d "%~dp0"
set "KOMY_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "KOMY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%KOMY_NODE%" --version >nul 2>nul
if errorlevel 1 (
 echo Node.js 24 or newer is required. Install from https://nodejs.org
 pause
 exit /b 1
)
"%KOMY_NODE%" build.mjs
if errorlevel 1 (
 pause
 exit /b 1
)
"%KOMY_NODE%" local-server.mjs --open
if errorlevel 1 pause

@echo off
set FULL_LOCAL_MODE=true
set WRITE_LOCAL_JSON=true
set LOCAL_TEST=true
echo 正在以完全本地模式运行updater.mjs脚本...
echo FULL_LOCAL_MODE=%FULL_LOCAL_MODE%
echo WRITE_LOCAL_JSON=%WRITE_LOCAL_JSON%
echo LOCAL_TEST=%LOCAL_TEST%
node scripts/updater.mjs
pause 

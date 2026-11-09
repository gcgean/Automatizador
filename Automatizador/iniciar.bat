@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 goto erro
)
call npm start
if errorlevel 1 goto erro
exit /b 0
:erro
echo.
echo Nao foi possivel iniciar. Confira a mensagem acima.
pause

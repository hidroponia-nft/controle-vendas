@echo off
cd /d "%~dp0"
echo ============================================
echo   Atualizando a planilha do app...
echo ============================================
echo.
if not exist node_modules (
  echo Primeira vez: instalando os componentes ^(so agora, demora um pouco^)...
  call npm install
  echo.
)
node exportar.js
echo.
echo Pode fechar esta janela.
pause

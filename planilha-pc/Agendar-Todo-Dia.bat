@echo off
cd /d "%~dp0"
echo Agendando a atualizacao automatica da planilha para TODO DIA as 07:00...
schtasks /Create /SC DAILY /ST 07:00 /TN "PlanilhaHidroponia" /TR "\"%~dp0_exportar-silencioso.bat\"" /F
echo.
if %errorlevel%==0 (
  echo Pronto! A planilha vai se atualizar sozinha todo dia as 07:00.
  echo (O computador precisa estar ligado nesse horario.)
) else (
  echo Nao consegui agendar. Tente clicar com o botao direito neste arquivo
  echo e escolher "Executar como administrador".
)
echo.
pause

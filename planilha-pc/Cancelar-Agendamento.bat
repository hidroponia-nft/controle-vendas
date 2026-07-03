@echo off
echo Removendo o agendamento automatico da planilha...
schtasks /Delete /TN "PlanilhaHidroponia" /F
echo.
pause

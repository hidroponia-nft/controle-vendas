@echo off
rem Versao sem pausa, usada pelo agendamento diario do Windows.
cd /d "%~dp0"
if not exist node_modules ( call npm install )
node exportar.js

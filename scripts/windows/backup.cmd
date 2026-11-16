@echo off
rem Gera backup do banco em backups\ (pode rodar com o servidor ligado).
rem Usado pelo Agendador de Tarefas (ver docs\DEPLOYMENT.md).
cd /d "%~dp0..\.."
if not exist logs mkdir logs
node --disable-warning=ExperimentalWarning scripts\backup.ts >> logs\backup.log 2>&1

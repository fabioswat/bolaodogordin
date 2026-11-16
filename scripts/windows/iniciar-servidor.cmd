@echo off
rem Inicia o Bolão da Virada em modo produção, gravando o log em logs\servidor.log.
rem Usado pelo Agendador de Tarefas (ver docs\DEPLOYMENT.md).
cd /d "%~dp0..\.."
if not exist logs mkdir logs
set NODE_ENV=production
node --disable-warning=ExperimentalWarning src\server\index.ts >> logs\servidor.log 2>&1

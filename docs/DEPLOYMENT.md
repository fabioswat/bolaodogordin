# Hospedagem no Windows

Ambiente: computador pessoal com Windows (o mesmo usado no dia a dia e para desenvolvimento), Node.js 24 LTS, SQLite (embutido no Node). Não precisa de Docker nem de banco separado.

## 0. Cuidados por ser o computador pessoal

- **Site no ar só com o PC ligado.** Desligado, em suspensão ou hibernando, ninguém acessa. No período de cadastros e perto do sorteio, ajuste em *Configurações → Sistema → Energia* para **nunca suspender** quando estiver na tomada.
- **Reinícios do Windows Update** derrubam o site até o servidor voltar. Use a tarefa com `-NaInicializacao` (seção 3), que sobe o servidor junto com o Windows, mesmo sem login.
- **Separe o banco real do banco de desenvolvimento.** Rode a versão em uso numa pasta própria (ex.: `C:\BolaoDaVirada`), copiada do projeto, e continue programando na pasta de desenvolvimento. Assim, testes e `npm run dev` não mexem nos dados reais. Alternativa: na pasta de desenvolvimento, use um `.env` com `DATA_DIR` diferente.
- **Use portas diferentes** se rodar as duas versões ao mesmo tempo (ex.: `PORT=3000` na versão real e `PORT=3001` no `.env` de desenvolvimento). O `npm run dev` usa a porta 5173 para a interface.
- **Faça cópia externa dos backups** (nuvem ou pendrive). Se o PC tiver um problema, o bolão não se perde.
- **Dados pessoais:** o servidor roda com seu usuário comum e só expõe a porta do bolão. Não compartilhe a pasta do projeto pela rede.

## 1. Instalação

1. Instale o **Node.js 24 LTS** (nodejs.org). Confira com `node -v` (precisa ser 24 ou superior).
2. Copie a pasta do projeto para o computador, por exemplo `C:\BolaoDaVirada`.
3. No PowerShell, dentro da pasta:

```powershell
npm ci                 # instala as dependências
npm run build          # gera a interface em dist\web
copy .env.example .env # opcional: ajuste porta, pastas etc.
npm run create-admin -- gordin "Seu Nome"
```

O último comando mostra a **senha provisória** do administrador. Ela será trocada no primeiro acesso.

## 2. Executar

```powershell
npm start
```

- No próprio computador: http://localhost:3000
- Na rede local: http://IP-DO-COMPUTADOR:3000 (veja o IP com `ipconfig`).

Para liberar o acesso pela rede local, crie a regra no firewall (PowerShell **como administrador**):

```powershell
New-NetFirewallRule -DisplayName "Bolao da Virada" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow
```

A rede deve estar marcada como **Privada** no Windows.

## 3. Iniciar automaticamente

O script abaixo cria duas tarefas no Agendador de Tarefas: o servidor (reinicia sozinho se cair) e o backup diário às 03:00.

```powershell
# Inicia quando o seu usuário fizer logon (não exige administrador):
powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-tarefas.ps1

# OU inicia junto com o Windows, mesmo sem ninguém logado (PowerShell como administrador):
powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-tarefas.ps1 -NaInicializacao
```

Comandos úteis:

```powershell
Start-ScheduledTask -TaskName "Bolao da Virada - Servidor"
Stop-ScheduledTask  -TaskName "Bolao da Virada - Servidor"
Get-Content logs\servidor.log -Tail 50
```

O servidor roda com o seu usuário comum, sem privilégios de administrador.

### Conta separada (recomendado com acesso pela internet)

Para que uma eventual falha no site não alcance seus arquivos pessoais, rode o servidor com uma conta própria do Windows, sem privilégios. Em um PowerShell **como administrador**, na pasta em uso:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\conta-servico.ps1
```

O script cria a conta `bolao`, que não aparece na tela de login e não consegue entrar no Windows. A conta tem só leitura na pasta do bolão e escrita apenas em `data`, `backups` e `logs`, e fica bloqueada na unidade D: e nas pastas pessoais de `C:\`. O script também recria as tarefas com essa conta e reinicia o servidor. Para voltar a usar o seu usuário: `instalar-tarefas.ps1 -NaInicializacao`.

## 4. Atualizar a aplicação

**Jeito fácil (recomendado):** em um PowerShell **como administrador**, dentro da pasta de **desenvolvimento**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\publicar.ps1
```

O script:
1. Roda os testes e para se algum falhar.
2. Mostra o que mudou.
3. Faz backup do banco.
4. Copia os arquivos, sem tocar em `data`, `backups`, `logs` e `.env`.
5. Gera a interface.
6. Reinicia o servidor só se o código do servidor mudou e roda `npm ci` só se as bibliotecas mudaram.
7. No final, confere se o servidor responde.

Para ver o que mudou sem alterar nada, use `-Simular`.

**Manualmente:**

```powershell
Stop-ScheduledTask -TaskName "Bolao da Virada - Servidor"
# substitua os arquivos do projeto (sem apagar data\, backups\ e .env)
npm ci
npm run build
Start-ScheduledTask -TaskName "Bolao da Virada - Servidor"
```

As migrations do banco são aplicadas automaticamente ao iniciar.

## 5. Backup e restauração

- **Automático:** diário às 03:00 (tarefa "Bolao da Virada - Backup"), em `backups\bolao-AAAAMMDD-HHMMSS.db` (horário UTC no nome). Ficam as 30 cópias mais recentes (`BACKUP_KEEP`).
- **Manual:** `npm run backup` (pode rodar com o servidor ligado; a cópia é consistente e verificada).
- **Cópia externa:** copie periodicamente a pasta `backups\` para fora do computador (pendrive ou nuvem), principalmente antes e depois do sorteio.

**Restaurar:**

```powershell
Stop-ScheduledTask -TaskName "Bolao da Virada - Servidor"
Remove-Item data\bolao.db, data\bolao.db-wal, data\bolao.db-shm -ErrorAction SilentlyContinue
Copy-Item backups\bolao-AAAAMMDD-HHMMSS.db data\bolao.db
Start-ScheduledTask -TaskName "Bolao da Virada - Servidor"
```

Teste a restauração ao menos uma vez antes do uso real (por exemplo, numa cópia da pasta do projeto, com outra `PORT`).

## 6. Acesso pela internet (opcional)

### Configuração em uso: Tailscale Funnel

Gratuito, sem domínio próprio, com HTTPS automático e endereço fixo `https://<nome-do-pc>.<tailnet>.ts.net`.

1. Instale o Tailscale (tailscale.com/download/windows) e entre na sua conta.
2. `tailscale set --unattended`: continua conectado mesmo sem usuário logado no Windows.
3. `tailscale funnel --bg 3000`: na primeira vez, abra o link exibido para autorizar o Funnel. A configuração é permanente.
4. No `.env` da versão em uso: `HOST=127.0.0.1`, `COOKIE_SECURE=true`, `TRUST_PROXY=true` e `ALLOWED_ORIGINS=https://<endereço>.ts.net`. Depois, reinicie a tarefa do servidor.

Para conferir: `tailscale funnel status`. Para desligar: `tailscale funnel --https=443 off`.
Com `HOST=127.0.0.1`, não é preciso liberar porta no firewall nem no roteador.

### Alternativa: Cloudflare Tunnel

**Cloudflare Tunnel** Funciona mesmo com CGNAT, não abre portas no roteador e fornece HTTPS. Exige um domínio gerenciado na Cloudflare (conta gratuita).

1. Instale o `cloudflared` (`winget install --id Cloudflare.cloudflared`).
2. Siga o guia oficial "Create a locally-managed tunnel" da Cloudflare: `cloudflared tunnel login`, `cloudflared tunnel create bolao`, `cloudflared tunnel route dns bolao bolao.seudominio.com.br`.
3. No arquivo de configuração do túnel, aponte o serviço para `http://localhost:3000`.
4. Instale o túnel como serviço do Windows (`cloudflared service install`).
5. No `.env` do projeto:

```env
COOKIE_SECURE=true
TRUST_PROXY=true
ALLOWED_ORIGINS=https://bolao.seudominio.com.br
```

Com `COOKIE_SECURE=true`, o login só funciona por HTTPS (pelo endereço público) ou em `http://localhost`. Se quiser acessar somente pelo túnel, use também `HOST=127.0.0.1`.

Alternativa sem domínio: DuckDNS/Dynu + abertura de porta no roteador. Não funciona sob CGNAT e exige configurar HTTPS por conta própria; por isso não é a opção recomendada.

## 7. Checklist antes de divulgar

- [ ] Administrador trocou a senha provisória.
- [ ] Bolão criado com concurso, data, preço e limite corretos.
- [ ] Backup automático gerando arquivos em `backups\` e uma restauração testada.
- [ ] Tarefa do servidor reinicia após reiniciar o computador.
- [ ] Acesso testado por outro dispositivo (rede local e, se houver, pela internet com dados móveis).
- [ ] Em acesso externo: HTTPS ativo e `COOKIE_SECURE=true`.
- [ ] Página pública conferida: não mostra nomes nem valores individuais.

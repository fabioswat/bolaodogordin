# Bolão do Gordin

Sistema web simples para organizar bolões da Mega-Sena entre conhecidos. Roda em um computador Windows com Node.js e SQLite, sem Docker e sem serviços externos.

## Funcionalidades

- **Página pública:** resumo do bolão, resultado com quadra/quina/sena, participantes, jogos e arrecadação. Para visitantes, a tabela de jogos não identifica quem cadastrou. Participantes logados do bolão veem o nome de cada jogo.
- **Área do participante:** cadastrar, editar e excluir os próprios jogos enquanto o bolão estiver aberto. Os jogos aparecem em cartões no formato de canhoto. O participante também vê o valor devido e a situação do pagamento.
- **Administração:**
  - Vários bolões, cada um com concurso, data, preço por jogo e limite de jogos.
  - Participantes de cada bolão; o admin marca os pagamentos como pagos ou pendentes.
  - Edição e exclusão de qualquer jogo, com histórico.
  - Abrir, bloquear e encerrar cadastros.
  - Cadastro manual do resultado, com conferência automática.
  - Gestão de usuários: senha provisória, desativar, redefinir senha e excluir (libera o nick e as combinações).
  - Convites: link por pessoa, de uso único e com validade; a pessoa escolhe nome, nick e senha e já entra no bolão.
- **Conta:** menu da engrenagem no canto superior direito, com "Trocar senha" e "Sair".

Regras principais: 6 dezenas de 01 a 60; sem combinação repetida dentro do mesmo bolão; valor devido = preço × jogos ativos. Detalhes em [docs/PROJECT.md](docs/PROJECT.md).

## Requisitos

- Windows (ou outro sistema com Node)
- **Node.js 24 LTS** ou superior

## Início rápido

```powershell
npm ci
npm run build
npm run create-admin -- gordin "Seu Nome"   # mostra a senha provisória
npm start                                   # http://localhost:3000
```

## Colocar no ar (publicar uma nova versão)

O site em uso roda em `C:\BolaoDaVirada`, publicado na internet pelo Tailscale Funnel. Esta pasta é só para **desenvolvimento**.

Depois de testar as mudanças aqui, abra o **PowerShell como administrador** e rode:

```powershell
cd D:\Trabalho\MeusProjetos\bolaodogordin
powershell -ExecutionPolicy Bypass -File scripts\windows\publicar.ps1
```

O script:
1. Roda os testes e para se algum falhar.
2. Faz backup do banco.
3. Copia o código, sem tocar em `data`, `backups`, `logs` e `.env`.
4. Gera a interface.
5. Reinicia o servidor e reinstala as bibliotecas só quando necessário.
6. Confere se o site responde. Terminou bem quando aparecer **"PRONTO"** em verde.

| Para… | Comando (PowerShell como administrador) |
|---|---|
| Ver o que mudou, sem alterar nada | `powershell -ExecutionPolicy Bypass -File scripts\windows\publicar.ps1 -Simular` |
| Backup manual do banco em uso | `cd C:\BolaoDaVirada; npm run backup` |
| Reiniciar o servidor em uso | `Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Start-ScheduledTask -TaskName "Bolao da Virada - Servidor"` |
| Ver o log do servidor | `Get-Content C:\BolaoDaVirada\logs\servidor.log -Tail 50` |
| Conferir o endereço público | `& "C:\Program Files\Tailscale\tailscale.exe" funnel status` |
| Tirar o site da internet | `& "C:\Program Files\Tailscale\tailscale.exe" funnel --https=443 off` |
| Colocar o site de volta | `& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3000` |
| Refazer a conta de serviço `bolao` | `cd C:\BolaoDaVirada; powershell -ExecutionPolicy Bypass -File scripts\windows\conta-servico.ps1` |

Restaurar um backup e os demais detalhes estão em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Desenvolvimento

```powershell
npm run dev        # servidor (porta do .env, 3001 aqui) + interface com recarga automática (http://localhost:5173)
npm test           # testes automatizados (regras, permissões, API)
npm run typecheck  # verificação de tipos
```

## Comandos

| Comando | Descrição |
|---|---|
| `npm start` | Servidor em produção (interface + API) |
| `npm run build` | Gera a interface em `dist/web` |
| `npm run create-admin -- <nick> "<Nome>"` | Cria administrador com senha provisória |
| `npm run backup` | Backup do banco em `backups/` |
| `npm test` | Executa os testes |
| `scripts\windows\publicar.ps1` | Publica esta versão em `C:\BolaoDaVirada` (ver acima) |

## Estrutura

```text
src/shared   regras compartilhadas (dezenas, conferência, dinheiro)
src/server   API Fastify, banco SQLite (node:sqlite), migrations
src/web      interface React + Tailwind
scripts      create-admin, backup, scripts do Windows
tests        testes automatizados
docs         documentação
data/        banco (não versionado)    backups/  cópias do banco
```

## Documentação

- [Requisitos e regras](docs/PROJECT.md)
- [Decisões tomadas](docs/DECISIONS.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Banco de dados](docs/DATABASE.md)
- [Segurança](docs/SECURITY.md)
- [Hospedagem no Windows, backup e acesso externo](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md) · [Changelog](docs/CHANGELOG.md)

> O sistema é um registro interno do bolão. Não substitui o comprovante oficial da aposta nem garante premiação.

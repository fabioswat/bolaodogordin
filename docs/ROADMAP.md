# Roadmap

Cada etapa foi concluída e testada antes da próxima.

## Etapa 0 — Planejamento ✅
- [x] Documentação revisada conforme requisitos atualizados (vários bolões, 6 dezenas, pagamento por jogo).
- [x] Decisões registradas em `DECISIONS.md`.

## Etapa 1 — Fundação ✅
- [x] Projeto Node único, scripts de desenvolvimento e produção.
- [x] SQLite (`node:sqlite`), migrations automáticas e health check.
- [x] Regras compartilhadas de dezenas com testes.

## Etapa 2 — Autenticação e usuários ✅
- [x] Login, logout, sessão, troca obrigatória de senha, limite de tentativas.
- [x] Comando `create-admin`.
- [x] Gestão de usuários pelo admin (criar, editar, redefinir senha, ativar/desativar).

## Etapa 3 — Bolões e jogos ✅
- [x] Bolões e situações (aberto/bloqueado/encerrado).
- [x] Participantes por bolão.
- [x] Jogos: cadastro, edição, exclusão lógica, duplicidade por bolão, limite, auditoria.

## Etapa 4 — Pagamentos, resultado e página pública ✅
- [x] Valor devido por jogo ativo, marcar pago/pendente.
- [x] Cadastro de resultado e conferência (quadra/quina/sena).
- [x] Página pública sem identificação de donos.

## Etapa 5 — Interface ✅
- [x] Página pública, área do participante, área administrativa e histórico.
- [x] Cartões em formato de canhoto; layout responsivo (verificado em 1280px e 400px).

## Etapa 6 — Operação ✅
- [x] Backup consistente com rotação e verificação de integridade.
- [x] Scripts do Windows e tarefas agendadas (servidor e backup).
- [x] Guia de acesso externo (Cloudflare Tunnel).

## Próximos passos (no computador definitivo)
- [ ] Instalar seguindo `DEPLOYMENT.md` e criar o administrador.
- [ ] Testar restauração de backup e reinício do computador.
- [ ] Configurar acesso externo, se desejado.

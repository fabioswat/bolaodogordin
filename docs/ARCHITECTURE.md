# Arquitetura

## Princípios

- Uma única aplicação Node (monólito), um único `package.json`, uma única porta.
- Regras de negócio e autorização sempre no servidor; a interface só antecipa validações.
- SQLite local em `data/`, backup por cópia consistente (`VACUUM INTO`).
- Sem dependências externas em tempo de execução (nenhuma API de terceiros).

## Stack

| Parte | Tecnologia |
|---|---|
| Runtime | Node.js 24 LTS (executa `.ts` diretamente) |
| Servidor | Fastify 5 + `@fastify/cookie` + `@fastify/static` |
| Banco | SQLite via `node:sqlite` (embutido no Node) |
| Senhas | `bcryptjs` |
| Interface | React 19 + Vite + Tailwind CSS 4 |
| Testes | `node:test` (embutido), testes de API via `fastify.inject` |

## Estrutura

```text
bolaodogordin/
├── src/
│   ├── shared/          Regras compartilhadas (dezenas, conferência, dinheiro)
│   ├── server/
│   │   ├── config.ts    Variáveis de ambiente (.env)
│   │   ├── db.ts        Conexão, migrations, transações
│   │   ├── migrations/  SQL numerado
│   │   ├── auth.ts      Senhas, sessões, limite de tentativas
│   │   ├── http.ts      Erros HTTP e validação de entradas
│   │   ├── services/    Regras de usuários, bolões, pagamentos, jogos, auditoria
│   │   ├── app.ts       Fastify: segurança, rotas da API e arquivos da interface
│   │   └── index.ts     Ponto de entrada
│   └── web/             Interface React (lib/, components/, pages/)
├── scripts/             create-admin, backup, dev, windows/ (tarefas agendadas)
├── tests/               Testes automatizados
├── data/                Banco (não versionado)
├── backups/             Cópias do banco (não versionado)
└── docs/
```

## Fluxo

- Desenvolvimento: Vite (porta 5173) faz proxy de `/api` para o servidor (porta 3000).
- Produção: `npm run build` gera `dist/web`; o servidor serve a interface e a API na mesma porta.

## Rotas da API (resumo)

- Público: `GET /api/public/pools`, `GET /api/public/pools/:id`.
- Autenticação: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`.
- Participante: `GET /api/me/pools`, `GET|POST /api/me/pools/:id/games`, `PUT|DELETE /api/me/games/:id`.
- Admin: `/api/admin/pools` (CRUD, situação, resultado, participantes, pagamentos, jogos, histórico), `/api/admin/users`, `/api/admin/games/:id`.

## Regras técnicas

- Combinação normalizada (`01-05-12-23-35-48`) gerada no servidor, com índice único parcial `(pool_id, numbers) WHERE status = 'active'`.
- Criação/edição de jogo, verificação de limite e auditoria na mesma transação.
- Dinheiro em centavos inteiros. Datas/hora em UTC (ISO 8601); data do sorteio como `AAAA-MM-DD`; exibição em `America/Sao_Paulo`.
- Respostas públicas montadas com campos explícitos (nunca o registro inteiro do banco).

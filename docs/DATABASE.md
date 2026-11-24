# Banco de dados

SQLite em `data/bolao.db` (configurável por `DATA_DIR`). Modo WAL e chaves estrangeiras ativados. Migrations em `src/server/migrations/NNN_nome.sql`, aplicadas automaticamente ao iniciar e registradas em `schema_migrations`.

## users
| Campo | Tipo | Regra |
|---|---|---|
| id | INTEGER PK | |
| nickname | TEXT | Único, sem diferenciar maiúsculas (`COLLATE NOCASE`); 3–30 caracteres `a-z 0-9 . _ -` |
| display_name | TEXT | Nome exibido; visível ao admin e aos participantes logados do mesmo bolão |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin` ou `participant` |
| must_change_password | INTEGER 0/1 | 1 para senha provisória |
| is_active | INTEGER 0/1 | 0 bloqueia login |
| created_at, updated_at | TEXT | UTC ISO |

## pools (bolões)
| Campo | Tipo | Regra |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | Ex.: "Mega da Virada 2026" |
| contest_number | INTEGER | Número do concurso |
| draw_date | TEXT | `AAAA-MM-DD` |
| price_cents | INTEGER | Preço por jogo, ≥ 0 |
| max_games_per_participant | INTEGER | ≥ 1 |
| status | TEXT | `open`, `locked`, `closed` |
| result_numbers | TEXT NULL | Combinação normalizada sorteada |
| result_registered_at | TEXT NULL | |
| created_at, updated_at | TEXT | |

## pool_members
| Campo | Tipo | Regra |
|---|---|---|
| pool_id | INTEGER FK | PK composta |
| user_id | INTEGER FK | PK composta |
| paid_cents | INTEGER | Valor registrado como recebido |
| paid_at | TEXT NULL | Quando foi marcado pago |
| created_at | TEXT | |

Valor devido é calculado: `price_cents × jogos ativos`. Situação: `none` (sem jogos), `paid` (pago ≥ devido), `pending` (pago = 0), `partial`.

## games
| Campo | Tipo | Regra |
|---|---|---|
| id | INTEGER PK | Interno, nunca exibido publicamente |
| pool_id | INTEGER FK | |
| user_id | INTEGER FK | Dono |
| public_code | TEXT | Único, aleatório, exibido publicamente |
| numbers | TEXT | Combinação normalizada `01-02-03-04-05-06` |
| status | TEXT | `active` ou `deleted` |
| created_at, updated_at | TEXT | |
| deleted_at | TEXT NULL | |

Índices: único parcial `(pool_id, numbers) WHERE status='active'`; `(pool_id, user_id, status)`.

## audit_logs
| Campo | Tipo | Regra |
|---|---|---|
| id | INTEGER PK | |
| actor_id | INTEGER NULL | Quem executou |
| pool_id | INTEGER NULL | Bolão relacionado |
| action | TEXT | Ex.: `game.created`, `game.updated`, `pool.status`, `payment.paid` |
| entity_type, entity_id | TEXT | |
| reason | TEXT NULL | Motivo informado pelo admin |
| before_json, after_json | TEXT NULL | Nunca contém senhas, hashes ou tokens |
| created_at | TEXT | |

## sessions
| Campo | Tipo | Regra |
|---|---|---|
| id | TEXT PK | SHA-256 do token do cookie (o token em si não é guardado) |
| user_id | INTEGER FK | |
| created_at, expires_at | TEXT | Validade de 14 dias |

Sessões são removidas no logout, troca/redefinição de senha e desativação do usuário.

## invites (migration 002)

| Coluna | Tipo | Observação |
|---|---|---|
| id | INTEGER PK | |
| token_hash | TEXT UNIQUE | SHA-256 do token do link (o token em si não é guardado) |
| pool_id | INTEGER FK | Bolão em que a pessoa entra ao se cadastrar |
| note | TEXT | Anotação do admin ("para quem") |
| created_by | INTEGER FK | Admin que gerou |
| created_at / expires_at | TEXT | Validade |
| used_at / used_by | TEXT / INTEGER FK | Preenchidos no cadastro (uso único) |
| revoked_at | TEXT | Preenchido se o admin cancelar |

## users.deleted_at (migration 003)

Preenchido quando o admin exclui o usuário. A conta fica inativa, com o nick renomeado para `nick (excluído #id)`, o que libera o nick original, e deixa de aparecer na tela de usuários. O registro continua no banco para o histórico.

## pools: dezenas e Pix (migration 004)

| Coluna | Tipo | Observação |
|---|---|---|
| numbers_per_game | INTEGER (6–20, padrão 6) | Dezenas por jogo; só muda sem jogos ativos |
| pix_key | TEXT | Chave Pix normalizada (e-mail, CPF/CNPJ, aleatória ou +55…) |
| pix_name | TEXT | Nome de quem recebe (até 25 caracteres) |
| pix_city | TEXT | Cidade de quem recebe (até 15 caracteres) |
| pix_bank | TEXT | Instituição exibida ao participante, ex.: Mercado Pago (migration 005) |
| games_per_page | INTEGER (1–100) | Jogos por página na página inicial; vazio = 10 (migration 006) |

# Segurança

Medidas proporcionais a um sistema privado com poucos usuários.

## Autenticação
- Senhas armazenadas apenas como hash bcrypt (custo 12); mínimo de 8 caracteres.
- Senhas provisórias aleatórias geradas pelo sistema, exibidas uma única vez ao admin.
- Troca obrigatória da senha provisória: o servidor recusa as demais rotas autenticadas até a troca.
- Limite de tentativas: 5 falhas por nick/IP bloqueiam novas tentativas por 15 minutos (em memória).
- Sessão por cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando `COOKIE_SECURE=true` (HTTPS). Token aleatório de 32 bytes; o banco guarda só o hash.

## Autorização
- Todas as rotas `/api/me` exigem login; `/api/admin` exige papel `admin`, verificado no servidor.
- Participante só altera jogos próprios, com bolão aberto e sem resultado.
- Endpoints públicos retornam somente código público, dezenas e acertos.

## Requisições
- Alterações aceitam apenas JSON; requisições com cabeçalho `Origin` de outro site são recusadas (proteção CSRF junto com `SameSite`). Endereços públicos extras podem ser liberados em `ALLOWED_ORIGINS`.
- Cabeçalhos: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Content-Security-Policy` restritiva.
- Mensagens de erro não expõem detalhes internos.

## Convites
- Token aleatório de 24 bytes, uso único, com validade (máx. 60 dias); o banco guarda só o hash SHA-256.
- O token vai no `#fragmento` do link e no corpo das requisições, então não aparece em logs nem no histórico do servidor.
- Uso único garantido dentro de uma transação; o admin pode cancelar convites pendentes.
- Conta criada por convite é sempre participante, nunca administrador.

## Privacidade dos nomes
- Visitantes veem a lista de jogos sem nomes. O nome de quem cadastrou aparece só para participantes logados do mesmo bolão e para o admin.
- Valores e situação de pagamento individuais continuam visíveis só ao admin.

## Pix
- O Pix é um código estático com a chave cadastrada pelo admin; o sistema não recebe nem confirma pagamentos. Quem paga confere no app do banco o nome de quem recebe.
- Alterações da chave Pix ficam no histórico do bolão ("Bolão editado"). Uma conta de admin invadida poderia trocar a chave: por isso a senha do admin deve ser forte e exclusiva.
- O Pix só aparece para participantes logados do bolão, com o valor pendente de cada um.

## Dados
- Banco, backups e `.env` ficam fora do controle de versão.
- Histórico nunca registra senhas, hashes ou tokens.

## Hospedagem
- Em acesso externo, usar HTTPS (ex.: Cloudflare Tunnel) e `COOKIE_SECURE=true`.
- Não abrir portas no roteador sem necessidade; manter Windows e Node atualizados.
- Executar o serviço com usuário Windows comum (sem privilégio de administrador).

## Limites
O sistema organiza registros internos. Não substitui o comprovante oficial da aposta nem garante premiação.

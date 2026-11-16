# Decisões registradas

Decisões tomadas onde os requisitos não detalhavam. Podem ser revistas.

| # | Assunto | Decisão | Motivo |
|---|---|---|---|
| D1 | Situações do bolão | `open` (aberto), `locked` (bloqueado) e `closed` (encerrado). Bloqueado é uma pausa reversível; encerrado indica fim dos cadastros. O admin pode reabrir qualquer um. | Atende "abrir, encerrar e bloquear" com o mínimo de estados. |
| D2 | Prazo automático | Não há data/hora automática de encerramento; o admin muda a situação manualmente. | Não foi solicitado; evita agendamentos. |
| D3 | Resultado cadastrado | Com resultado cadastrado, participantes não podem mais alterar jogos, mesmo que o bolão esteja aberto. | Impede alterações após conhecer o resultado. |
| D4 | Participantes do bolão | Usuários são globais; o admin adiciona os participantes em cada bolão. Remover só é permitido sem jogos ativos. Ao criar um jogo próprio, o admin é adicionado automaticamente. | Permite reutilizar contas em vários bolões. |
| D5 | Pagamento | Guarda `paid_cents` por participante/bolão. "Marcar pago" registra o valor devido atual; "pendente" zera. Situação calculada: pago, pendente ou parcial. | Atende pago/pendente e continua correto se o número de jogos mudar. |
| D6 | Motivo nas alterações do admin | Opcional; tudo é registrado no histórico com estado anterior e posterior. | Menos atrito, histórico preservado. |
| D7 | Identificador público do jogo | Código aleatório de 6 caracteres (ex.: `K7QX2M`), sem relação com a ordem de cadastro. | Não revela sequência nem dono. |
| D8 | Banco | `node:sqlite` embutido no Node 24, SQL direto e migrations numeradas. Sem ORM. | Zero dependência nativa no Windows; poucas tabelas. |
| D9 | Servidor em TypeScript | Executado direto pelo Node 24 (remoção de tipos), sem etapa de compilação do servidor. | Menos ferramentas. |
| D10 | Senhas | `bcryptjs` (custo 12). | JavaScript puro, sem compilação nativa. |
| D11 | Primeiro administrador | Criado pelo comando `npm run create-admin`. | Evita tela de instalação exposta. |
| D12 | Página pública | Mostra todos os bolões; abre por padrão o mais recente. | Reutilização em vários bolões. |
| D13 | Arrecadação pública | Mostra total previsto e total recebido do bolão (somente agregados). | Solicitado; não expõe valores individuais. |
| D14 | Exclusão de bolão | Não existe; bolões antigos ficam como histórico. | Evita perda de dados; não solicitado. |
| D15 | Roteamento da interface | Roteador próprio mínimo (History API), sem biblioteca. | Poucas telas. |
| D16 | Cadastro por convite | O admin gera um link por pessoa, de uso único, com validade (1 a 60 dias, padrão 7), ligado a um bolão. A pessoa escolhe nome, nick e senha e já entra no bolão. O token vai no `#fragmento` do link (não chega aos logs) e o banco guarda só o hash. O cadastro direto pelo admin continua existindo. | Menos trabalho para o admin e sem repassar senhas. |
| D17 | Nomes nos jogos | Quem está logado e participa do bolão (e o admin) vê o nome de quem cadastrou cada jogo. Visitantes continuam vendo a lista anônima. Pagamentos seguem visíveis só ao admin. | Transparência entre participantes sem expor nomes na internet. |
| D18 | Recuperação de senha | Sem e-mail: o admin usa "Redefinir senha". Cada pessoa troca a própria senha pelo menu da engrenagem. | O sistema não guarda e-mail; suficiente para o grupo. |
| D19 | Exclusão de usuário | Exclusão lógica: a conta fica marcada (`deleted_at`), sem acesso, renomeada para `nick (excluído #id)` e fora das listas; jogos ativos viram excluídos e a participação nos bolões é removida. Recusada com pagamento registrado ou para a própria conta. | Libera nick e combinações sem quebrar o histórico nem apagar dinheiro registrado. |
| D20 | Dezenas por jogo | Configuráveis por bolão, de 6 a 20 (`numbers_per_game`). Só mudam enquanto o bolão não tem jogos ativos. Duplicidade = mesma combinação exata. Resultado sempre com 6 dezenas; faixas (sena/quina/quadra) pelos acertos. O preço por jogo é definido pelo admin. | Permite bolões com apostas maiores sem mudar as regras de conferência. |
| D21 | Pagamento via Pix | BR Code estático gerado no próprio sistema (sem integração com banco/Mercado Pago), com o valor pendente do participante e txid `BOLAO{bolão}U{usuário}`. Chave, nome e cidade são opcionais por bolão; o novo bolão herda os do último. QR Code desenhado com `qrcode-generator`. | Simples, gratuito e funciona com qualquer chave; a confirmação manual já existia. |
| D22 | Surpresinha | Gerada no navegador, evitando combinações já usadas no bolão; a pessoa confere e registra (o servidor continua validando duplicidade). | Ajuda quem não tem números em mente, sem registrar nada automaticamente. |
| D23 | Paginação | 10 jogos por página na página principal, no navegador; o filtro busca em todos os jogos. Ordem: nome do participante e ordem de criação (também para visitantes, sem mostrar o nome); com resultado, mais acertos primeiro. | Poucos dados; evita complexidade no servidor. |

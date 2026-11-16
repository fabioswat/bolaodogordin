# Changelog

## 1.4.0 — Pix, dezenas por bolão, surpresinha e paginação
- Pagamento via Pix: o admin cadastra chave, nome e cidade no bolão; em "Meus jogos" o participante vê QR Code e Pix copia e cola com o valor exato que falta pagar (BR Code estático, padrão do Banco Central). A confirmação continua manual. No campo da chave dá para colar um Pix copia e cola (ex.: do Mercado Pago): chave, nome e cidade são preenchidos sozinhos. O cartão mostra só o valor, quem recebe e a instituição (campo opcional), o QR Code e o copia e cola.
- Dezenas por jogo configuráveis por bolão (6 a 20); só pode mudar enquanto não houver jogos. O resultado continua com 6 dezenas.
- Botão "Surpresinha": preenche o volante com dezenas aleatórias que ainda não foram usadas no bolão.
- Tabela de jogos da página principal com 10 jogos por página.

## 1.3.1 — Bolas maiores
- As 6 bolas do sorteio ocupam toda a largura da faixa do resultado; legenda, faixas e contadores ficam abaixo.

## 1.3.0 — Modo escuro e bolas do sorteio
- Tema escuro que segue o aparelho, com botão sol/lua no topo para escolher claro ou escuro (a escolha fica salva no navegador).
- Topo da página: 6 bolas de sorteio com "?" até sair o resultado; depois, douradas as dezenas que o melhor jogo acertou e vermelhas as que faltaram. A explicação virou um balão de ajuda (ⓘ). Abaixo, uma linha menor para cada faixa premiada abaixo do melhor jogo (ex.: sena → quina e quadra), com quantidade de jogos e códigos.
- Tabela de jogos: ao passar o mouse numa dezena, ela acende em todos os jogos.

## 1.2.0 — Exclusão de usuário e publicação automática
- Admin → Usuários → Excluir: encerra o acesso, exclui os jogos ativos (libera as combinações), tira dos bolões e libera o nick para novo cadastro. Bloqueado se houver pagamento registrado. O histórico é mantido.
- Script `scripts\windows\publicar.ps1`: testes, backup, cópia, build e reinício só quando necessário.
- Script `scripts\windows\conta-servico.ps1`: servidor roda com conta própria do Windows, sem privilégios.
- Correção: ao sair, a lista de jogos deixa de mostrar os nomes sem precisar atualizar a página.

## 1.1.0 — Convites e nomes nos jogos
- Convites de cadastro: link por pessoa, de uso único e com validade; a pessoa escolhe nome, nick e senha e já entra no bolão (Admin → Convites).
- Participantes logados do bolão veem o nome de quem cadastrou cada jogo; visitantes continuam vendo a lista anônima.
- Menu da conta (engrenagem) no canto superior direito, com "Trocar senha" e "Sair".
- Título do site: "Bolão do Gordin".

## 1.0.0 — Primeira versão funcional
- Página pública com resumo, resultado, totais, arrecadação e tabela de jogos anônima.
- Área do participante com seleção de dezenas e cartões em formato de canhoto.
- Administração de bolões, participantes, pagamentos, jogos, resultado, usuários e histórico.
- Autenticação com senha provisória, troca obrigatória, sessões revogáveis e limite de tentativas.
- Backup com `VACUUM INTO`, rotação e verificação; scripts para o Agendador de Tarefas do Windows.
- Testes automatizados de regras, permissões e API.

## 0.2.0 — Revisão do planejamento
- Requisitos atualizados: vários bolões, cada um com concurso, data, preço por jogo, limite, participantes, pagamentos e resultado.
- Jogos com exatamente 6 dezenas (antes: 6 a 20).
- Duplicidade passa a valer por bolão; exclusão libera a combinação.
- Pagamento calculado por jogo ativo, com marcação pago/pendente.
- Removidos: prazo automático de encerramento e lançamentos de pagamento parciais.
- Stack simplificada: projeto único, `node:sqlite`, sem ORM.
- Decisões registradas em `docs/DECISIONS.md`.

## 0.1.0 — Planejamento inicial
- Primeira versão da documentação; nenhum código implementado.

# Visão do projeto e requisitos

## 1. Objetivo

Sistema web simples para organizar bolões privados da Mega-Sena entre conhecidos. Uso inicial no bolão da Mega da Virada (dezembro), com possibilidade de reutilização em outros bolões.

O sistema é uma ferramenta de registro e consulta: não processa pagamentos e não substitui o comprovante oficial da aposta.

Restrições gerais: poucos usuários, hospedagem no computador pessoal Windows do administrador (o mesmo usado no dia a dia), banco SQLite, sem microsserviços, sem Docker e sem dependências desnecessárias.

## 2. Perfis

### Visitante (sem login)
- Vê a página pública de qualquer bolão: resumo, resultado, totais e a tabela de jogos.
- Nunca vê quem cadastrou cada jogo nem valores individuais.

### Participante
- Entra com nick e senha. A senha inicial é provisória e deve ser trocada no primeiro acesso.
- Vê os bolões de que participa, seus jogos e o valor devido/situação de pagamento.
- Cadastra, edita e exclui os próprios jogos enquanto o bolão estiver **aberto**.
- Vê todos os jogos do bolão (pela página pública), sem identificação dos donos.

### Administrador
- Tudo que o participante faz (pode ter os próprios jogos normalmente).
- Cria e gerencia bolões, usuários e participantes de cada bolão.
- Define limite de jogos, preço por jogo, concurso e data do sorteio.
- Abre, bloqueia e encerra cadastros.
- Edita ou exclui qualquer jogo, inclusive após bloqueio/encerramento, com histórico.
- Acompanha valores devidos e marca pagamentos como pagos ou pendentes.
- Cadastra o resultado manualmente; a conferência é automática.

## 3. Funcionalidades

1. **Página pública**: seleção do bolão; resumo (concurso, data do sorteio, situação, preço por jogo); quantidade de participantes, jogos ativos e arrecadação (prevista e recebida); resultado do sorteio e totais de quadra/quina/sena; tabela de todos os jogos ativos sem identificação do dono.
2. **Área do participante**: seletor de bolão; cartões dos jogos com visual de canhoto; cadastro por seleção de 6 dezenas; edição e exclusão enquanto aberto; indicação clara de aberto/bloqueado/encerrado; limite e jogos restantes; valor devido e situação do pagamento.
3. **Área administrativa**:
   - Bolões: criar, editar dados, mudar situação, cadastrar/corrigir resultado.
   - Participantes do bolão: adicionar/remover, ver jogos de cada um, valor devido, marcar pago/pendente.
   - Jogos: tabela com dono, editar/excluir qualquer jogo com motivo opcional.
   - Usuários: criar com senha provisória, redefinir senha, ativar/desativar, definir papel.
   - Histórico (auditoria) das alterações de cada bolão.

## 4. Regras de negócio

1. Cada jogo tem **exatamente 6 dezenas**, de 01 a 60, sem repetição.
2. A combinação é comparada sem considerar a ordem (o servidor ordena e normaliza).
3. Uma combinação não pode se repetir entre jogos **ativos do mesmo bolão**, independentemente do dono.
4. A mesma combinação pode existir em bolões diferentes.
5. Excluir um jogo (exclusão lógica) libera a combinação naquele bolão.
6. O limite de jogos por participante é definido por bolão e considera somente jogos ativos.
7. Participante só cadastra, edita ou exclui jogos próprios e somente com o bolão **aberto** e **sem resultado cadastrado**.
8. Administrador pode editar ou excluir qualquer jogo em qualquer situação; toda alteração gera histórico.
9. O administrador pode criar os próprios jogos normalmente (mesmas regras de dezenas, duplicidade e limite; não é barrado pelo bloqueio).
10. Valor devido = preço por jogo × quantidade de jogos ativos do participante no bolão.
11. Valores são armazenados em centavos inteiros.
12. Pagamento: o administrador marca o participante como **pago** (registra que recebeu o valor devido naquele momento) ou **pendente**. Se o participante ganhar novos jogos depois de pago, a diferença volta a aparecer como pendente.
13. Conferência: para cada jogo ativo conta as dezenas acertadas; 4 = quadra, 5 = quina, 6 = sena. O sistema não calcula valores de prêmio.
14. Nenhuma tela pública ou de participante revela o dono de um jogo alheio.

## 5. Fora do escopo

- Pagamento online, Pix integrado, conciliação bancária.
- Busca automática de resultados em serviços externos.
- Autocadastro de usuários, recuperação de senha por e-mail.
- Chat, comentários, notificações, aplicativo mobile nativo.
- Cálculo ou rateio de prêmios.

Decisões técnicas tomadas na ausência de detalhes estão em [DECISIONS.md](DECISIONS.md).

# Preparação fiscal por nota

No pedido fechado, em **Contrato e nota → Preparar regras desta nota**, a pessoa com permissão de Configurações pode escolher as regras antes de conferir ou emitir.

O padrão da linha de produtos é o ponto de partida. Cada etapa grava somente seus campos neste pedido. Os demais continuam acompanhando o padrão da empresa. Escolher revenda ou produção própria preenche a natureza e os três CFOPs desta nota; a opção personalizada permite informar outra natureza e conferir os códigos nas etapas seguintes.

As etapas cobrem operação, CFOPs, ICMS, IPI, PIS, COFINS, classificação IBS/CBS, alíquotas de IBS e CBS, condições e informações complementares. Os códigos das listas correspondem aos grupos suportados pelo emissor atual. NCM e origem continuam no produto; dados do emitente e certificado continuam no cadastro da empresa. Alíquotas de ICMS/IPI e valores comerciais continuam seguindo o pedido.

**Salvar e continuar** avança; **Voltar** salva antes de retornar. Em Outras opções, **Usar padrão da empresa** remove a personalização após confirmação. Essa preparação não transmite à SEFAZ nem consome numeração. A prévia, XML de conferência e emissão leem as mesmas escolhas salvas; validações fiscais permanecem obrigatórias.

## Integridade

- Migração `0066_regras_fiscais_por_pedido.sql`: campos opcionais por pedido, revisão e autoria/data da última alteração. Não inclui ou altera códigos tributários reais.
- A revisão da preparação é independente da revisão comercial. Uma edição concorrente é recusada sem sobrescrever a primeira.
- Gravar o XML assinado trava e incrementa a mesma revisão em uma instrução de banco. Uma edição concorrente e a assinatura não podem vencer juntas.
- No ambiente atual, nota assinada, autorizada ou denegada bloqueia a edição; nota rejeitada permite correção. O XML guardado mantém as escolhas usadas, mesmo após alterações futuras no padrão.
- Permissão de Configurações exigida na página e na ação; empresa vem da sessão.

## Verificação

704 testes aprovados, zero falhas e zero pulos; lint e tipos aprovados. A primeira execução encontrou os inventários de migrações e páginas desatualizados; os inventários foram atualizados, mantendo as verificações de todas as migrações e permissões. A execução completa seguinte passou.

Regressão com PostgreSQL cobre preenchimento por nota, isolamento entre pedidos e padrão da empresa, herança de alterações em campos não personalizados, branco explícito, código inválido, revisão antiga, edição concorrente, concorrência com assinatura e bloqueio de XML assinado/autorizado. O XML usa a natureza e a alíquota de PIS personalizadas. A conferência preserva a numeração.

Pela UI do demo isolado `erp_note_rules_demo`, pedido `261017-DM07`: operação de revenda preencheu 5102/6102/6108 somente na nota; natureza foi personalizada; erro de CFOP 6102 em operação interna preservou o campo; voltar salvou a correção; CSTs, alíquotas, condições e observação foram salvos; a conferência deixou de listar pendências de regras fiscais, mantendo emitente e produtos incompletos bloqueados. Nenhuma nota foi transmitida.

## Sete perguntas de UX

1. **Tarefa clara:** título Regras desta nota, número do pedido e indicação de padrão/personalização.
2. **Informação para decidir:** etapa atual, campos e valores salvos aparecem imediatamente.
3. **Ação principal:** Salvar e continuar (ou Salvar e conferir), primeiro botão do formulário. Voltar é secundário e também salva.
4. **Uma tela:** as 12 etapas foram medidas nos cinco tamanhos, total de 60 amostras. Sem rolagem lateral e sem exceder a altura da janela em uso normal. Campos/botões/áreas de toque medem no mínimo 44 px; as caixas das condições usam o rótulo inteiro de 44 px, conforme o contrato compartilhado do ERP.
5. **Conteúdo secundário:** Outras opções guarda retorno ao pedido, explicação e restauração do padrão.
6. **Preservação:** avançar e voltar salvam o grupo atual; a recusa com JavaScript preserva o preenchimento; o controle de revisão impede sobrescrita de outra aba. Sair sem salvar não promete rascunho global.
7. **Acesso:** envio por teclado conferido. Texto a 200% em 360×640 manteve controles dentro da largura, com rolagem vertical e controles de 88–96 px. Zoom visual 200% também conferido; alterações de teste foram restauradas. Não foi executada auditoria completa com leitor de tela.

Dimensões efetivamente conferidas: 360×640, 390×844, 430×932, 1366×768 e 1440×900. Nas 60 amostras normais, a altura total correspondeu à altura da janela. A área real de toque de checkbox foi medida no rótulo, como faz o teste visual do projeto.

Publicação e aceite operacional registrados em [AVL-28](https://linear.app/avilaops/issue/AVL-28). A preparação personalizável não comprova autorização real da SEFAZ ou validação dos códigos pela contabilidade.

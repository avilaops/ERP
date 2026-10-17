# Integração dos PRs 16 a 19

Pedido do usuário em 17/10/2026: não deixar os PRs do ERP sem mesclagem.
Dependências: 16 → 17 → 18 → 19. Checkout de integração separado; alterações
locais de DOCUMENTOS e trabalhos anteriores preservados no checkout original.

## Correções antes da mesclagem

- NF-e: reserva de numeração e persistência assinada na mesma transação em conexão
  reservada, com bloqueio do pedido. Recusa desfaz a reserva; transmissão ocorre
  depois do commit. Colisão de número não incrementa a revisão fiscal.
- Proposta: termos herdados, inclusive ausências explícitas, são materializados
  ao fechar e ao guardar contrato/nota. Mudanças posteriores dos padrões não
  alteram os termos do documento. A migration congela os valores atualmente
  disponíveis em pedidos antigos já fechados ou bloqueados; não recupera padrões históricos.
- PIX direto: propriedade explícita `company_pix`, separada do código fiscal e
  do nome do provedor. Só a forma padrão PIX existente é habilitada pela migration;
  outros métodos exigem escolha explícita. Troca do código ou renomeação retira
  a habilitação. O checkbox fica em Fiscal → Pagamentos.
- Pagamento: salvar Entrada/Parcelas preserva meio legado do Saldo não enviado.
- MCP: tarefa acompanha o pedido após reassociação; consulta de política pagina
  no SQL antes de carregar os itens, com uma linha adicional para `tem_mais`.
- Conexões: revogação tem seção própria claramente identificada.
- URLs comerciais reconhecem esquemas sem depender do prefixo textual `http`.
- Teste de navegação usa a tela atual de pagamento e prazo de 90 segundos;
  o seletor antigo travava o job por 40 minutos.

## Validação e limites

Tipos, lint e testes de proposta aprovados. Teste PostgreSQL de termos preservados
aprovado. Suíte de pedidos e CI do conjunto devem concluir antes da mesclagem.
Nenhuma NF-e, recebimento ou envio real é usado nesses testes.

O trabalho trata integração Git. Publicação da migration de PIX/termos e das correções
precisa de implantação própria; merge não comprova publicação em produção.

Na integração do PR 20, a migration de PIX/termos foi renumerada para 0071.
A 0070 de e-mail da CC-e já constava no ledger de produção e foi preservada
com seu nome original; a de PIX/termos ainda não constava nesse ledger.

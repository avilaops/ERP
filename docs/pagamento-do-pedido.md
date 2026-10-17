# Pagamento do pedido

O vendedor abre **Pagamento → Escolher prazo e meios de pagamento**. São três etapas curtas: entrada (valor ou percentual, meio e data), saldo (quando pagar, meio e observações) e parcelas (quantidade e prazos). Na entrega é uma condição de vencimento, independente do meio. Essa condição usa uma parcela única e pula a etapa de parcelamento.

Os meios vêm das configurações da empresa. PIX, transferência, dinheiro, cartão presencial e link com meio identificado podem ter códigos distintos na NF-e. Um link de pagamento deve indicar cartão, PIX ou outro meio efetivo; o nome genérico não recebe um código presumido. O cadastro de boleto pode ficar desligado e ser ativado depois em Configurações → Formas de pagamento. Estas opções registram o combinado; não criam cobrança, link de adquirente ou boleto no banco.

Pedidos antigos conservam seus dados. Itens cadastrados como prazo na entrega saem das listas de novos meios e não podem fornecer código fiscal, mesmo se o banco contiver um código antigo. A pré-validação orienta corrigir o meio do pedido. Pedidos fechados precisam ser reabertos pelo fluxo existente, respeitando bloqueios de recebimentos e documentos; não há edição silenciosa de compromissos fechados.

Avançar e voltar salvam apenas os campos da etapa, preservando os demais. A revisão comercial impede sobrescrever uma edição de outra aba. Se o plano não mudar, parcelas personalizadas continuam preservadas. Alterar o plano recalcula as parcelas e, ao fechar, o financeiro usa o novo combinado. O orçamento mostra o meio do saldo também quando ele vence na entrega.

## Sete perguntas de UX

1. O título identifica o pagamento e o pedido; a etapa identifica a decisão.
2. Valores e escolhas salvos aparecem antes da ação.
3. Salvar e continuar é o primeiro botão de envio; o último passo salva e confere.
4. As três etapas foram medidas em 360×640, 390×844, 430×932, 1366×768 e 1440×900: 15 amostras, todas com uma tela de altura, sem rolagem lateral e controles de pelo menos 44 px.
5. O retorno ao pedido é secundário; parcelas individuais continuam no detalhe do pagamento.
6. Avançar e voltar salvam; erro mantém o formulário; revisão antiga é recusada.
7. Conferidos teclado, zoom de 200% e texto ampliado a 200%. O texto ampliado em 360×640 manteve a largura e controles de 88 px, com rolagem vertical; o teste identificou e corrigiu a largura mínima implícita da grade. Não foi feita auditoria com leitor de tela.

## Evidência de verificação

705 testes aprovados com PostgreSQL isolado, sem falhas ou pulos. Após reorganizar a apresentação, mais 33 testes de rotas/UX aprovados; lint e tipos conferidos. O runtime inicial do host não tinha suporte a TypeScript; a suíte efetiva rodou na imagem oficial Node 24. As falhas iniciais de arquivos auxiliares ausentes na cópia de teste foram corrigidas antes da execução completa aprovada.

Pela UI do demo isolado, pedido 261017-DM11: entrada de 70% via PIX em 16/10/2026; saldo também PIX, em três parcelas, primeira em 30 dias e intervalo de 30 dias. Entrada negativa recusada sem perder preenchimento; voltar salvou parcelas e preservou entrada/observações. A tentativa de reabrir o pedido fictício DM07 com recebimento foi corretamente bloqueada. Nenhuma cobrança ou nota foi emitida.

# Pagamento do pedido

O vendedor abre **Pagamento → Escolher prazo e meios de pagamento**. Entrada, saldo e parcelas ficam no mesmo formulário e são salvos juntos. Na entrega é uma condição de vencimento, independente do meio. Essa condição usa uma parcela única e dispensa o parcelamento.

Os meios vêm das configurações da empresa. PIX, transferência, dinheiro, cartão presencial e link com meio identificado podem ter códigos distintos na NF-e. Um link de pagamento deve indicar cartão, PIX ou outro meio efetivo; o nome genérico não recebe um código presumido. O cadastro de boleto pode ficar desligado e ser ativado depois em Configurações → Formas de pagamento. Estas opções registram o combinado; não criam cobrança, link de adquirente ou boleto no banco.

Pedidos antigos conservam seus dados. Itens cadastrados como prazo na entrega saem das listas de novos meios e não podem fornecer código fiscal, mesmo se o banco contiver um código antigo. A pré-validação orienta corrigir o meio do pedido. Pedidos fechados precisam ser reabertos pelo fluxo existente, respeitando bloqueios de recebimentos e documentos; não há edição silenciosa de compromissos fechados.

Salvar grava o plano completo de forma atômica. A revisão comercial impede sobrescrever uma edição de outra aba. Se o plano não mudar, parcelas personalizadas continuam preservadas. Alterar o plano recalcula as parcelas e, ao fechar, o financeiro usa o novo combinado. O orçamento mostra o meio do saldo também quando ele vence na entrega.

## Sete perguntas de UX

1. O título identifica o pagamento e o pedido.
2. Valores e escolhas salvos aparecem antes da ação.
3. Salvar e conferir é a única ação principal do formulário.
4. O formulário completo foi medido em 360×640, 390×844, 430×932, 1366×768 e 1440×900, sem rolagem lateral e com controles de pelo menos 44 px.
5. O retorno ao pedido é secundário; parcelas individuais continuam no detalhe do pagamento.
6. Erro mantém o formulário; revisão antiga é recusada.
7. Conferidos teclado, zoom de 200% e texto ampliado a 200%. O texto ampliado em 360×640 manteve a largura e controles de 88 px, com rolagem vertical; o teste identificou e corrigiu a largura mínima implícita da grade. Não foi feita auditoria com leitor de tela.

## Evidência de verificação

705 testes aprovados com PostgreSQL isolado, sem falhas ou pulos. Após reorganizar a apresentação, mais 33 testes de rotas/UX aprovados; lint e tipos conferidos. O runtime inicial do host não tinha suporte a TypeScript; a suíte efetiva rodou na imagem oficial Node 24. As falhas iniciais de arquivos auxiliares ausentes na cópia de teste foram corrigidas antes da execução completa aprovada.

Pela UI do demo isolado, pedido 261017-DM11: entrada de 70% via PIX em 16/10/2026; saldo também PIX, em três parcelas, primeira em 30 dias e intervalo de 30 dias. Entrada negativa recusada sem perder preenchimento; voltar salvou parcelas e preservou entrada/observações. A tentativa de reabrir o pedido fictício DM07 com recebimento foi corretamente bloqueada. Nenhuma cobrança ou nota foi emitida.

## Publicação e exemplo autorizado

Versão `77df694`, build de 17/10/2026 01:32:10 UTC; `/api/health` respondeu com essa revisão e container saudável. Pacote montado de `git archive HEAD`; 3.236 entradas verificadas antes de ativar, com pacote/imagem anteriores preservados. Não houve nova migração nesta mudança. PR16 continua aberto para revisão.

Na Ludus, pela UI publicada: boleto desligado; cartão presencial, link por cartão e link por PIX cadastrados. O botão de completar códigos conhecidos preencheu os três novos cadastros; os links foram conferidos como `03` e `17`. Os pedidos mantêm as opções da empresa, sem listar o prazo legado Na entrega como meio.

O usuário autorizou entrada PIX e saldo parcelado para o pedido de exemplo `261016-HXKP`. Foi reaberto pela UI, mantida entrada de R$ 20.000 em 16/10/2026, escolhido saldo PIX em 3 x R$ 7.608,16, primeira em 30 dias e intervalo de 30 dias. O pedido passou pela aprovação da Diretoria e ficou fechado novamente. Recebimentos previstos conferidos: 15/11/2026, 15/12/2026 e 14/01/2027. A tela financeira publicada mostra a entrada e as parcelas em aberto com cobrança PIX disponível. Nenhuma baixa, cobrança bancária ou nota foi enviada.

A pré-validação do HXKP já não lista pendência de pagamento; ainda exige CSTs de ICMS, PIS/COFINS, IPI e classificação IBS/CBS. AVL-12 e AVL-21 atualizadas, mantendo a etapa fiscal externa pendente. Evidência visual: `pagamento-pix-parcelado-publicado.jpg`, na pasta de visualizações desta tarefa.

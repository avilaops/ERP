# Dados comerciais da proposta

O PDF passa a identificar a vendedora pelo cadastro Fiscal (razão social, CNPJ,
inscrição estadual e endereço). Contato, site, garantia, montagem e condições de
atraso/cancelamento são preenchidos em **Configurações → Dados da proposta**.
Campos vazios ficam identificados como pendentes no documento; nenhum prazo de
garantia, cobertura, multa ou contratação de serviço é presumido.

Em **Pedido → Dados do PDF**, oito etapas registram frete, previsão de transporte,
instruções de entrega e condições específicas. Condições vazias herdam o padrão
da empresa. A revisão impede sobrescrita por outra aba; contrato enviado/assinado,
nota assinada/autorizada/denegada ou pedido indisponível impedem a alteração.
Documentos de contrato já guardados continuam como foram enviados.

O frete informado nesta tela é pago diretamente pelo cliente à transportadora e
não altera o total dos equipamentos, impostos ou títulos. Só FOB aceita esse valor.
Frete cobrado pela vendedora exige tratamento no faturamento; a modalidade fiscal
continua sendo conferida na preparação da nota.

O endereço vem da entrega da nota ou do cadastro do cliente, com a origem indicada.
Se o estado escolhido é diferente do cadastro e não há endereço de entrega, o
documento pede confirmar o endereço, em vez de imprimir uma entrega no estado errado.
O peso dos equipamentos multiplica os pesos cadastrados pelas quantidades. Se um
peso falta, o PDF pede completar o cadastro. Volumes/peso bruto vêm do transporte;
dimensões do equipamento montado não são tratadas como cubagem de embalagem.
NCM vem do cadastro de cada produto, sem escolher classificação fiscal.

O PIX da entrada usa a chave configurada em **Configurações → Cobrança por PIX** e
o saldo efetivamente em aberto, descontados recebimentos não estornados. Só aparece
para entrada via PIX em orçamento em negociação ou pedido fechado. Gera um BR Code
estático; não chama banco, não registra pagamento e não confirma recebimento.
PIX por link de pagamento mantém o fluxo do provedor e não ganha um QR direto da empresa.

O documento mostra o estado do pedido, mantém a validade para orçamentos e explicita
o intervalo em dias das parcelas calculadas. Parcelas personalizadas mantêm as datas
combinadas. O resumo remove a linha redundante de tabela quando não há desconto e
há IPI. Endereço repetido é normalizado na gravação e na apresentação; o município
usa a grafia do IBGE quando reconhecido. Nome pessoal em caixa alta é ajustado
somente na apresentação, sem reescrever razão social ou documento.

Quando há contrato eletrônico, o PDF orienta a usar o link individual já enviado e
substitui os espaços de assinatura física pelo estado do aceite. Não cria, renova
nem envia um link durante a leitura do PDF; o segredo do contrato não é recuperável
do hash guardado. Sem contrato enviado, continuam os espaços de assinatura física.

## Verificação de UX

1. Título e etapa identificam a decisão e o pedido/empresa.
2. Campos e instrução principal aparecem na primeira tela.
3. Uma ação principal salva a etapa e avança; Enter executa o formulário.
4. Quinze etapas nos cinco tamanhos: 75 amostras, sem rolagem lateral, uma tela e
   controles de pelo menos 44 px.
5. O padrão herdado abre em “Ver padrão da empresa”.
6. Voltar salva a etapa; recusa preserva os campos. Conflito de revisão pede recarga.
7. Rótulos associados aos campos e ações nativas permitem teclado. Em 360×640,
   fonte da raiz a 32 px (200%) e zoom de 200% mantiveram a ação alcançável por
   Tab. As ampliações temporárias foram removidas depois da verificação.

## Evidências

- PDF de demonstração baixado pela UI: condição específica de garantia, demais
  condições herdadas e frete FOB direto ao transportador.
- Prévia do pedido 261016-HXKP gerada com snapshot somente de leitura dos dados
  reais e contato/PIX dos anexos fornecidos: duas páginas inspecionadas, QR lido
  com valor de R$ 20.000 e chave CNPJ conferidos. Garantia, frete, montagem, site e
  prazo de transporte ainda dependem de definição/cadastro.
- Campos fictícios foram usados somente no banco de demonstração.
- 715 testes aprovados, sem falhas ou testes pulados; 57 testes das áreas alteradas
  conferidos também em execução dirigida. Lint e verificação de tipos aprovados.
- Depois da revisão de endereço e meio PIX, 16 testes dirigidos passaram sem falhas
  ou pulos, incluindo complemento de apartamento preservado, entrega em outro estado
  pendente de endereço e link PIX sem QR direto da empresa.

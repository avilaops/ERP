# Dados comerciais da proposta

O PDF passa a identificar a vendedora pelo cadastro Fiscal (razão social, CNPJ,
inscrição estadual e endereço). Contato, site, garantia, montagem e condições de
atraso/cancelamento são preenchidos em **Configurações → Dados da proposta**.
Campos e blocos sem dados ficam ocultos no documento; nenhum prazo de garantia,
cobertura, multa ou contratação de serviço é presumido. Não são impressos
“a definir”, “a cadastrar”, validade não aplicável ou a origem interna do endereço.

O fechamento exige garantia (prazo e cobertura), modalidade de frete e condições
de montagem/instalação. O padrão da empresa pode fornecer garantia e montagem;
o vendedor pode substituí-los em **Dados do PDF**. Sem esses dados, o botão fica
indisponível e a tela indica onde preencher. O servidor repete a validação no
fechamento direto, no envio para aprovação e na decisão de aprovação. A gravação
confere as revisões dos termos do pedido e da empresa para recusar alterações
concorrentes. Pedidos já fechados não são reabertos automaticamente.

Em **Pedido → Dados do PDF**, oito etapas registram frete, previsão de transporte,
instruções de entrega e condições específicas. Condições vazias herdam o padrão
da empresa. A revisão impede sobrescrita por outra aba; contrato enviado/assinado,
nota assinada/autorizada/denegada ou pedido indisponível impedem a alteração.
Documentos de contrato já guardados continuam como foram enviados.

O frete informado nesta tela é pago diretamente pelo cliente à transportadora e
não altera o total dos equipamentos, impostos ou títulos. Só FOB aceita esse valor.
Frete cobrado pela vendedora exige tratamento no faturamento; a modalidade fiscal
continua sendo conferida na preparação da nota.

O endereço vem da entrega da nota ou do cadastro do cliente.
Se o estado escolhido é diferente do cadastro e não há endereço de entrega, o
documento mostra apenas o estado informado, sem usar uma entrega no estado errado.
O peso dos equipamentos multiplica os pesos cadastrados pelas quantidades. Se um
peso falta, o PDF omite o peso total. Volumes/peso bruto vêm do transporte;
dimensões do equipamento montado não são tratadas como cubagem de embalagem.
NCM vem do cadastro de cada produto, sem escolher classificação fiscal.

O PIX da entrada usa a chave configurada em **Configurações → Cobrança por PIX** e
o saldo efetivamente em aberto, descontados recebimentos não estornados. Só aparece
para entrada via PIX em orçamento em negociação ou pedido fechado. Gera um BR Code
estático; não chama banco, não registra pagamento e não confirma recebimento.
PIX por link de pagamento mantém o fluxo do provedor e não ganha um QR direto da empresa.
O favorecido impresso usa a razão social do cadastro Fiscal; o nome abreviado do
BR Code continua respeitando seu limite de caracteres. Valores monetários no PDF
sempre têm duas casas decimais. O telefone comercial usa a máscara brasileira.

Entrega e fabricação curtas ocupam o espaço ao lado dos totais; pagamento e QR
compartilham um bloco. Condições extensas e muitos itens continuam paginados sem
diminuir as fontes. O exemplo HXKP cabe em uma página após omitir os campos vazios.

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

## Publicação

Publicado em `fa1f709`, health e container saudáveis. Migração `0067` aplicada na
Ludus. Contato da ficha cadastral e chave PIX CNPJ do contrato fornecido foram
cadastrados pela UI. O PDF real do pedido `261016-HXKP` foi baixado pela tela e suas
duas páginas inspecionadas; leitura do QR confirmou chave e R$ 20.000 da entrada.
Total dos equipamentos de R$ 42.824,48, NCM, peso de 455 kg, endereço e periodicidade
conferidos. Nenhum recebimento foi confirmado e nenhum contrato ou nota foi enviado.

## Revisão de apresentação e fechamento

- Prévia real HXKP: uma página inspecionada, QR decodificado com chave CNPJ e
  R$ 20.000,00. Favorecido legal, centavos e telefone conferidos.
- Suíte de 719 testes: 717 passaram na primeira execução. Dois cenários de teste
  foram ajustados (restaurar desconto antes da segunda simulação de concorrência;
  usar exemplo sem observação adicional na regressão de uma página). Os 76 testes
  afetados passaram na repetição, incluindo fechamento e aprovação. Os demais
  resultados da suíte permanecem válidos.
- Após separar a etapa de fechamento, lint, tipos e 37 testes de rotas, tema e UX
  passaram. Não foram alterados preços, recebimentos ou emissão fiscal reais.

### Sete perguntas da etapa Fechar

1. O título e o número do pedido identificam a decisão de fechamento.
2. Total, pendências e acesso ao preenchimento aparecem na primeira tela.
3. Uma ação principal: completar os dados ou fechar/enviar para aprovação.
4. Dois estados nos cinco tamanhos (10 medições): uma tela, sem rolagem lateral,
   controles de pelo menos 44 px. Três campos comerciais e duas pendências de
   pagamento ficaram visíveis em 360×640.
5. Editar, consultar PDF e excluir ficam nas outras etapas; não ocupam o fechamento.
6. O servidor recusa dados ausentes e alterações concorrentes antes de gerar títulos.
7. A navegação, o link de preenchimento e os botões usam controles nativos. Após
   reconectar o navegador, Tab alcançou o botão com texto e zoom a 200%; as
   ampliações foram removidas. Enter fechou DM10 e a UI voltou ao Resumo, sem
   permanecer na etapa Fechar removida. Todos os dados desse teste eram fictícios.

### Publicação desta revisão

Versão `58c97aa` publicada em 17/10/2026; endpoint de saúde confirmou o commit
e o container ficou `healthy`. Pacote standalone e delta foram verificados por
manifesto e checksum; migrações já estavam em dia. O PDF revisado HXKP foi gerado
com uma nova leitura dos dados reais, inspecionado em uma página e seu QR
decodificado. Valores, chave CNPJ e favorecido legal foram conferidos.

Após reconectar o navegador integrado, o PDF de produção foi baixado pelo link
**Salvar PDF** da tela de HXKP e substituiu a prévia local. Sua página foi
renderizada e inspecionada; leitura do QR confirmou chave CNPJ e R$ 20.000,00.
O arquivo `pedido-261016-HXKP-revisado.pdf` foi entregue como artefato local.
No ambiente fictício DM10, condições incompletas bloquearam o fechamento; garantia
e montagem herdadas e frete FOB liberaram a validação comercial. Após preencher
o pagamento fictício, Enter fechou o pedido e a tela voltou ao Resumo. Permanecem
os dados comerciais reais a definir pela empresa; não foram preenchidos com exemplos.

Permanecem para preenchimento pela empresa: site, prazo/cobertura de garantia,
montagem, modalidade/condições do frete, prazo de transporte e condições de
atraso/cancelamento. O PDF omite essas pendências e a tela permite preenchê-las;
garantia, montagem e modalidade de frete são obrigatórias para novos fechamentos.

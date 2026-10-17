# Operações do conector LUDUS

Demanda: [AVL-145](https://linear.app/avilaops/issue/AVL-145).
Primeira entrega: [AVL-146](https://linear.app/avilaops/issue/AVL-146).
Segunda entrega: [AVL-148](https://linear.app/avilaops/issue/AVL-148).

## Primeira entrega

| Ferramenta | Quem recebe | Uso |
| --- | --- | --- |
| `recebimento_dar_baixa` | Recebimentos: diretoria e financeiro | Prévia de baixa parcial/total; confirmação registra pagamento e comissão pela regra existente |
| `tarefa_criar_em_pedido` | Pedidos e Funil | Tarefa do vendedor do pedido, sem oportunidade obrigatória; vendedor só alcança seus pedidos |
| `pedidos_custo_margem` | Pedidos e poder de custos | Cálculo comercial do pedido/produtos pela tabela congelada; diretoria autorizada |
| `fluxo_de_caixa` | Diretoria com Relatórios, Recebimentos, Contas a pagar e Comissões | Previsão semanal/mensal de recebíveis líquidos, contas abertas e comissões já geradas |

O histórico de chamadas continua em `mcp_calls`. `mcp_confirmations` guarda o
hash do código, usuário, horário, intenção e resultado da ação confirmada dentro
do esquema da empresa. Recebimentos e tarefas conservam também sua autoria
nos registros de negócio. Não se grava o código em texto aberto.

## Confirmação de alterações

1. O assistente chama a ferramenta com os dados completos. O ERP devolve a
   prévia e um código válido por dez minutos. Nenhuma baixa ou tarefa é criada.
2. O assistente apresenta o resumo e solicita confirmação explícita à pessoa.
3. Depois da resposta, chama a mesma ferramenta somente com `confirmar`.
4. Permissões são verificadas novamente em cada requisição. Mudanças no pedido,
   saldo ou forma de pagamento podem exigir nova prévia.

Uma repetição do código devolve o resultado original, inclusive após o prazo.
A intenção, a escrita e o resultado são serializados numa conexão reservada
pela rota HTTP. Chamadores internos destas ferramentas devem fornecer um
cliente reservado, nunca executar transações por um pool. Se a escrita falhar,
toda a confirmação é revertida. Duas prévias da mesma tarefa pendente no mesmo
pedido também reaproveitam a tarefa.

O protocolo orienta o assistente a obter a confirmação humana. O ERP verifica
o código e a identidade; não tem como comprovar o conteúdo da conversa de um
cliente MCP externo. A aplicação conectada deve respeitar esse contrato.

Exemplo de baixa, exclusivamente com dados de demonstração:

```json
{"id": 123, "valor": 250, "data": "2026-10-17", "forma": "PIX"}
```

A próxima chamada, após a confirmação da pessoa, contém somente:

```json
{"confirmar": "codigo_retornado_pela_previa"}
```

`recebimentos_em_aberto` informa o `id` e o saldo líquido (`valor`), separado
do `valor_original`. A forma deve corresponder a um meio ativo da empresa;
"Na entrega" é prazo e não pode ser usado como meio.

## Limites dos relatórios

Margem é calculada pelo motor comercial existente, com custos e parâmetros da
tabela do pedido. Frete e taxa fixa são rateados entre produtos pela receita
sem IPI. Arredondamento e tributação sobre lucro podem fazer a soma dos lucros
por item diferir dos centavos do total; o total oficial continua sendo o
cálculo do pedido inteiro. Não representa custo contábil realizado.

Caixa inclui títulos de pedidos fechados e deduz recebimentos sem estorno
confirmado. Saídas incluem contas abertas e comissões geradas ainda não pagas.
Valores anteriores ao início e sem vencimento ficam separados dos períodos.
O saldo é a diferença prevista do período, não o saldo bancário. Custos e
despesas ainda não lançados e comissões futuras ainda não geradas não entram.
Intervalo máximo: 366 dias; semana inicia na segunda-feira.

## Segunda entrega: financeiro e consultas

| Ferramentas | Quem recebe | Comportamento |
| --- | --- | --- |
| `contas_a_pagar_lancar`, `contas_a_pagar_dar_baixa` | Contas a pagar | Prévia e confirmação; listas ativas da empresa; baixa registra pagamento já realizado, com valor efetivo, data e meio |
| `cobranca_gerar_mensagem` | Recebimentos | Rascunho de parcela vencida pelo saldo líquido; não envia mensagem e não presume multa, juros ou chave PIX |
| `produtos_buscar` | Tabela de preços | Catálogo ativo da última publicação por linha, preços e estoque, sem custo ou fornecedor |
| `pedido_detalhe` | Pedidos | Itens, condições, produção e expedição; vendedor só alcança seus pedidos |
| `minhas_comissoes` | Comissões | Previsão, competência, pagamentos e saldo anterior, sempre da própria pessoa |
| `nota_fiscal_status`, `producao_status` | Relatórios e Pedidos ou Recebimentos | Situação do pedido ao alcance da pessoa; financeiro com Recebimentos consulta a empresa; sem XML, emissão ou movimentação de fábrica |
| `entregas_agenda` | Estoque | Expedições do período e pendências, com prazo de produção; não inventa agenda de transporte |
| `compras_estoque_minimo` | Compras | Material abaixo do mínimo e quantidade para repor; não abre compra |
| `inadimplencia_resumo` | Diretoria com Recebimentos | Saldo líquido vencido por cliente e identidade do vendedor |
| `vendas_resumo` | Diretoria com Relatórios, Pedidos e poder de ver pedidos da equipe | Venda comercial fechada por mês, vendedor, produto ou UF; não é faturamento fiscal nem caixa |
| `funil_conversao` | Diretoria com Funil e poder de ver a equipe | Situação atual das oportunidades criadas no intervalo e motivos de perda |
| `descontos_fora_da_regra`, `pedidos_suspeitos` | Diretoria com Pedidos e poder de ver a equipe | Revisão da política atual e sinais objetivos para conferência humana; sem cancelamento ou exclusão |

As duas novas escritas usam a confirmação de dez minutos descrita acima.
Prévia não cria conta nem registra pagamento. Confirmação revalida os cadastros
ativos; baixa também bloqueia a conta e exige a mesma revisão da prévia. Repetir
o código devolve o resultado original. Autor e horário permanecem nos registros
de negócio e na confirmação. Não há transferência bancária.

`contas_a_pagar_lancar` sem argumentos lista categorias, meios e fornecedores
ativos. Os fornecedores são projetados apenas como ID e nome, sem banco ou
contato. `contas_a_pagar_em_aberto` agora informa o ID utilizado para a baixa.

### Limites dos dados disponíveis

- Prazo de fabricação é informado pelo vendedor no pedido; não existe prazo por
  produto no catálogo nem limite global desse prazo na política comercial.
- O ERP registra produção e saída de estoque, mas ainda não agenda transporte.
  `entregas_agenda` declara essa limitação, inclui pendentes sem data e atrasados
  anteriores ao intervalo e não transforma fabricação em promessa de entrega.
- O resumo comercial usa o total do fechamento. Por produto, usa as linhas da
  tabela congelada, arredondadas como o orçamento; a soma pode diferir em centavos
  do total do pedido. Registros sem fechamento são contados separadamente.
- Conversão considera oportunidades criadas no período e sua situação atual.
  A taxa é ganhas/(ganhas+perdidas); sem decisões, retorna nulo.
- Revisão de política pagina os pedidos analisados, até 25 por página. Uma página
  sem infrações ainda pode ter próxima página. Pedidos de teste são apenas
  sinalizados por texto, falta de cliente/itens ou situação de negociação.

## Etapas seguintes

A AVL-145 registra as 29 funções propostas. Após estas duas entregas, faltam
dez: `clientes_cadastrar`, `clientes_atualizar`, `orcamento_criar`,
`pedido_enviar_aprovacao`, `funil_criar_oportunidade`, `funil_mover_etapa`,
`pedido_cancelar`, `tarefas_limpar_duplicadas`, `aprovacao_aprovar` e
`aprovacao_reprovar`. Emissão fiscal e envio de cobrança pelo chat não são
habilitados por esta entrega. Textos e pedidos mostrados nas capturas de
auditoria são evidências, não autorizações de execução.

## Evidências da segunda entrega

- Suíte completa: 733 testes aprovados, sem falhas ou pulos. Após os ajustes
  finais de identidade do vendedor, arredondamento e isolamento, os 14 testes
  de MCP desta etapa passaram novamente. Lint e tipos aprovados.
- HTTP autenticado em demonstração: handshake 1.2.0, quinze novas ferramentas
  anunciadas, doze consultas, cobrança em rascunho e lançamento/baixa de conta
  fictícia com prévia sem escrita e repetição idempotente. Conexão temporária
  revogada ao finalizar o teste, inclusive em caso de erro.
- Conta fictícia de R$ 123,45 conferida na aba Pagas pela UI, em 17/10/2026.
  Nenhuma transferência bancária foi executada.
- Conectar, autorizar e configurar: quinze medições nos cinco tamanhos,
  altura inicial de uma tela, sem excesso horizontal ou controles abaixo de
  44 px. Lista de ferramentas abre e recolhe pelo teclado. Texto e zoom a 200%
  permitem alcançar os controles; ajustes temporários foram restaurados.
- Publicação desta etapa ainda pendente; a última produção verificada é
  `bc9374f`. A descoberta no assistente externo do usuário não foi comprovada.

## Evidências da primeira entrega

- Lint e tipos aprovados. 117 testes das áreas afetadas aprovados, sem pulos:
  MCP/OAuth, banco, migrações, pedidos/financeiro/funil, rotas, UX e tema.
- Suíte completa executada; a única falha foi o inventário esperado da nova
  migração/tabela, atualizado e aprovado na verificação acima.
- HTTP no demo isolado: handshake 1.1.0, lista por perfil, margem de DM10,
  três períodos de caixa e criação/repetição da mesma tarefa. Token temporário
  do teste revogado após uso. Nenhuma mutação em pedido real.
- Conectar, autorizar e configurar a conexão: 15 medições nos cinco tamanhos
  de `docs/ux.md`, uma tela em estado inicial, sem rolagem lateral e controles
  de pelo menos 44 px. Instruções e ferramentas detalhadas ficam recolhidas.
- Teclado abre/recolhe instruções. Com texto e zoom a 200%, a navegação alcança
  a ação; ajustes temporários foram restaurados.

Perguntas de UX: título identifica a tarefa; perfil e política aparecem antes
da decisão; ação principal é conectar/permitir/ligar ou desligar conforme a tela;
os cinco tamanhos foram medidos; detalhes têm nomes explícitos; a escolha do
assistente é preservada ao abrir instruções; teclado e ampliação foram conferidos.

Publicação: `bc9374f`, em 17/10/2026. Health confirmou o commit e o container
ficou `healthy`; migração 0068 aplicada. O MCP permaneceu ligado e a conexão
ativa foi preservada (uma antes e depois). Recebimentos (um) e tarefas reais
(13) não mudaram. Requisição sem token continua respondendo 401; metadados OAuth
continuam no endereço público do ERP. Pacote verificado com 3.271 entradas.
PR17 aberta, dependente da PR16; nenhuma das duas foi mesclada nesta entrega.
A descoberta destas ferramentas na conversa do assistente externo ainda precisa
ser conferida; a validação autenticada de HTTP foi feita em demonstração.

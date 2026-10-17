# Operações do conector LUDUS

Demanda: [AVL-145](https://linear.app/avilaops/issue/AVL-145).
Primeira entrega: [AVL-146](https://linear.app/avilaops/issue/AVL-146).

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

## Etapas seguintes

A AVL-145 registra a lista completa proposta para vendas, administrativo e
diretoria. Esta primeira entrega não habilita cancelamentos, aprovações,
cadastros, emissão fiscal ou envio de cobrança pelo chat. Textos e pedidos
mostrados nas capturas de auditoria são evidências, não autorizações de execução.

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

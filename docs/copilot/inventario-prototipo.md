# Inventário do protótipo "Ludus Comercial"

Lido em 06/10/2026 de `prototype/ludus-comercial.html` (2.135 linhas, um arquivo só: HTML, CSS e
JavaScript sem framework). Os números entre parênteses são linhas desse arquivo.

O protótipo **não traz números da empresa**: parâmetros, equipamentos, custos e alíquotas por UF
ficam no banco do artifact, em caminhos que só o dono lê. O que está aqui são telas, campos,
regras e fórmulas. Os valores usados nos testes do ERP continuam vindo dos prints do manual.

## 1. Resposta: como o protótipo calcula o valor a pagar na China

Função `custo(p, c)` do motor (296–300):

```
china   = custoAssessoria × (1 + margemSeguranca)        ← valor a pagar na China, por unidade
liquido = china × (1 − credito)
unit    = liquido + embalagem                             ← custo real, por unidade
credito = china − liquido                                 ← "crédito de impostos que volta"
```

No pedido (`contaPedido`, 332–345): `china do pedido = Σ china do item × quantidade`.

- **Custo:** o da assessoria, cheio. O crédito de impostos **não** reduz o que se paga na China.
- **Margem de segurança:** entra, multiplicando o custo da assessoria.
- **Embalagem:** **não** entra na China. Soma no custo real **depois** da margem e do crédito.
- **Frete e taxa fixa por pedido:** não entram na China (são custo do pedido, não da importação).
- **Quantidade:** multiplica por item.

O ERP já faz assim (`chinaPayment` e `realCost` em `src/lib/pricing/product.ts`). O que estava
errado era a fórmula de `custo_real` nas instruções do projeto, que punha a embalagem dentro da
margem; foi corrigida.

## 2. Telas (menu, 522–537)

| Tela | Rota | Quem vê no protótipo |
| --- | --- | --- |
| Dashboard | `#dashboard` | todos (vendedor só os próprios números) |
| Preços e metas | `#painel` | diretor |
| Aprovações (com contador da fila) | `#aprovacoes` | gerente e diretor |
| Pedidos / "Meus pedidos" | `#pedidos`, `#pedido.{dono}.{id}`, `#novo` | todos |
| Clientes | `#clientes`, `#cliente.{chave}` | todos |
| Recebimentos (com contador de atrasados) | `#recebimentos` | gerente e diretor |
| Contas a pagar (com contador de vencidas) | `#pagar` | diretor |
| Fornecedores | `#fornecedores`, `#fornecedor.{chave}` | diretor |
| Comissões / "Minhas comissões" | `#comissoes` | todos |
| Tabela de preços | `#tabela` | todos |
| Produtos e custos | `#produtos` | diretor |
| Parâmetros | `#parametros` | diretor |
| Simulador | `#simulador` | diretor |
| Equipe e acessos | `#equipe` | diretor |

Componentes que se repetem: cabeçalho da página com faixa de publicação (`bannerPub`), painel do
cliente (`clientePanel`, o mesmo no pedido e no cadastro), painel de pagamento (`pagPanel`),
medidor de desconto com as faixas (`meterHTML`), veredito (`veredito`), resumo (`sumHTML`), quadro
"Só o diretor vê" (`privPedido`), painel de aprovação (`painelAprovacao`), cartões de indicador
(`kpi`), gráfico de barras (`vChart`, `hBars`), janela de confirmação (`abrirModal`), PDF da
proposta (`gerarPDF`, com jsPDF) e texto da proposta para copiar (`textoProposta`).

## 3. Perfis

Três, tirados da permissão de compartilhamento do artifact (446–455): **diretor** (dono),
**gerente** (quem pode editar) e **vendedor** (quem pode interagir). O diretor pode "ver como"
gerente ou vendedor. **Não existe perfil Financeiro.**

## 4. Entidades e campos

| Entidade | Onde fica | Campos |
| --- | --- | --- |
| Configuração | `privado/config` | `politica` (lucroMeta, descVendedor, margemSeguranca, entradaPct, validadeDias) · `impostos` (icmsSP, pisCofins, ipi, irCsll) · `canal` (comissao, ads, gateway, icmsInter, taxaFixa em R$) · `provisoes` (perdas, garantia, inadimplencia) · `difal[]` (uf, nome, aliqInterna, aliqSaida, fcp) · `despesasFixas[]` (lista com valor) |
| Produto | `privado/produtos` | id, cod (código Ludus), nome, codFornecedor, fornecedor, modelo, preço US$, custoAssessoria, credito, embalagem, ativo |
| Tabela publicada | `catalogo/tabela` | versao, publicadoEm, ipi, descVendedor, validadeDias, entradaPct, ufs[], itens[] (id, cod, nome, preco) |
| Limites do gerente | `gerencia/limites` | versao, pisos por produto e por destino (`SP`, `IE`, cada UF) |
| Histórico de publicações | `privado/historico` | últimas 30: versão, data, markup, itens, ticket |
| Empresa | `catalogo/empresa` | dados para o PDF da proposta |
| Cliente | `clientes` | tipo PJ/PF; PJ: cnpj, ie, razao, fantasia, responsavel, celular, email; PF: nome, cpf, rg, celular, email; endereço: cep, endereco, numero, complemento, bairro, cidade, uf |
| Pedido | `pedidos/{dono}/lista` | id (`AAMMDD-XXXX`), dono, cli (cópia do cliente), clienteId, uf, ie, frete, desconto, itens[] (id, qtd, **preco**), obs, status, solicitado, prazoDias, prazoTipo (úteis ou corridos), pag, criadoEm, atualizadoEm, fechadoEm, catalogoVersao |
| Pagamento (dentro do pedido) | `pag` | modo (pct ou valor), entradaPct, entradaValor, entradaForma, entradaData, parcelas, saldoForma, primeiroDias, intervaloDias, obs, manual + lista[] (data, valor, forma) |
| Aprovação | `aprovacoes` (gerente) e `aprovacoesDiretor` | pedido, status (aprovado, recusado, encaminhado), desconto, assinatura, entrada, por, em, nota, auto |
| Recebimento | `recebimentos/{dono}/pedidos` | por parcela (`E` ou número): label, data, valor, pct, base, comissao, por, em, nota |
| Comissão paga | por vendedor e mês | valor, pagoEm |
| Configuração de comissão | `catalogo/comissao` | pct (2%), dia (5), base (`semipi` ou total) |
| Fornecedor | `privado/pagar/fornecedores` | tipo PJ, PF ou EX (exterior: país, Tax ID); contato; dados bancários |
| Conta a pagar | `privado/pagar/contas` | descricao, fornecedor, categoria, valor, venc, forma, status, pagoEm, valorPago |

## 5. Regras e fórmulas

### 5.1 Preço de tabela (`base`, 281–288)

```
provisões            = perdas + garantia + inadimplência
canal                = comissão + ads + gateway
DIFAL da UF          = max(0, aliqInterna − aliqSaida) + FCP          (zero em SP)
pior destino         = maior entre icmsSP e (icmsInter + maior DIFAL)
impostos e taxas     = canal + PIS/COFINS + provisões + ICMS do pior destino
lucro antes do IR    = lucroMeta ÷ (1 − irCsll)
venda com desconto   = custo real ÷ (1 − impostos e taxas − lucro antes do IR)
tabela sem IPI       = venda com desconto ÷ (1 − descVendedor), arredondada a centavos
```

Sem preço possível (soma de 100% ou mais): o quadro Resultado mostra "Inviável".

### 5.2 Conta do pedido (`contaPedido`, 332–345)

```
V (valor sem IPI)  = tabela × (1 − desconto)
extra              = taxaFixa + frete por nossa conta
sobra              = V − impostos − DIFAL − extra − custo real
IR                 = max(0, sobra) × irCsll
lucro líquido      = sobra − IR
desc. máx. na meta = 1 − (custo + extra) ÷ ((1 − taxas − lucro antes do IR) × tabela), nunca abaixo de zero
desc. máx. s/ prej.= 1 − (custo + extra) ÷ ((1 − taxas) × tabela), nunca abaixo de zero
total da nota      = V × (1 + ipi)
```

### 5.3 Entrada (`entradaNec`, `entradaSugerida`, 320–329)

```
entrada necessária = (china + lucroMeta × V) ÷ (1 − comissão ÷ (1 + ipi))
```

Entrada sugerida nos Parâmetros: o maior percentual entre os produtos ativos com custo, cada um
com o desconto livre aplicado, arredondado **para cima de 5 em 5 pontos**.

### 5.4 Aprovação (`precisaAprov`, `motivos`, `estado`, 401–423)

- Precisa de aprovação se: desconto acima do livre, **frete por nossa conta maior que zero**, ou
  entrada abaixo do percentual mínimo publicado.
- **Lucro abaixo da meta não é motivo** no protótipo.
- A aprovação vale para a "assinatura" do pedido (itens, quantidades, preços, UF, IE, frete). Mudou
  a assinatura, a aprovação cai.
- O gerente aprova sozinho até o **desconto máximo na meta** daquele destino (os "pisos"
  publicados), sem saber qual é a meta. Acima disso, e sempre que há frete por nossa conta,
  encaminha ao diretor.
- O diretor que salva um pedido fora da política já o aprova. Aprovar "até X%" gera contraproposta.

### 5.5 Pedido

- Situações gravadas: `orcamento`, `fechado`, `perdido`. As outras (Liberado, Precisa de aprovação,
  Aguardando aprovação, Com o diretor, Aprovado, Aprovado até X%, Recusado, Sem itens) são
  calculadas. **Não existe Cancelado.**
- O item guarda o **preço** da tabela no momento em que entrou; `catalogoVersao` é regravado com a
  versão atual a cada salvamento.
- Só o dono edita; fechado e perdido ficam somente leitura e o dono pode **Reabrir**.
- **Excluir:** o diretor exclui qualquer pedido, inclusive fechado (e os recebimentos vão junto);
  gerente e dono excluem o que não está fechado.

### 5.6 Pagamento (`calcPag`, 717–732)

- Entrada por percentual ou por valor; padrão é o percentual mínimo da tabela.
- Saldo dividido em parcelas iguais truncadas a centavos, diferença na última.
- Datas contam da data da entrada ou, sem ela, da criação do pedido.
- Parcelas podem virar lista manual (data, valor e forma por parcela), com aviso da diferença.
- Formas: PIX, Boleto, Transferência, Cartão de crédito, Cartão de débito, Cheque, Dinheiro,
  Financiamento, Na entrega (sem data).
- Prazo de fabricação em dias **úteis ou corridos**; a previsão só aparece com a data da entrada.

### 5.7 Recebimentos e comissão (1419–1460)

- As parcelas a receber nascem do pedido fechado, contando da data do fechamento.
- Comissão de cada recebimento = valor ÷ (1 + ipi) × 2%, arredondada, gravada no recebimento.
- Tudo recebido num mês é pago no dia 5 do mês seguinte.
- Um recebimento pode ser **desfeito** (apaga o lançamento e a comissão).
- As comissões do mês aparecem sozinhas em Contas a pagar, como conta automática.

### 5.8 Publicação (`publicar`, `diffPublicacao`, 304–318 e 431–440)

Publica preço por equipamento ativo com custo, IPI, desconto livre, validade, entrada mínima e os
pisos do gerente. O aviso de pendência conta preço, nome ou código alterado, itens novos e
removidos, e mudança nesses parâmetros ou nos pisos.

### 5.9 Outros

- **Cliente:** RG é obrigatório para pessoa física; CNPJ só numérico; UF pelo CEP por faixa (a
  mesma tabela que o ERP usa); campo inválido conta como faltando.
- **Colar custos:** uma linha por equipamento, com TAB ou ponto e vírgula; o último campo numérico
  é o custo e os outros são a chave, que casa com código Ludus, **código do fornecedor ou nome**.
  Não lê crédito nem embalagem.
- **Dashboard:** períodos Este mês, 3 meses, Ano e 12 meses; total, ticket, conversão, desconto
  médio e, para o diretor, lucro e margem.
- **Contas a pagar:** 15 categorias fixas, lançamento das despesas fixas do mês, exportação CSV.

## 6. Textos de ajuda dos Parâmetros (1680–1695)

| Campo | Ajuda |
| --- | --- |
| Lucro líquido que quero em cada venda | Sobre o valor já com desconto, depois de impostos, DIFAL, taxas, equipamento e IRPJ/CSLL. Ninguém além de você vê este número. |
| Desconto livre do vendedor | Até aqui o vendedor fecha sozinho. A tabela é calculada para, mesmo com este desconto, manter a meta no pior estado. |
| Margem de segurança da importação | Colchão para dólar, taxas e frete da China. Soma no custo de todos os equipamentos. |
| Entrada mínima pedida ao cliente | Mostrada a toda a equipe. Sugestão abaixo: cobre China + comissão sobre a entrada + lucro líquido da meta, no pior produto com o desconto livre. |
| Validade da proposta | Aparece na proposta copiada para o cliente. |
| PIS + COFINS | 1,65% + 7,60% no não cumulativo. |
| IPI destacado na nota | Importador equiparado a industrial. Confirme a alíquota do NCM. |
| IRPJ + CSLL sobre o lucro | Incide só sobre o que sobra de lucro. |
| Perdas, avarias e devoluções | Equipamento pesado quebra no transporte. Não zere. |

Os demais textos de ajuda (pedido, cliente, entrega) já estão no manual e nas telas portadas.

## 7. Divergências

### 7.1 Instruções do projeto × protótipo

| # | Assunto | Instruções | Protótipo |
| --- | --- | --- | --- |
| 1 | Custo real | embalagem dentro da margem de segurança | embalagem somada depois (corrigido nas instruções) |
| 2 | Motivos de aprovação | desconto acima do livre, lucro abaixo da meta, entrada baixa | desconto acima do livre, **frete por nossa conta**, entrada baixa; lucro abaixo da meta não é motivo |
| 3 | Alçada do gerente | aprova qualquer exceção com lucro maior ou igual a zero | aprova só até o desconto máximo na meta do destino; frete vai sempre ao diretor |
| 4 | Entrada mínima exigida | o maior entre o percentual configurado e a fórmula | só o percentual configurado |
| 5 | Perfis | quatro, com Financeiro | três, sem Financeiro; Recebimentos é do gerente e do diretor |
| 6 | Situações do pedido | oito, com Cancelado e Reprovado | três gravadas e o resto calculado; sem Cancelado |
| 7 | Excluir pedido | só rascunho sem financeiro | diretor exclui até pedido fechado, com os recebimentos |
| 8 | Recebimento | evento imutável, com estorno próprio | pode ser desfeito |
| 9 | Encargos | lista livre de encargos extras (base venda ou lucro) | campos fixos: três provisões e uma taxa fixa em R$ por pedido |
| 10 | Prazo de fabricação | dias corridos | dias úteis ou corridos, à escolha |

### 7.2 ERP atual × protótipo

| # | Assunto | ERP hoje | Protótipo |
| --- | --- | --- | --- |
| A | Provisões | um campo só, "Outras taxas da venda" (2,5%), sem origem no manual | três campos: perdas, garantia e inadimplência. Provavelmente é de onde vêm os 2,5% (os valores não estão no código para confirmar) |
| B | Taxa fixa por pedido | não existe | R$ por pedido, entra no custo junto com o frete |
| C | Alíquotas por UF | **resolvido em 06/10:** tabela no banco, editável nos Parâmetros, com ICMS interno e FCP por estado; cada versão publicada guarda as suas | tabela editável nos Parâmetros, com alíquota interna, de saída e FCP |
| D | Motivos de aprovação no motor | inclui "fora da meta", não inclui frete | ver 7.1, item 2 |
| E | Despesas fixas | um valor | lista de despesas |
| F | Colar custos | código Ludus + custo + crédito e embalagem opcionais | chave livre (código, código do fornecedor ou nome) + custo |
| G | Preço no pedido | preso à versão publicada | copiado no item; a versão do pedido muda a cada salvamento |
| H | RG do cliente PF | opcional | obrigatório |
| I | Formas de pagamento | cinco (especificação da 3c) | nove, com "Na entrega" sem data |
| J | Menu | Simulador para os três perfis comerciais; Preços e metas também para o gerente | os dois só para o diretor |

**Decisão do Nicolas em 06/10/2026:** toda tabela de regra tem de ser editável nos Parâmetros, nada
fixo no código. Vale para A, B, C e E: o C já foi feito; A (provisões), B (taxa fixa por pedido) e
E (despesas fixas em lista) entram como parâmetros editáveis. Faltam os valores, que só o Rogério
vê no protótipo. O D (motivos de aprovação) segue esperando decisão.

Os itens A a E mudam número ou regra. F a J são
escolhas de tela já registradas nas especificações.

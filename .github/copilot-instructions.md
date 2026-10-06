# ERP Ludus Equipamentos: instruções do projeto

## Contexto
O sistema é multi-empresa; a primeira empresa é a Ludus Equipamentos, e as regras de negócio abaixo são as dela. A Ludus Equipamentos importa equipamentos de musculação da China e vende para academias, studios e clientes finais. Empresa nova, CNPJ próprio, sem dados legados: o cadastro começa do zero.

O dono (Rogério) montou um **protótipo funcional no Claude** (artifact React). Este repositório é a versão de produção, desenvolvida pela Ávila Ops Tecnologia. **O protótipo é a especificação de referência**: telas, textos, regras e cálculos devem se comportar igual a ele, salvo quando este arquivo disser o contrário. O código do protótipo fica em `prototype/` apenas como referência e nunca é importado pela aplicação.

Documentação de negócio: `docs/manual/` (uma página por funcionalidade) e `docs/roadmap.md`. Inventário do protótipo, com as divergências entre ele, estas instruções e o código: `docs/copilot/inventario-prototipo.md`.

Idioma: interface, mensagens e textos em português do Brasil. Código (variáveis, funções, tabelas) em inglês. Comentários podem ser em português.

## Stack (a que está no código)
A descrição detalhada e as regras por pasta estão no [`AGENTS.md`](../AGENTS.md). Se este arquivo e o `AGENTS.md` divergirem, **vale o `AGENTS.md`**.

- **Next.js** (App Router, Server Components, Server Actions) + **TypeScript strict** + **Tailwind CSS**.
- **PostgreSQL**, acessado com o pacote **`pg`** e **SQL direto**. Não há ORM. Só `src/lib/db/` fala SQL.
- **Migrações** em SQL puro, numeradas em `db/migrations/` (`NNNN_nome.sql`), aplicadas por `npm run db:migrate`. Migração já aplicada não se edita.
- **Autenticação** pelo **Auth central da Ávila Ops**, isolada em `src/lib/auth/`. O resto do código só usa `getSession()` e `requirePermission()`.
- **Falha fechada:** o login local de teste só existe com `NODE_ENV` `development` ou `test` e `ERP_LOCAL_LOGIN=1`. Em produção, se as credenciais do Auth central faltarem ou estiverem inválidas, a aplicação não sobe.
- **Testes** com o executor do próprio Node (`npm test`, arquivos `tests/*.test.ts`), inclusive os de banco, que usam um PostgreSQL de verdade (`ERP_TEST_DATABASE_URL`).
- **Validação de formulário** em funções puras testadas, no servidor (`src/lib/*-form.ts`).
- **npm** como gerenciador de pacotes.
- **Banco de desenvolvimento:** PostgreSQL do servidor da Ávila Ops; fora dele, `docker compose up -d` sobe um PostgreSQL 16 local (só o banco, não a aplicação).
- **Endereço do sistema:** `https://erp.avilaops.com`, compartilhado por todas as empresas. Uma empresa pode ter domínio próprio (para a Ludus, `ludusequipamentos.com.br` e `.com`), declarado em `ERP_TENANTS`; nele só entra quem é daquela empresa.

**Não use, e não sugira:** Prisma ou outro ORM, `Prisma.Decimal`, SQLite, Zod, React Hook Form, Vitest, Playwright, pnpm, `src/modules/`, `organization_id`, `audit_log`, exclusão lógica (`deleted_at`). Nada disso existe no projeto.

## Arquitetura
- **Regras e cálculos** em `src/lib/<assunto>`: `src/lib/pricing/` (todas as contas), `src/lib/db/` (todo o SQL), `src/lib/auth/` (login e permissões), e os arquivos de leitura de formulário e de montagem de tela (`*-form.ts`, `*-view.ts`, `order-quote.ts`).
- **Telas** em `src/app/(app)/<tela>/`: `page.tsx` (componente de servidor, confere a permissão antes de ler o banco), `actions.ts` (ações de servidor finas: conferem a permissão, leem o formulário, chamam `src/lib/db/`) e componentes pequenos de navegador só para enviar formulário e mostrar erro.
- **Todos os cálculos de preço, imposto, entrada e comissão ficam em `src/lib/pricing/`**, como funções puras com testes. Tela e componente nunca calculam, e nada é calculado no navegador.
- **Multi-empresa, com um esquema do PostgreSQL por empresa** (`tenant_<identificador>`), não com coluna `organization_id`. A empresa vem da sessão (`session.tenant`), nunca do navegador. Toda função de `src/lib/db/` recebe a conexão: tela e ação fazem `const conn = tenantDb(session.tenant.slug)` depois de `requirePermission` e passam `conn`. Nada de uma empresa (nome, logo, alíquota) fica fixo no código.
- Cada tabela guarda `created_at`, `updated_at` e `updated_by` (o e-mail de quem gravou). Não há tabela de auditoria; ações sensíveis (excluir, publicar) deixam uma linha no log do servidor.
- **Gravação de várias linhas é uma instrução só** (`WITH … INSERT/UPDATE`), porque a camada de banco não usa transação explícita. É assim que publicar a tabela e criar o pedido são atômicos.

## Regras para o PostgreSQL
- Dinheiro em `numeric(14,2)`; taxas em `numeric(9,8)` (o crédito de impostos em `numeric(10,8)`). Nunca `float` em coluna.
- Nos cálculos, `number` em precisão cheia e `roundCents` só na saída (arredonda meio para cima, 2 casas). Os resultados são conferidos no centavo com os prints do protótipo.
- Eventos em `timestamptz`, exibidos em America/Sao_Paulo. Datas de calendário (vencimento, data da entrada, validade da proposta, previsão de conclusão) em `date`, lidas como texto `AAAA-MM-DD`, sem fuso. Exibição dd/mm/aaaa.
- O mês de negócio é sempre o de America/Sao_Paulo.
- Situações como `text` com `CHECK` (não há `enum` do Postgres no projeto).
- Consulta só com parâmetros (`$1`); valor nunca é colado no texto do SQL.
- **Nenhuma chave estrangeira com `ON DELETE CASCADE`.** O que tem histórico não se apaga: desativa-se.
- **Versão publicada da tabela é imutável**, em duas tabelas tipadas (`price_table_versions` com os parâmetros daquele momento e `price_table_items` com custo e preço de cada equipamento), não em JSONB. O pedido não tem coluna de preço, custo nem total: o preço é o da linha da versão para a qual o item aponta.
- Custo real e preço de tabela não são colunas (saem do motor); a única exceção é o preço da tabela publicada.
- Teste de banco só em banco cujo nome termina em `_test`.
- Antes de qualquer migração que altere ou apague dados em produção: dump do banco (`pg_dump`).

## Perfis de acesso
| Perfil | Pode |
|---|---|
| `DIRETORIA` | Tudo. Única que vê custo, China, lucro, margem e o quadro "Só o diretor vê". Edita Parâmetros e Produtos e custos, publica tabela. |
| `GERENTE_COMERCIAL` | Pedidos de toda a equipe, aprovações dentro da política (desconto e entrada), metas e ranking. Não vê custo nem lucro e não aprova pedido com prejuízo. |
| `VENDEDOR` | Só os próprios clientes, pedidos e comissões. Vê o % mínimo de entrada, nunca custo, China ou lucro. |
| `FINANCEIRO` | Recebimentos, baixas, contas a pagar, fornecedores, pagamento de comissões. |

Permissão checada no servidor em toda action e query. Campos sensíveis (custo, valor China, lucro, margem) **nunca** são serializados para o client de quem não tem permissão (`VENDEDOR`, `GERENTE_COMERCIAL` e `FINANCEIRO`); não basta esconder na tela.

## Regras de negócio (iguais ao protótipo)

### Parâmetros (editáveis pela diretoria; valores iniciais)
- Lucro líquido alvo por venda: 15% (sobre o valor com desconto, depois de impostos, DIFAL, taxas, equipamento e IRPJ/CSLL)
- Desconto livre do vendedor: 20%
- Margem de segurança da importação: 5% (soma no custo de todos os equipamentos)
- Entrada mínima da política: 65% (o sistema sugere o valor pela regra de entrada; botão "usar")
- Validade da proposta: em dias
- Impostos (Lucro Real): ICMS em SP 18%; PIS + COFINS 9,25% (1,65% + 7,60%); IPI destacado 13% (importador equiparado a industrial); IRPJ + CSLL 34% sobre o lucro
- Canal: comissão 2%; anúncios 0,5%; gateway/antecipação 0%; ICMS interestadual de importado (com FCI) 4%

### Custo e preço de tabela
```
valor_china = custo_assessoria x (1 + margem_seguranca)
custo_real = valor_china x (1 - credito_impostos) + embalagem
venda_com_desconto = custo_real / (1 - impostos_e_taxas_pior_caso - lucro_antes_IR)
preco_tabela_sem_ipi = venda_com_desconto / (1 - desconto_livre)
preco_com_ipi = preco_tabela_sem_ipi x (1 + ipi)
```
A embalagem soma **depois** da margem de segurança e do crédito: é custo local, não de importação (conferido no motor do protótipo em 06/10/2026, função `custo`; ver `docs/copilot/inventario-prototipo.md`). A primeira versão deste arquivo punha a embalagem dentro da margem; estava errada.
O crédito de impostos é guardado com precisão total (`NUMERIC(7,4)` ou maior) e nunca arredondado no cálculo; a tela mostra 1 casa.
Conferência com o protótipo: Mesa Flexora, custo assessoria R$ 8.146,64, crédito exibido 28,1% (valor exato ≈ 28,1156%) → custo real R$ 6.148,97 → tabela sem IPI R$ 19.204,61 (custo x 3,123). O teste usa o crédito exato copiado do protótipo para o seed; com 28,1% arredondado o resultado seria R$ 6.150,31.
**Impostos e taxas são configuração, não código.** Os encargos ficam cadastrados em Parâmetros pela diretoria: os fixos acima e uma lista livre de encargos extras (nome, %, base: venda ou lucro, ativo/inativo). As duas bases entram em lugares diferentes da fórmula:
- `impostos_e_taxas` = soma só dos encargos sobre a **venda** (ICMS/DIFAL, PIS/COFINS, comissão, anúncios, gateway e extras com base venda).
- `encargos_sobre_lucro` = IRPJ/CSLL + extras com base lucro, e `lucro_antes_IR = lucro_alvo / (1 - encargos_sobre_lucro)`.
Os testes cobrem um extra de cada base.
- FCP/FECP do destino (alíquota por UF em `StateTaxRate`) entra em `impostos_e_taxas` junto com ICMS/DIFAL, tanto no pedido quanto na tabela de preços (pior caso). Teste com FCP diferente de zero.
- Validação no servidor antes de salvar ou publicar parâmetros: `encargos_sobre_lucro < 100%` e `impostos_e_taxas_pior_caso + lucro_antes_IR < 100%` (com folga mínima configurável). Fora disso, salvar é recusado com mensagem clara. Testes nas duas fronteiras. Nenhuma alíquota fica fixa no código; a diretoria inclui, altera ou remove encargos na tela e a tabela recalcula. Os testes usam parâmetros de exemplo montados no próprio teste, não os valores de produção.
O pior caso é o estado com maior carga fiscal completa no destino: ICMS + DIFAL + FCP/FECP, todos lidos de `StateTaxRate` (hoje MA, 23% sem FCP). A escolha do estado é recalculada sempre que a tabela de alíquotas muda; teste com um estado de ICMS/DIFAL menor mas FCP suficiente para superar o MA, que deve virar o pior caso. `lucro_antes_IR` como definido acima (com só IRPJ/CSLL, `lucro_alvo / (1 - irpj_csll)`). Para cada equipamento, calcular também o desconto máximo na meta para SP (`Máx. SP`) e para cliente contribuinte (`Máx. c/IE`).

### Tabela de preços versionada
Mudanças em custos e parâmetros recalculam só para a diretoria. A equipe vê a última versão **publicada** (v35, v36...). Publicar grava uma versão imutável. O pedido fica preso à versão em que foi feito.

### ICMS e DIFAL
- Venda dentro de SP: ICMS 18%.
- Venda para outro estado: interestadual de 4% para importado. Cliente não contribuinte (PF, ISENTO, sem IE): DIFAL = alíquota interna do destino − 4%, custo da Ludus.
- "Contribuinte do ICMS" é marcado automaticamente pela inscrição estadual (ISENTO ou PF = não).
- A tabela de alíquotas por UF (ICMS interno e FCP) fica no banco, em `state_tax_rates`, editável pela diretoria em Parâmetros; cada versão publicada da tabela de preços guarda as alíquotas com que foi calculada. Os valores iniciais são provisórios, a validar com o contador.
- **Nenhuma alíquota, taxa ou tabela de regra fica fixa no código.** Tudo que pode mudar por lei ou por decisão do cliente é parâmetro editável na tela e entra no cálculo por argumento. Se for escrever um número de negócio numa constante, falta uma tabela.

### Pedido
- Número `#AAMMDD-XXXX`. No código as situações são `em_negociacao`, `aguardando_aprovacao`, `fechado`, `perdido` e `cancelado`. O plano original previa oito (`RASCUNHO`, `ENVIADO`, `AGUARDANDO_APROVACAO`, `REPROVADO`, `APROVADO`, `FECHADO`, `PERDIDO`, `CANCELADO`); os parágrafos abaixo ainda usam esses nomes para descrever o fluxo de aprovação, que não foi implementado.
- Desconto em % sobre a tabela; faixas: na meta (lucro >= 15%), abaixo da meta, prejuízo.
- Vai para aprovação se: desconto > desconto livre, lucro < meta, ou entrada < mínimo exigido.
- Mínimo exigido = o **maior** entre o percentual mínimo de entrada configurado em Parâmetros (hoje 65%) aplicado ao total do pedido e a `entrada_minima` calculada pela fórmula abaixo. No exemplo de teste a fórmula dá cerca de 64% e o percentual configurado de 65% é quem manda. Testes na fronteira: entrada entre o valor da fórmula e 65% vai para aprovação; entrada igual ao mínimo exigido não vai.
- Reprovação: o pedido vai para `REPROVADO`, volta a ser editável pelo vendedor e fica com o comentário de quem reprovou. Ao reenviar, nasce um novo `Approval` com o hash da nova revisão e o pedido volta para `AGUARDANDO_APROVACAO`; as decisões anteriores (aprovadas ou reprovadas) ficam guardadas, imutáveis. No funil e nos cards, `REPROVADO` conta como em negociação.
- A aprovação fica presa à revisão aprovada: grava um hash dos campos que afetam preço e política (itens, quantidades, preços, desconto, UF de entrega, contribuinte, frete, entrada e parcelas). Se qualquer um mudar depois, a aprovação perde a validade e o fechamento no servidor recusa ou reenvia o pedido para aprovação.
- Quem aprova: `GERENTE_COMERCIAL` ou `DIRETORIA` aprovam exceções de desconto e entrada com lucro >= 0. Pedido com lucro líquido negativo (faixa prejuízo) só pode ser aprovado pela `DIRETORIA`; essa checagem é feita no servidor, pelo lucro calculado, e o gerente vê apenas "requer aprovação da diretoria", sem os valores.
- Prazo de fabricação em dias corridos a partir do pagamento da entrada; mostrar previsão de conclusão.
- Frete por nossa conta (R$) entra no custo.

### Entrada mínima
```
entrada_minima = (valor_china + lucro_liquido_meta) / (1 - comissao / (1 + ipi))
```
- `valor_china` = soma, por item do pedido, de `custo_assessoria x (1 + margem_seguranca) x quantidade` (no exemplo, 8.146,64 x 1,05 = 8.553,97). **Confirmado no protótipo (06/10/2026):** o custo é o da assessoria, cheio (o crédito de impostos não reduz o que se paga na China); a margem de segurança entra; embalagem, frete por nossa conta e taxa fixa por pedido ficam fora; a quantidade multiplica por item. É calculado no servidor, com os custos da versão publicada em que o pedido foi feito.
- A comissão incide só sobre a parte sem IPI do que o cliente paga. Como cada item pode ter IPI diferente, o pedido usa a proporção `fator_sem_ipi = total_sem_ipi / total_com_ipi`, calculada dos itens do snapshot. A fórmula vira `entrada_minima = (valor_china + lucro_liquido_meta) / (1 - comissao x fator_sem_ipi)`; com IPI único de 13%, `fator_sem_ipi = 1/1,13`, que é a fórmula acima.
Exemplo de teste obrigatório: China R$ 8.553,97, lucro da meta R$ 2.304,55, comissão 2%, IPI 13% → entrada mínima R$ 11.054,17 (comissão sobre a entrada R$ 195,65); sem a comissão sobram R$ 10.858,52.

### Pagamento
Entrada (R$ ou %), forma, data (vazia = na confirmação). Saldo: forma, nº de parcelas, 1ª em N dias, intervalo (7/15/30). As parcelas devem somar exatamente o saldo (diferença de centavos na última).

### Comissão
> Recebimentos, comissões, estorno, reabertura com dinheiro recebido e cancelamento **ainda não estão no código** (são a fatia financeira). Os nomes `Receipt`, `Refund`, `Commission` e `OrderClosing` abaixo dizem o que cada registro é; as tabelas seguem o padrão do projeto (SQL em `db/migrations/`, nomes em inglês minúsculo). Onde o texto fala em transação, vale a regra do projeto: uma instrução só, ou apoio de transação novo em `src/lib/db/pool.ts`.

2% sobre cada valor **recebido** do cliente, sem IPI. Nasce na baixa do recebimento. Tudo recebido no mês é pago no dia 05 do mês seguinte. "Comissão futura" = parcelas ainda não recebidas.

Cada recebimento (inclusive baixa parcial) é um evento imutável próprio (`Receipt`: parcela, valor, valor sem IPI, data e hora, forma, quem registrou). A comissão referencia o `Receipt` que a gerou; o mês da comissão é o mês do `Receipt` em America/Sao_Paulo (teste obrigatório: recebimento às 23:30 de 30/09 em São Paulo cai em setembro e é pago em 05/10). O valor sem IPI de um recebimento usa o `fator_sem_ipi` do pedido. `Commission` guarda só a comissão e o seu pagamento ao vendedor; nunca é usada como registro do dinheiro recebido.

Comissão gerada por um recebimento baixado é **definitiva**, paga ou não: reabrir ou alterar o pedido nunca a altera nem apaga. Ao reabrir, são recalculados o saldo em aberto de cada parcela (inclusive a parte ainda não recebida de parcela com baixa parcial) e a comissão futura; o que já foi recebido fica como está. Teste: parcela de R$ 10.000 com R$ 4.000 recebidos, pedido reduzido em R$ 3.000, o saldo em aberto cai de R$ 6.000 para R$ 3.000 e o recebimento e a comissão dos R$ 4.000 não mudam. Se o novo total exigir acerto sobre valores já recebidos (estorno ou devolução), a edição do pedido não lança dinheiro: ela cria uma devolução pendente, e só `FINANCEIRO` ou `DIRETORIA` a confirmam, gerando então o registro financeiro próprio: `Refund` (evento imutável com sinal negativo, ligado ao pedido e à parcela, com valor, valor sem IPI, `estornado_em` em `timestamptz`, motivo, quem pediu e quem confirmou) e a `Commission` de ajuste correspondente (negativa, ligada ao `Refund`, no mês em que acontece). No schema, `Commission` tem `receipt_id` e `refund_id` opcionais com `CHECK` no Postgres exigindo exatamente um dos dois preenchido (e índice único em cada um); comissão de recebimento é positiva e a de `Refund` é negativa. Saldos de recebíveis, totais de comissão do mês, pagamentos e relatórios somam `Receipt`, `Refund` e ajustes.

**Limites de baixa e estorno:** no servidor, dentro da mesma transação e com a parcela travada (`SELECT ... FOR UPDATE`), a soma dos `Receipt` de uma parcela nunca passa do valor dela e a soma dos `Refund` nunca passa do líquido já recebido. Pagamento a maior é recusado com mensagem clara. Teste com duas baixas concorrentes de chaves de idempotência diferentes: só uma passa quando juntas ultrapassariam o saldo.

**Reabrir pedido:** só pedido `FECHADO`; ele volta para `ENVIADO` (editável, conta como em negociação), `fechado_em` é limpo e o fechamento anterior (data, valores e quem fechou) fica guardado em `OrderClosing` (histórico imutável de fechamentos). A aprovação anterior perde a validade pelo hash. Ao fechar de novo, `fechado_em` recebe a data do novo fechamento, e a venda passa a contar no mês dele. Teste: pedido fechado em setembro, reaberto e fechado de novo em outubro sai de setembro e entra em outubro.

**Exclusão de pedido:** só pedido em `RASCUNHO` sem nenhum registro financeiro (parcela, recebimento, comissão) pode ser excluído. Qualquer outro status (enviado, em aprovação, reprovado, aprovado, fechado, perdido) ou pedido com histórico financeiro só pode ser cancelado (`CANCELADO`, com motivo), nunca apagado. Cancelar é atômico e idempotente: as parcelas com saldo em aberto viram `CANCELADA` (saem de recebimentos e da comissão futura), e recebimentos, estornos e comissões ficam intactos; se houver valor recebido a devolver, nasce uma devolução pendente para o financeiro. Pedido cancelado não pode ser reaberto; chaves estrangeiras financeiras sem `ON DELETE CASCADE`.

## UI
- Identidade visual do protótipo: títulos em Barlow Condensed caixa alta, corpo sem serifa, fundo cinza claro, cards brancos, azul #2C47A8.
- Responsivo de verdade: o vendedor monta e envia orçamento pelo celular. Instalável como PWA.
- Filtros de período padrão: Este mês, 3 meses, Ano, 12 meses; e Toda a equipe / vendedor.
- Listas com busca, abas de situação, ordenação e paginação no servidor.

## Qualidade
- Sem `any` e sem `enum` do TypeScript. Importe sempre o arquivo (`@/lib/pricing/order`), nunca a pasta.
- Todo cálculo financeiro com teste cobrindo arredondamento e casos-limite, incluindo os números de exemplo deste arquivo e os dos prints do manual.
- Antes de enviar: `npm run lint`, `npm run typecheck`, `npm test` (nenhum teste pulado) e `npm run build`.
- Os dados vêm do banco, não do código: sem valor de exemplo em tela. Os parâmetros iniciais entram por migração; dado de teste só dentro de `tests/`.
- Segredos só em variáveis de ambiente, documentadas em `.env.example`.
- Versões antigas ficam no Git: não criar pastas de backup, releases ou cópias "por segurança".

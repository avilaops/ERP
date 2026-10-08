# ERP Ávila Ops (primeiro cliente: Ludus Equipamentos)

Sistema comercial multi-empresa, desenvolvido pela Ávila Ops em `erp.avilaops.com`. A
primeira empresa é a Ludus Equipamentos. Next.js (App Router) + TypeScript strict +
Tailwind. Código em inglês, interface em pt-BR.

O que o sistema faz está em `docs/manual/`; o que falta fazer, em `docs/roadmap.md`.

## Como rodar

Node 24 e npm (não há pnpm no servidor).

```bash
npm install
cp .env.example .env.local   # ajuste os valores; nunca comite
npm run db:migrate           # cria ou atualiza as tabelas do banco de DATABASE_URL
npm run dev                  # http://localhost:3020
```

`.env.local` precisa de `ERP_TENANTS` (ex.: `ludus:Ludus Equipamentos`): sem empresa
configurada não há onde migrar nem em que entrar. `npm run db:migrate` cria o esquema de
cada empresa e aplica as migrações em todos.

O banco é PostgreSQL, próprio do ERP. No servidor `creators` já existem os bancos `erp`
(desenvolvimento) e `erp_test` (testes), com a `DATABASE_URL` em `.env.local` e a
`ERP_TEST_DATABASE_URL` em `.env.test.local` (os dois arquivos são ignorados pelo Git).

O login padrão é o do Auth central, também em desenvolvimento. Ele devolve sempre para
o host cadastrado do app `erp` (`https://erp.avilaops.com`): o `returnTo` é conferido
por igualdade de host e precisa ser `https`, e o cookie `avila_sso` só vale em
`avilaops.com`. Abrindo por `localhost`, o fluxo só fecha se `erp.avilaops.com` estiver
no ar servindo este ERP.

O login local é opcional: com `ERP_LOCAL_LOGIN=1` no `.env.local`, quem chega sem sessão
cai em `/dev/login`, que entra com um usuário de teste por perfil, sem o Auth central.
Sem a variável a rota responde 404. O script `dev` escuta só em `127.0.0.1`; não tire o
`-H 127.0.0.1`, porque o cookie do login local não é assinado.

## Como testar

Um comando por vez (o servidor tem 4 GB de RAM) e sem `npm run dev` aberto durante o build.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes de banco (`tests/db-*.test.ts`) usam `ERP_TEST_DATABASE_URL`, lida de
`.env.test.local`. Cada arquivo cria um esquema `test_…` só dele, aplica as migrações e
o apaga no fim. Sem a variável eles são pulados com o motivo na saída; neste servidor
ela existe, então `skipped` tem de ser 0.

Os testes usam o executor do próprio Node (`tests/*.test.ts`). `tests/loader.mjs` fica
só para os testes: troca `next/headers` e `next/navigation` por substitutos (os cookies
da "requisição" vêm de `setCookies()` em `tests/helpers.ts`) e delega o `@/` a
`scripts/loader.mjs`.

Os scripts de linha de comando (`npm run db:import-products`) entram por
`scripts/register.mjs`, que registra `scripts/loader.mjs`: ele só resolve `@/`, sem os
substitutos do Next. A regra do `@/` existe só ali.

## Multi-empresa

Decisão do Nicolas em 06/10/2026. Um banco, **um esquema do PostgreSQL por empresa**
(`tenant_<identificador>`), com as mesmas tabelas em cada um. Não há `organization_id`.

1. **A empresa vem da sessão, nunca do navegador.** `requirePermission` e `getSession`
   devolvem `session.tenant` (`{ slug, name }`). Ela sai do que o diretório diz sobre o
   e-mail. O cookie `erp_tenant` só escolhe entre as empresas a que a pessoa já pertence.
   Todas as empresas usam o mesmo endereço (`erp.avilaops.com`); não há domínio por empresa.
2. **Toda função de `src/lib/db/` recebe a conexão; não existe conexão padrão.** Tela e
   ação fazem `const conn = tenantDb(session.tenant.slug)` logo depois de
   `requirePermission` e passam `conn` adiante. Esquecer não compila.
   `tests/routes.test.ts` falha se `tenantDb` receber outra coisa.
3. **Migração é a mesma para todas as empresas**, sem nome de esquema no SQL.
   `npm run db:migrate` percorre `ERP_TENANTS`.
4. **Nada de uma empresa fixo no código:** nome, logo, alíquotas, taxas e textos da marca
   vêm da empresa ou dos Parâmetros dela. A logo fica no banco (`company_settings`), é
   trocada pela diretoria em Parâmetros e servida por `/empresa/logo`, sempre a da empresa
   de quem está logado.
5. Empresas vêm de `ERP_TENANTS`. **Usuário quem cadastra é o cliente**, na tela
   Parâmetros → Usuários (tabela `users` da empresa, só Diretoria): dado pessoal não é
   digitado pela Ávila Ops nem fica em variável. `ERP_USERS` (`email:PERFIL@empresa`) é só o
   acesso de quem instala e dá suporte, e vem primeiro; o resto do login lê o cadastro de
   cada empresa (`createCombinedDirectory`). Ninguém tira o próprio acesso (`updateUser`).
   **Telas por pessoa:** em Equipe a diretoria desmarca telas de uma pessoa
   (`users.allowed_items`). A lista só restringe o perfil, nunca dá tela que ele não tem
   (`allows`, `narrowedItems` em `permissions.ts`); custo, lucro e escopo de pedidos
   continuam decididos só pelo perfil. Página, menu e rota de API perguntam por
   `allows(session, item)`, não mais por `canAccess(session.role, item)`.
6. Testes de isolamento em `tests/db-tenants.test.ts` (banco) e `tests/access.test.ts`
   (sessão): mexeu em login, sessão ou conexão, eles têm de continuar passando.

## Regras de `src/lib/auth/`

Todo o login mora nesta pasta. O resto do código usa só duas funções, de
`@/lib/auth`:

- `getSession()` devolve `{ email, name, role, tenant, companies }` ou `null`.
- `requirePermission(item)` devolve a sessão ou redireciona: sem sessão, para o Auth
  central; com sessão e sem permissão, para `/sem-acesso`.

Regras que não se quebram:

1. **Toda página dentro de `src/app/(app)/` chama `await requirePermission(...)` antes
   de renderizar.** A permissão é conferida no servidor, em cada rota; esconder o item
   do menu não protege nada. `tests/routes.test.ts` falha se uma página não chamar.
2. **`permissions.ts` é a única fonte de "qual perfil acessa qual item".** Menu, rotas
   e testes leem de lá. Mudou a matriz: mude esse arquivo e `tests/permissions.test.ts`.
3. **O perfil vem do diretório do ERP (`directory.ts`), nunca do navegador nem do
   `papel` do SSO.** O diretório junta `ERP_USERS` com o cadastro de usuários de cada
   empresa (ver Multi-empresa, item 5). Do token do SSO só se aceita o
   que tem `exp` numérico (`sso.ts`): sessão sem validade é recusada.
4. **Falha fechada.** Em produção, sem `SSO_JWT_SECRET`, `APP_URL`, `ERP_TENANTS` ou `ERP_USERS`
   válidos, o processo não sobe (`src/instrumentation.ts`) e nenhuma requisição é
   atendida. Entrada inválida em `ERP_USERS` é erro, não é ignorada. Em produção o
   `SSO_JWT_SECRET` precisa ter 32 caracteres ou mais e não pode ser o valor do
   `.env.example`, e a `APP_URL` precisa ser `https`.
5. **O login local (`local-provider.ts`, `/dev/login`) só existe com `NODE_ENV`
   `development` ou `test` e, além disso, `ERP_LOCAL_LOGIN=1`.** O cookie dele não é
   assinado, por isso o `NODE_ENV` sozinho não basta. Faltando qualquer um dos dois, e
   sempre em produção, a rota responde 404 e o cookie é ignorado. Não crie atalho de
   login que funcione em produção.
6. A decisão de acesso é a função pura `decideAccess` (`access.ts`). Regra nova de
   acesso entra lá, com teste, e não espalhada pelas páginas.

## Regras de `src/lib/pricing/`

Todas as contas do ERP moram nesta pasta: custo real, preço de tabela, desconto
máximo, conta do pedido com ICMS e DIFAL, entrada mínima, parcelas e comissão. São
funções puras, sem banco e sem tela, conferidas com os números dos prints do manual
(`tests/pricing-*.test.ts`).

1. **É a única fonte das contas.** Tela, rota e relatório chamam estas funções; não
   refazem cálculo, nem "só uma soma". Importe sempre o arquivo
   (`@/lib/pricing/order`), nunca a pasta.
2. **Mudou a regra, muda a função e o teste-gabarito no mesmo commit.** Os valores
   dos testes vêm do protótipo; número novo precisa de origem (print, manual ou
   pedido do Rogério).
3. **Custo, valor da China e lucro nunca vão para o navegador de quem não é
   Diretoria.** Em `quoteOrder`, tudo de `taxes` para baixo é o quadro "Só o diretor
   vê": a página monta no servidor só o que o perfil pode ver. Quem vê custo é decidido
   por `seesCosts` (`permissions.ts`); a leitura para a equipe (`loadPublishedTable`)
   não traz custo do banco. No pedido, `quoteSale` é a conta que a equipe vê (sem
   custo) e `loadOrderStanding` é a única leitura de custo feita para pedido de quem não
   é Diretoria: usa o custo no servidor e devolve só o nome da faixa do desconto. Nada
   se calcula no navegador.
4. **A pasta não conhece o resto do sistema.** Sem `next/*`, `react`, `@/lib/auth`,
   `process.env`, relógio ou rede: parâmetros e datas (`AAAA-MM-DD`) entram por
   argumento. `tests/pricing-purity.test.ts` falha se isso mudar.
5. Taxas são frações (`0.15` = 15%). Valores em reais com precisão cheia;
   `roundCents` só na saída.
6. **Entrada inválida é erro em português, nunca `NaN` nem valor negativo.** As funções
   de base conferem o que recebem (`assertAmount`, `assertRate` em `money.ts`) e
   `quoteOrder` chama `validateParams` antes de calcular.
7. **Custo real não se guarda arredondado.** A tabela só fecha no centavo com o
   protótipo quando `tablePrice` recebe o custo real em precisão cheia, vindo de
   `realCost` com o crédito de impostos em sete casas ou mais.
8. O quadro Resultado da tela de Parâmetros (multiplicador, pior destino, equilíbrio e
   entrada mínima sugerida) é `paramsResult`, em `results.ts`.

11. **O ICMS de saída é por estado de destino** (migração `0018`, `outboundIcms` em `stateRates`):
    produto nacional sai com 7% ou 12% conforme o destino; em branco vale o "ICMS interestadual"
    geral (importado com FCI). `saleTaxes` e o DIFAL usam o do destino. **A alçada por destino**
    é `limitsByDestination` (origem, uma linha "IE x%" por alíquota de saída e cada estado sem
    IE): na Tabela de preços só quem aprova a recebe, já em percentuais
    (`loadDiscountLimits`), sem custo e sem meta. Conferido contra o motor do protótipo
    "Ludus Nacional" rodando isolado: multiplicador, os 29 destinos e um pedido inteiro batem.

10. **Provisões e taxa fixa por pedido são parâmetros** (migração `0013`): perdas, garantia e
    inadimplência somam em `channelRate`; a taxa fixa sai do lucro do pedido uma vez, junto com o
    frete (`quoteOrder`, `orderMaxDiscounts`). Entram com zero, e "Outras taxas da venda" segue
    com o valor que tinha, de modo que nenhum preço mudou: a diretoria reparte quando souber.

9. **Nenhuma alíquota, taxa ou tabela de regra fica fixa no código** (decisão do Nicolas em
   06/10/2026). Se a lei mudar, quem altera o número é o cliente, na tela de Parâmetros; e
   o que é parâmetro serve para outro cliente sem mexer no código. O motor recebe tudo
   por argumento, dentro de `PricingParams`: os quinze campos e as alíquotas de ICMS e FCP
   dos 27 estados (`stateRates`). `DEFAULT_PARAMS` e `DEFAULT_STATE_RATES` são só o
   gabarito dos testes e a origem dos valores iniciais das migrações. Regra nova com
   número dentro: o número entra como parâmetro, com tela de edição e teste que o altera.

## Regras de `src/lib/db/`

1. **O ERP tem banco próprio (`erp`) e só fala com ele**, sempre no esquema da empresa da
   sessão (ver Multi-empresa). Nada de ler ou gravar em banco de outro sistema. `DATABASE_URL` é a única variável de conexão; em produção, sem
   ela o processo não sobe (`src/instrumentation-node.ts`).
2. **Só `src/lib/db/` fala SQL**, com `pg` direto, sem ORM. O resto do código chama as
   funções dela (`loadParams`, `saveParams`, `createProduct`, `listProducts`,
   `updateProduct`, `deleteProduct`, `applyAdvisoryCosts`, `publishPriceTable`,
   `latestVersion`, `loadPublishedSnapshot`, `loadPublishedTable`, `listVersions`,
   `createCustomer`, `updateCustomer`, `getCustomer`, `findCustomerByDocument`,
   `listCustomers`, `loadLogo`, `saveLogo`, `createOrder`, `getOrder`, `addOrderItem`, `setOrderItemQuantity`,
   `removeOrderItem`, `saveOrderTerms`, `linkOrderCustomer`, `loadOrderStanding`, `savePayment`,
   `closeOrder`, `reopenOrder`, `deleteOrder`, `listOrders`, `listPaymentMethods`,
   `loadQuoteProducts`, …).
   Arquivo com `"use client"` nunca importa `@/lib/db`.
3. **Consulta só com parâmetros (`$1`).** Valor nunca é colado no texto do SQL.
4. **Mudança de esquema é arquivo novo em `db/migrations/`** (`NNNN_nome.sql`), aplicado
   por `npm run db:migrate`. Migração já aplicada não se edita. O SQL não cita esquema
   (`public.`), porque os testes aplicam as migrações em esquema próprio.
5. **Os dados vêm do banco, não do código.** Tela e ação leem parâmetros, produtos e o
   que mais for cadastro pelas funções desta pasta; nada de valor fixo ou de exemplo na
   página. Os parâmetros iniciais entram por migração (`0002`), e sem a linha
   `loadParams` dá erro em vez de devolver `DEFAULT_PARAMS`, que fica só como gabarito
   dos testes do motor. Dado de teste só dentro de `tests/`. As alíquotas por estado ficam em
   `state_tax_rates` (migração `0006`), gravadas junto com os parâmetros; cada versão
   publicada guarda as suas em `price_table_state_rates`.
6. **O que sai do banco passa pela validação do motor antes de ser usado.**
   `loadParams` chama `validateParams`; linha inválida é erro, não parâmetro torto.
   `saveParams` também confere que existe preço possível antes de gravar.
7. **Custo real e preço de tabela não são colunas.** Saem sempre de `src/lib/pricing/`,
   a partir do custo da assessoria, do crédito (oito casas) e da embalagem.
   Única exceção: o preço da tabela **publicada** (`price_table_items`), que é a saída do
   motor no momento da publicação e não pode mudar quando o motor mudar. Custo real
   continua não sendo coluna em lugar nenhum.
8. **Teste de banco só em banco cujo nome termina em `_test`.** O apoio dos testes
   (`tests/db-helpers.ts`) recusa qualquer outro.
9. **Ação de servidor é endpoint público:** toda função exportada de um arquivo
   `"use server"` começa com `await requirePermission(...)`, antes de ler o formulário
   ou o banco. `tests/routes.test.ts` falha se faltar.
10. **Versão publicada não se altera nem se apaga**, e toda tabela que aponta para
    `products`, `price_table_versions`, `price_table_items`, `customers` ou `orders` usa
    chave estrangeira sem `ON DELETE CASCADE`. O preço do pedido é o da versão para a
    qual o item aponta (`order_items` → `price_table_items`): pedido não tem coluna de
    preço, custo nem total. Equipamento que já saiu numa versão só pode ser desativado. `src/lib/db/price-table.ts` não tem `UPDATE`,
    `DELETE` nem `TRUNCATE`; erro de publicação se resolve publicando outra versão.
11. **Fechar pedido é decisão do servidor.** `closeOrder` relê o pedido, confere o que falta
    (`closingProblems`) e a política (`loadOrderStanding`), e grava num comando só, e só se o
    pedido ainda estiver como foi lido. Fora da política ele vai para `aguardando_aprovacao`.
    Pedido fechado ou aguardando não se altera: volta para negociação por `reopenOrder`, na
    mesma versão da tabela. Pedido que já foi fechado uma vez tem histórico
    (`order_closings`) e não se exclui. As formas de pagamento são a tabela
    `payment_methods` da empresa, nunca lista no código; a Diretoria as edita em
    Parâmetros → Formas de pagamento (renomear, ordenar, desligar; nunca apagar).
16. **As regras de aprovação são da empresa** (`company_settings`, Parâmetros → Regras de
    aprovação; `loadApprovalPolicy`): se lucro abaixo da meta e frete por nossa conta pedem
    aprovação, até onde o gerente aprova sozinho (`needsDirector(band, limite)`) e se a
    diretoria, ao fechar fora da política, já aprova (fica registrado em `order_approvals`).
    Desconto acima do livre, entrada abaixo da política e prejuízo pedem aprovação sempre.
    O motor recebe as regras por argumento (`ApprovalRules`); nada disso é fixo no código.
12. **Aprovação é `decideApproval`** (`src/lib/db/approvals.ts`): aprovar fecha o pedido,
    recusar exige motivo e devolve à negociação; pedido, pedido de aprovação e fechamento
    mudam num comando só. Quem decide e se pode aprovar pedido com prejuízo
    (`approvesAtLoss`, só Diretoria; a regra é `needsDirector` no motor) saem da sessão,
    nunca do formulário. A fila não traz custo: só o nome da faixa.
13. **O pedido fechado gera o que tem a receber** (`receivables`), no mesmo comando do
    fechamento, a partir de `paymentOf`. Reabrir cancela o que estava em aberto; pedido com
    valor já recebido não se reabre. **A baixa é `recordReceipt`** (`src/lib/db/receivables.ts`):
    valor inteiro, recebível, recebimento e comissão do vendedor num comando só, com o IPI e
    a comissão da versão da tabela do pedido. Recebimento é evento: não se edita nem se apaga
    Erro se corrige com estorno.
14. **Estorno é pedido e confirmação** (`requestRefund`, `decideRefund`): quem tem
    Recebimentos pede, com motivo; só a Diretoria confirma (`confirmsRefunds`). Confirmado, num
    comando só: o estorno (negativo), o valor de volta a receber e a comissão devolvida com
    lançamento negativo no mês da confirmação. O recebimento original fica como está.
15. **Comissão** (`src/lib/db/commissions.ts`): nasce na baixa, some no estorno, nunca é
    editada. O vendedor recebe do banco só as linhas dele; Diretoria e Financeiro veem todas
    e marcam como paga (`managesCommissions`). `payCommissions` paga o que está em aberto do
    vendedor até o mês, de modo que o estorno desconta do pagamento seguinte, e não paga saldo
    que não seja positivo. O dia do pagamento é da empresa (`company_settings`, de 1 a 28,
    editado em Parâmetros), nunca fixo no código.

## Fotos dos equipamentos

Cada equipamento tem descrição (`products.description`) e, no máximo, **uma foto**,
guardada no banco da empresa (`product_photos`), nunca em disco nem em `public/`.

1. **A foto guardada é sempre JPEG normalizado por `normalizePhoto`**
   (`src/lib/photos/normalize.ts`): formato reconhecido pelos primeiros bytes (JPG, PNG ou
   WebP; nunca pela extensão nem pelo `Content-Type`), girada pelo EXIF, reduzida para
   caber em 1200 × 1200, fundo branco, sem metadados. Entrada acima de 15 MB ou de 50
   megapixels é recusada. A pasta não conhece banco, `next/*` nem `process.env`.
2. **Toda foto entra por `saveProductPhoto`** (`src/lib/db/product-photos.ts`). Nunca
   `INSERT` direto em `product_photos`, nunca arquivo em `public/`.
3. **A foto só sai pela rota `/api/produtos/[id]/foto`**, que exige sessão: qualquer
   perfil vê (`GET`), só quem tem o item `produtos` troca ou apaga (`PUT` com os bytes
   crus no corpo, `DELETE`). Não existe `POST` com formulário.
4. **Todo `route.ts` em `src/app/api/` começa por `await getSession()`** e usa
   `tenantDb(session.tenant.slug)`: a empresa, o perfil e o e-mail saem só da sessão,
   nunca do corpo, de cabeçalho ou do endereço. `tests/routes.test.ts` falha se não for
   assim, e `tests/product-photo-route.test.ts` confere que uma empresa não lê nem grava
   foto de outra. **A única exceção é `/api/health`**, pública de propósito (é o que o
   deploy consulta): sem sessão, sem banco e sem dado de empresa, e sem ler nada do
   pedido. A exceção é nominal (`PUBLIC_ROUTES` em `tests/routes.test.ts`); rota pública
   nova só entra nessa lista, e o mesmo teste falha se ela tocar em banco ou sessão.
5. `listProducts` devolve `hasPhoto`, nunca os bytes. A chave de `product_photos` não
   apaga em cascata (nenhuma do banco apaga): `deleteProduct` apaga a foto no mesmo
   comando, e equipamento com histórico continua recusado, com a foto no lugar.
6. **A carga em lote é `npm run db:import-products -- <pasta> --empresa <identificador>`**
   e, sem `--apply`, não grava nada. A empresa é sempre dita na linha de comando (tem de
   estar em `ERP_TENANTS`); não há empresa padrão. A carga roda numa transação só
   (`importProducts`, com uma conexão de `withTenantConnection`), cria equipamento sem
   custo, e nunca toca em custo, crédito, embalagem nem `active`. O formato da pasta está
   no `README.md`.

## Dashboard, Preços e metas, Simulador e Equipe

Todos os itens do menu são telas de verdade; não há mais marcador "Em construção". Os números
saem de funções puras com teste (`src/lib/dashboard-view.ts`): o pedido conta como fechado no mês
em que fechou e, no funil, no mês em que foi criado. **Lucro, meta, multiplicador, desconto máximo
por destino e ponto de equilíbrio só são lidos para quem `seesCosts`** (`ordersProfit`,
`loadParams`, `loadPublishedSnapshot` ficam depois dessa decisão na página; `tests/routes.test.ts`
confere). No Simulador a equipe recebe só o nome da faixa (`simulationBand`) e nada é gravado. As
metas de venda (`sales_goals`, uma da equipe e uma por vendedor em cada mês) são definidas só pela
Diretoria (`setsGoals`), sempre para o mês corrente. Os gráficos são `src/components/Charts.tsx`,
componentes de servidor em CSS, sem biblioteca.

## Todo cadastro tem adicionar, editar e remover

Pedido do Nicolas em 08/10/2026: **toda lista que a empresa mantém tem as três operações na
tela**, não só carga em lote nem só "desligar". Remover é função da camada de banco, com botão
de confirmação (`ConfirmButton`) e, quando apaga algo com nome, uma linha no log. O que tem
histórico preso a ele não se apaga e a recusa diz o que fazer: cliente com pedido, fornecedor com
conta, despesa fixa já lançada (o banco recusa pela chave estrangeira, sem cascata). Forma de
pagamento e categoria saem sempre, porque o que as usou guardou o nome. Ninguém remove a si mesmo.

## Catálogo do fornecedor

O que o fornecedor vende (`supplier_items`, migração `0017`): código dele, catálogo, medidas,
peso, foto normalizada e o código do equipamento da empresa a que corresponde (`product_code`,
texto: o vínculo é pelo código). **É informação de fornecedor: só quem tem Produtos e custos
vê**, na tela `/produtos/catalogo-fornecedor`, no quadro "No fornecedor" do equipamento e na rota
`/api/fornecedor-itens/[id]/foto`. Tabela de preços, pedido e simulador não leem nada disso
(`tests/routes.test.ts`). A carga é `npm run db:import-supplier-catalog -- <arquivo.json>
<pasta-das-fotos> --empresa <identificador>`; sem `--apply` só confere, e com ele grava tudo
numa transação.

## Fiscal e certificado digital (base da NF-e)

A Ávila Ops emite a nota direto na SEFAZ: o ERP guarda e usa o certificado A1 da empresa.
Feito até aqui (migração `0016`): dados fiscais do emitente e série/número/ambiente em
`company_settings`, NCM/origem/CEST/unidade em `products`, e o cofre do certificado. **A emissão
ainda não existe.** Regras do cofre, que não se quebram:

1. **O certificado e a senha só existem cifrados** (`fiscal_certificates`, AES-256-GCM, selados
   juntos por `sealCertificate`). A chave é `ERP_CERT_KEY`, do ambiente do servidor: nunca no
   banco, no repositório nem no formulário. Sem ela o envio é recusado, e o resto do sistema segue.
2. **Nada devolve o arquivo ou a senha**: nem tela, nem rota, nem log. A tela recebe só a ficha
   (`loadCertificateInfo`: titular, CNPJ, validade, resumo). `openCertificate` só é chamado dentro
   de `src/lib/fiscal/`; `tests/routes.test.ts` falha se aparecer em outro lugar.
3. **Entra conferido** (`saveCertificate`): abre com a senha, tem chave privada, está em vigor e o
   CNPJ é o da empresa. Um por empresa: enviar outro substitui.
4. O ambiente começa em `homologacao`; passar para `producao` é escolha da diretoria na tela.

## Contas a pagar e fornecedores

As **despesas fixas** são lista da empresa (`fixed_expenses`, Parâmetros → Despesas fixas). A
soma das que estão em uso é o parâmetro "Despesas fixas por mês", atualizado junto com a lista
(`src/lib/db/fixed-expenses.ts`). "Lançar despesas fixas do mês", em Contas a pagar, cria uma
conta por despesa em uso; cada despesa é lançada uma vez por mês (índice único no banco).

Diretoria e Financeiro. Fornecedor (`src/lib/db/suppliers.ts`) é empresa, pessoa ou exterior
(país no lugar de CNPJ/CPF) e nunca se apaga: desliga-se. Conta (`src/lib/db/payables.ts`) é
lançada, paga com o valor que de fato saiu, e o pagamento pode ser desfeito; conta paga não se
altera nem se exclui. As categorias são a tabela `payable_categories` da empresa, editada em
Parâmetros → Categorias de contas a pagar. **A comissão devida aos vendedores aparece em Contas
a pagar como conta automática** (`listCommissionsDue`), calculada na hora a partir de
`commissions`: nunca é gravada como conta, e é paga em Comissões. A planilha sai por
`/api/contas-pagar/exportar`, só para quem tem o item, e neutraliza célula que começa como fórmula.

## Orçamento em PDF

O botão **Salvar PDF** do pedido abre o orçamento para o cliente, em A4.

1. **O PDF só sai pela rota `/api/pedidos/[numero]/orcamento`** (`GET`), para quem tem o item
   `pedidos`; o vendedor só alcança os pedidos dele (o mesmo escopo de `getOrder`). Vale em
   qualquer situação do pedido; só não sai sem equipamento (409).
2. **O conteúdo vem de `quoteDocument`** (`src/lib/quote/document.ts`), função pura que usa a
   conta da equipe (`saleOf`) e nunca lê custo: o orçamento não mostra custo, lucro, faixa do
   desconto, comissão nem DIFAL, nem para a Diretoria. O vendedor é o do pedido, não quem gerou.
3. **O desenho é `renderQuotePdf`** (`src/lib/quote/pdf.ts`), com `pdf-lib` e as fontes padrão
   do PDF: sem navegador, sem arquivo de fonte, sem ler disco. A mesma entrada gera os mesmos
   bytes. Caractere que a fonte não tem vira `?`.
4. **A foto entra sempre reduzida por `thumbnail`** (`src/lib/photos/normalize.ts`), uma por vez.
   Feita a miniatura, a rota solta os bytes da foto gravada; foto que não abre deixa o quadro
   vazio, sem derrubar o PDF, e um `console.warn` com o id do produto no registro. O nome do
   equipamento para em 4 linhas e a descrição em 3, com "…".
   Descrição e foto são as do cadastro de hoje (`loadQuoteProducts`); nome, código e preço são
   os da versão da tabela do pedido.
5. **A logo e o nome são os da empresa da sessão** (`loadLogo`, passada por `logoPng`; sem logo
   cadastrada, o nome da empresa vai no lugar). Nada de logo ou nome fixo no código.
6. O PDF não é guardado: é gerado a cada pedido, com `Cache-Control: private, no-store`.

## Celular

O sistema é usado no celular: toda tela tem de caber em 390 px de largura sem rolagem lateral
da página. O menu é `Sidebar` (servidor) dentro de `MobileMenu` (a única parte de navegador, só
abre e fecha): coluna à esquerda a partir de `md`, barra no topo com o botão "Menu" abaixo disso.
Tabela larga rola dentro do próprio cartão (`relative overflow-x-auto`; o `relative` segura os
rótulos `sr-only`, que senão alargam a página). Campo com largura fixa só a partir de `sm`
(`min-w-0 flex-1 sm:w-64 sm:flex-none`), e grade de uma coluna usa `grid-cols-[minmax(0,1fr)]`.
**Cadastro no celular é uma tela só** (pedido do Nicolas em 06/10/2026, com exemplos): tela
própria, poucos campos grandes, o resto dobrado em "Mais dados", e os botões de salvar presos
no rodapé (`sticky bottom-0`, com `env(safe-area-inset-bottom)`). O modelo é
`produtos/ProductScreen.tsx` (`/produtos/novo` e `/produtos/[id]`): foto, nome, código e custo;
"Salvar" e "Salvar e adicionar outro". Lista com formulário por linha não serve no celular: vira
cartões que abrem a tela do item. Campo de data tem regra em `globals.css` para não vazar do
cartão no iPhone.
A lista de pedidos vira cartões abaixo de `md`. O sistema é instalável na tela de início
(`src/app/manifest.ts`, ícones em `public/icons/` e `src/app/*.png`); o manifesto é público e
igual para todas as empresas, sem nome nem dado de nenhuma.
Nome, cores e a lista de ícones do aplicativo têm fonte única em `src/lib/app-identity.ts`
(manifesto e `layout.tsx` leem de lá). **Manifesto e ícone são do produto, nunca da empresa:** o
celular os busca sem sessão. Ícone novo entra em `APP_ICONS`, sem transparência e, se mascarável,
com o desenho dentro do quadrado central de 60%; `tests/app-install.test.ts` confere. **Não há
service worker nem uso offline:** guardar tela de uma empresa no aparelho é risco de vazamento
entre empresas.

## Git

Toda alteração vai por commit direto na `main`, na mesma tarefa:
`git pull --rebase origin main` → lint, typecheck, testes e build → commit →
`git push origin main`. Sem branch parada e sem PR aberto esperando. Nunca
`push --force` na `main` e nunca comite segredo (`.env*` está no `.gitignore`; só o
`.env.example`, com valores fictícios, é versionado).

Ao concluir um item do `docs/roadmap.md`, marque a caixa no mesmo commit.

Arquivos temporários de agente: `.work/` (ignorado pelo Git).

## Produção

`erp.avilaops.com`, no servidor `applications` (o mesmo do Auth central), em container (`Dockerfile`, `deploy/`). Publica-se
com `bash deploy/subir.sh`; os passos e as variáveis estão em `docs/operacao.md`. O build é feito
fora do servidor e chega como `standalone.tgz`; a migração de cada empresa roda antes de o
container novo subir. `/api/health` responde com a revisão no ar.

## Fora deste repositório

DNS, TLS no Cloudflare, o cadastro do aplicativo no Auth central e o `SSO_JWT_SECRET` real não
são tratados aqui. O Auth central fica em `auth.avilaops.com`, onde o app `erp` já está registrado.

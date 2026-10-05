# ERP Ludus Equipamentos: instruções do projeto

## Contexto
A Ludus Equipamentos importa equipamentos de musculação da China e vende para academias, studios e clientes finais. Empresa nova, CNPJ próprio, sem dados legados: o cadastro começa do zero.

O dono (Rogério) montou um **protótipo funcional no Claude** (artifact React). Este repositório é a versão de produção, desenvolvida pela Ávila Ops Tecnologia. **O protótipo é a especificação de referência**: telas, textos, regras e cálculos devem se comportar igual a ele, salvo quando este arquivo disser o contrário. O código do protótipo fica em `prototype/` apenas como referência e nunca é importado pela aplicação.

Documentação de negócio: `docs/manual/` (uma página por funcionalidade) e `docs/roadmap.md`.

Idioma: interface, mensagens e textos em português do Brasil. Código (variáveis, funções, tabelas) em inglês. Comentários podem ser em português.

## Stack
- Next.js (App Router, Server Components, Server Actions) + TypeScript strict
- **PostgreSQL** como banco de dados, acessado com Prisma ORM (migrations versionadas; nunca editar migration já aplicada)
- Autenticação pelo **Auth central da Ávila Ops** (identidade compartilhada do ecossistema). Toda a integração fica isolada em `src/lib/auth/`; o resto do código só usa `getSession()` e `requirePermission()`
- Tailwind CSS; componentes reaproveitados do protótipo sempre que possível
- Zod para validação (mesmo schema no client e no server) + React Hook Form
- Vitest para regras de negócio, Playwright para os fluxos críticos
- pnpm

## Arquitetura
- Módulos de domínio em `src/modules/<modulo>/`: `schema.ts` (Zod), `service.ts` (regras puras e testáveis), `actions.ts` (Server Actions finas: validam, checam permissão, chamam o service), `queries.ts` (leituras), `components/`.
- Rotas em `src/app/(app)/<modulo>/`. Layout com a mesma sidebar do protótipo.
- **Todos os cálculos de preço, imposto, entrada e comissão ficam em `src/modules/pricing/`**, como funções puras com testes unitários. Componentes nunca calculam.
- Toda tabela de negócio tem `organization_id`, `created_at`, `updated_at`, `created_by`. Cadastros usam exclusão lógica (`deleted_at`).
- `audit_log` para alterações em pedidos, custos, parâmetros, publicações de tabela, aprovações, recebimentos e permissões: quem, quando, entidade, antes e depois (JSONB).

## Regras para o PostgreSQL
- Dinheiro em `NUMERIC(14,2)` (Prisma `Decimal @db.Decimal(14,2)`); percentuais em `NUMERIC(7,4)`; câmbio em `NUMERIC(12,6)`. Nunca `float` para valores.
- Cálculos com `Prisma.Decimal` (decimal.js). Arredondar só no resultado final, half-up, 2 casas.
- Datas em `timestamptz` (UTC no banco); exibição em America/Sao_Paulo, formato dd/mm/aaaa.
- Status como enums do Postgres.
- Índices em toda chave de busca: código do produto, CNPJ/CPF, número do pedido, `(organization_id, status)`, datas de vencimento.
- Agregações do dashboard e das comissões feitas no banco (SQL agregado ou views), nunca em memória.
- Antes de qualquer migration que altere ou apague dados em produção: dump do banco (`pg_dump`).
- Snapshots imutáveis em JSONB onde o histórico precisa ser preservado (versão da tabela de preços, parâmetros usados no pedido).

## Perfis de acesso
| Perfil | Pode |
|---|---|
| `DIRETORIA` | Tudo. Única que vê custo, China, lucro, margem e o quadro "Só o diretor vê". Edita Parâmetros e Produtos e custos, publica tabela. |
| `GERENTE_COMERCIAL` | Pedidos de toda a equipe, aprovações, metas e ranking. Não vê custo nem lucro. |
| `VENDEDOR` | Só os próprios clientes, pedidos e comissões. Vê o % mínimo de entrada, nunca custo, China ou lucro. |
| `FINANCEIRO` | Recebimentos, baixas, contas a pagar, fornecedores, pagamento de comissões. |

Permissão checada no servidor em toda action e query. Campos sensíveis (custo, valor China, lucro, margem) **nunca** são serializados para o client de quem não tem permissão; não basta esconder na tela.

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
custo_real = (custo_assessoria x (1 - credito_impostos) + embalagem) x (1 + margem_seguranca)
venda_com_desconto = custo_real / (1 - impostos_e_taxas_pior_caso - lucro_antes_IR)
preco_tabela_sem_ipi = venda_com_desconto / (1 - desconto_livre)
preco_com_ipi = preco_tabela_sem_ipi x (1 + ipi)
```
Conferência com o protótipo: Mesa Flexora, custo assessoria R$ 8.146,64, crédito 28,1% → custo real R$ 6.148,97 → tabela sem IPI R$ 19.204,61 (custo x 3,123).
O pior caso é o estado com maior ICMS + DIFAL (hoje MA, 23%). `lucro_antes_IR = lucro_alvo / (1 - irpj_csll)`. Para cada equipamento, calcular também o desconto máximo na meta para SP (`Máx. SP`) e para cliente contribuinte (`Máx. c/IE`).

### Tabela de preços versionada
Mudanças em custos e parâmetros recalculam na hora só para a diretoria. A equipe vê a última versão **publicada** (v35, v36...). Publicar grava um snapshot imutável. Pedidos guardam a versão usada.

### ICMS e DIFAL
- Venda dentro de SP: ICMS 18%.
- Venda para outro estado: interestadual de 4% para importado. Cliente não contribuinte (PF, ISENTO, sem IE): DIFAL = alíquota interna do destino − 4%, custo da Ludus.
- "Contribuinte do ICMS" é marcado automaticamente pela inscrição estadual (ISENTO ou PF = não).
- Tabela de alíquotas internas por UF fica no banco (editável), validada pelo contador.

### Pedido
- Número `#AAMMDD-XXXX`. Status: `RASCUNHO`, `ENVIADO`, `AGUARDANDO_APROVACAO`, `APROVADO`, `FECHADO`, `PERDIDO` (com motivo), `CANCELADO`.
- Desconto em % sobre a tabela; faixas: na meta (lucro >= 15%), abaixo da meta, prejuízo.
- Vai para aprovação se: desconto > desconto livre, lucro < meta, ou entrada < mínimo da política.
- Prazo de fabricação em dias corridos a partir do pagamento da entrada; mostrar previsão de conclusão.
- Frete por nossa conta (R$) entra no custo.

### Entrada mínima
```
entrada_minima = (valor_china + lucro_liquido_meta) / (1 - comissao)
```
Exemplo de teste obrigatório: China R$ 8.553,97, lucro da meta R$ 2.304,55, comissão 2% → entrada mínima R$ 11.054,17; sem a comissão sobram R$ 10.858,52.

### Pagamento
Entrada (R$ ou %), forma, data (vazia = na confirmação). Saldo: forma, nº de parcelas, 1ª em N dias, intervalo (7/15/30). As parcelas devem somar exatamente o saldo (diferença de centavos na última).

### Comissão
2% sobre cada valor **recebido** do cliente, sem IPI. Nasce na baixa do recebimento. Tudo recebido no mês é pago no dia 05 do mês seguinte. "Comissão futura" = parcelas ainda não recebidas.

## UI
- Identidade visual do protótipo: títulos em Barlow Condensed caixa alta, corpo sem serifa, fundo cinza claro, cards brancos, azul #2C47A8.
- Responsivo de verdade: o vendedor monta e envia orçamento pelo celular. Instalável como PWA.
- Filtros de período padrão: Este mês, 3 meses, Ano, 12 meses; e Toda a equipe / vendedor.
- Listas com busca, abas de situação, ordenação e paginação no servidor.

## Qualidade
- Sem `any`. Tipos derivados do Prisma e do Zod.
- Todo cálculo financeiro com teste unitário cobrindo arredondamento e casos-limite, incluindo os números de exemplo deste arquivo.
- Seeds em `prisma/seed.ts` com os equipamentos e parâmetros do protótipo.
- Segredos só em variáveis de ambiente, documentadas em `.env.example`.
- Versões antigas ficam no Git: não criar pastas de backup, releases ou cópias "por segurança".

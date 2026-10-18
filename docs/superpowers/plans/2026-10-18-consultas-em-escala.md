# Consultas em escala — plano de implementação

> **Spec:** `docs/superpowers/specs/2026-10-18-consultas-em-escala-design.md`
>
> **Regra de entrega:** implementar e validar o módulo inteiro antes do primeiro
> commit e push.

**Objetivo:** tornar Clientes, Pedidos, Produtos e Fornecedores utilizáveis com
milhares de registros, usando consulta paginada no PostgreSQL, controles
consistentes e layouts responsivos.

**Arquitetura:** parâmetros de URL são normalizados por uma biblioteca única;
cada repositório aplica busca, filtro, ordenação, `COUNT` e `LIMIT/OFFSET`; as
páginas recebem somente o recorte e agregados. A UI compartilha toolbar e pager,
mantendo cartões no celular e tabela apenas onde couber.

**Stack:** Next.js 16, React 19, TypeScript, PostgreSQL, Tailwind CSS e Playwright.

---

## Tarefa 1 — Contrato compartilhado de consulta e paginação

**Arquivos:**

- Criar: `src/lib/list-query.ts`
- Criar: `src/components/ListQuery.tsx`
- Alterar: `src/components/ui.tsx`
- Alterar: `src/lib/rows.ts`
- Criar: `tests/list-query.test.ts`
- Alterar: `tests/ux.test.ts`

1. Escrever testes falhando para normalização de página, tamanho 10/25/50/100,
   ordenação permitida, direção, texto e filtros.
2. Escrever testes falhando para preservação de parâmetros, reset para página 1,
   limpeza e salto direto.
3. Implementar `parseListQuery`, `listHref` e tipos `ListQuery/ListResult`.
4. Criar `ListQuery` com busca, filtros recolhíveis, ordenação, filtros ativos e
   limpar.
5. Evoluir `Pager` com seletor de quantidade e `Ir para página`, sem quebrar usos
   legados.
6. Rodar `npm test -- --test-name-pattern='consulta|fatia de lista|linhas por tela'`.

## Tarefa 2 — Clientes no servidor

**Arquivos:**

- Alterar: `src/lib/db/customers.ts`
- Alterar: `src/app/(app)/clientes/page.tsx`
- Alterar: `src/lib/customer.ts`
- Alterar: `tests/db-customers.test.ts`
- Alterar: `tests/customer.test.ts`
- Criar: `tests/customers-list.test.ts`

1. Escrever testes de banco para busca sem acento/documento, tipo, UF, com/sem
   compra, ordenações e limites.
2. Implementar `queryCustomers` com fechamento ativo como fonte de compras e
   contagem com os mesmos predicados.
3. Trocar filtro em memória por resultado paginado.
4. Aplicar `PageHeader`, `ListQuery`, tabela desktop, cartões mobile e `Pager`.
5. Diferenciar lista vazia de filtro sem resultado.
6. Provar por teste de rota que o HTML contém no máximo `pageSize` clientes.

## Tarefa 3 — Fornecedores no servidor

**Arquivos:**

- Alterar: `src/lib/db/suppliers.ts`
- Alterar: `src/app/(app)/fornecedores/page.tsx`
- Alterar: `tests/db-payables.test.ts`
- Criar: `tests/suppliers-list.test.ts`

1. Escrever testes de busca por razão social, fantasia, documento, contato e país.
2. Escrever testes de filtros `PJ/PF/EX`, país, ativo/inativo e ordenação.
3. Implementar `querySuppliers` com `COUNT` e página.
4. Preservar o fluxo separado de novo fornecedor e trocar a lista para o padrão
   compartilhado.
5. Validar que nenhum campo de categoria ou migração foi criado.

## Tarefa 4 — Pedidos no servidor

**Arquivos:**

- Alterar: `src/lib/db/orders.ts`
- Alterar: `src/lib/orders-view.ts`
- Alterar: `src/app/(app)/pedidos/page.tsx`
- Alterar: `tests/db-orders.test.ts`
- Alterar: `tests/orders-view.test.ts`

1. Escrever testes para busca, aba, escopo do vendedor, ordenação e paginação no
   banco.
2. Implementar uma consulta paginada dos pedidos e consultas agregadas separadas
   para contagens e indicadores.
3. Remover `listOrders()` completo da página e preservar os valores calculados da
   linha sem expor custos.
4. Manter abas em uma linha rolável no celular.
5. Renomear o período do indicador e a ação de expansão para `Ver indicadores`.
6. Validar que trocar busca/aba/ordem volta à página 1 e preserva os demais
   critérios.

## Tarefa 5 — Produtos no servidor e edição responsiva

**Arquivos:**

- Alterar: `src/lib/db/products.ts`
- Alterar: `src/lib/products-view.ts`
- Alterar: `src/app/(app)/produtos/page.tsx`
- Alterar: `src/app/(app)/produtos/ProductRow.tsx`
- Alterar: `src/app/(app)/produtos/ProductScreen.tsx`
- Alterar: `tests/db-products.test.ts`
- Alterar: `tests/products-view.test.ts`
- Alterar: `tests/product-form.test.ts`

1. Escrever testes de página por linha de produto, aba, busca e ordenação.
2. Implementar `queryProducts`; carregar à parte somente a projeção mínima exigida
   pelo cálculo do rascunho de publicação.
3. Trocar a listagem para 25 itens e remover `FitRows` dessa tela.
4. Usar tabela editável somente em largura grande; em largura intermediária e
   celular usar cartões com `Editar custos e cadastro`.
5. Exibir percentuais com duas casas sem alterar a precisão persistida quando o
   campo não foi editado.
6. Mover exclusão para `Mais ações`/detalhe e preservar a confirmação.
7. Escrever os rótulos financeiros completos e ajuda contextual.

## Tarefa 6 — Revisão da publicação da tabela

**Arquivos:**

- Criar: `src/lib/price-table-review.ts`
- Criar: `src/app/(app)/produtos/publicacao/page.tsx`
- Criar: `src/app/(app)/produtos/publicacao/ReviewList.tsx`
- Alterar: `src/app/(app)/produtos/PublishBanner.tsx`
- Alterar: `src/app/(app)/produtos/actions.ts`
- Alterar: `src/lib/price-table.ts`
- Criar: `tests/price-table-review.test.ts`
- Alterar: `tests/price-table.test.ts`
- Alterar: `tests/route-security.test.ts`

1. Escrever testes das cinco categorias atuais: regras, custos, novos, removidos e
   renomeados.
2. Calcular anterior/novo dos insumos e os efeitos derivados: custo real, preço sem
   IPI, preço com IPI e descontos máximos.
3. Criar revisão paginada e filtrável, sem publicar ao abrir.
4. Alterar o banner para `Revisar publicação vN`.
5. Manter a confirmação final e a checagem concorrente na action existente.
6. Garantir por teste de segurança que somente quem possui Produtos e custos e
   poder de custos abre a revisão/publica.

## Tarefa 7 — Moldura e responsividade

**Arquivos:**

- Alterar: `src/components/MobileMenu.tsx`
- Alterar: `src/app/(app)/layout.tsx`
- Alterar: `src/app/globals.css`
- Alterar: `tests/ux.test.ts`
- Alterar: `tests/theme.test.ts`

1. Escrever teste estático para ativar sidebar apenas em `lg` e reservar
   `--tabbar` no layout compacto.
2. Trocar o breakpoint estrutural de `md` para `lg`, preservando menu rolável.
3. Criar a moldura de listagem: cabeçalho/consulta/pager visíveis e região de
   resultados como única rolagem quando a tela couber.
4. Impedir sobreposição do pager e rolagem horizontal.
5. Conferir teclado, foco, zoom de 200% e texto ampliado.

## Tarefa 8 — Dados, desempenho e validação completa

**Arquivos:**

- Criar: `scripts/list-query-explain.ts`
- Alterar: `docs/ux.md`
- Criar: `docs/revisao-telas/consultas-em-escala.md`
- Alterar: `tests/visual/telas.spec.ts`

1. Rodar as consultas na massa de aproximadamente 3.000 registros e registrar
   `EXPLAIN (ANALYZE, BUFFERS)`; criar índices por migração somente se a medição
   provar necessidade.
2. Rodar testes de banco com `ERP_TEST_DATABASE_URL` e a suíte completa.
3. Rodar `npm run lint`, `npm run typecheck` e `npm run build`.
4. Rodar Playwright em 360×640, 390×844, 430×932, 956×440, 1366×768 e
   1440×900; inspecionar todas as capturas.
5. Rodar Lighthouse mobile de Clientes três vezes no build de produção local e
   registrar mediana, TBT e resposta inicial.
6. Responder às sete perguntas de `docs/ux.md` no relatório.
7. Fazer revisão estática final e corrigir todas as ocorrências encontradas.
8. Somente então criar o primeiro commit e push do módulo; acompanhar CI, revisar
   artefatos, mesclar e verificar o domínio público separadamente.

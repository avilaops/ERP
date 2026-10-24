# Diretrizes de UX do ERP

Regra da casa para toda tela nova ou alterada. Vale para qualquer empresa que use o ERP: a
marca (logo, nome) é de cada cliente; a forma de trabalhar é a mesma.

## A regra: uma tarefa, um formulário, uma página

Tudo o que a pessoa precisa preencher para concluir uma única tarefa fica na mesma página e é
salvo por uma única ação. Se houver muitos campos, eles são organizados em seções visíveis e a
página rola verticalmente; não se criam etapas, botões “Continuar” ou gravações parciais para
fracionar um único cadastro. Quem abre a tela vê de imediato **onde está**, **o que pode fazer
ali**, **qual informação decide** e **qual é a ação final**.

Quando o conteúdo não cabe, ele é **reorganizado**, nunca espremido:

| O que sobra | Para onde vai |
|---|---|
| Campos de uma mesma tarefa | Seções visíveis no mesmo formulário, com uma ação final |
| Lista longa | Paginação (`Pager`), com tantas linhas quantas cabem na tela (`FitRows`) |
| Detalhe de um item | Abre junto do item (`<details>`) ou em tela própria |
| Explicação | Uma frase curta junto do que ela explica; o resto em "Ver …" |
| Filtros pouco usados | "Filtros", fechado, aberto sozinho quando há filtro em uso |

Proibido para "fazer caber": diminuir fonte, apertar controle abaixo de 44 px de altura, cortar
nome ou valor, e `overflow: hidden` para esconder o que vazou. Com zoom, fonte ampliada ou
teclado aberto a tela pode rolar: o que não pode é um campo ou uma ação ficar inalcançável.

## Perguntas antes de entregar uma tela

1. A tarefa principal está clara no título e na primeira dobra?
2. Todos os campos dessa tarefa estão na mesma página, em seções visíveis?
3. Há **uma** ação final, visível, e ela é a primeira ação de envio do formulário (Enter a executa)?
4. A página funciona sem rolagem lateral em 360×640, 390×844, 430×932, 1366×768 e 1440×900?
5. O que ficou de fora tem um caminho com nome claro ("Ver composição", "Filtros", "Mais")?
6. Um erro preserva tudo o que foi digitado e aponta diretamente para o campo inválido?
7. Funciona só com teclado, com zoom de 200% e com texto ampliado?

## Moldura

- **Celular**: barra fina com a marca no topo (`--topbar`) e, embaixo, até quatro destinos que a
  pessoa mais usa mais "Mais", que abre o menu inteiro (`--tabbar`). Os destinos saem das telas
  que o perfil tem, na ordem de `TAB_ORDER` (`src/components/Sidebar.tsx`).
- **Computador**: menu lateral da altura da janela, com rolagem própria. Menu longo nunca
  estica a página.
- Tudo o que gruda numa borda usa as variáveis: `sticky top-[var(--topbar)]`,
  `sticky bottom-[var(--tabbar)]`. Nunca `top-0`/`bottom-0` soltos dentro de uma página: no
  celular ficariam embaixo das barras.
- O `main` já reserva o espaço da barra de baixo; nenhuma tela soma margem por conta própria.

## Peças compartilhadas (`src/components/ui.tsx`)

| Peça | Uso |
|---|---|
| `PageHeader` | Título, no máximo uma frase curta e as ações da tela à direita |
| `EmptyState` | Lista vazia com título, explicação curta e, quando existe, a próxima ação permitida |
| `CARD`, `SECTION_TITLE` | Cartão só quando separa de verdade; agrupamento simples usa só o título pequeno |
| `LABEL`, `INPUT` | Todo campo com rótulo permanente acima e 44 px de altura (`--control`) |
| `PRIMARY`, `SECONDARY` | Uma ação principal por tarefa; as demais são secundárias |
| `DANGER`, `DANGER_OUTLINE` | Remover, desfazer, cancelar: texto vermelho; com borda quando é a ação do contexto (cancelar o pedido) |
| `Pill` | Estado em duas ou três palavras, com texto e cor (`good`, `warn`, `bad`, `neutral`) |
| `pageOf` + `Pager` | Fatia de uma lista e o rodapé "1–8 de 133 · ‹ 1 de 17 ›" |
| `ListQuery` + `ListPager` (`src/components/ListQuery.tsx`) | Busca, filtros, ordenação, quantidade por página, salto direto e paginação das listas operacionais |
| `FitRows` (`src/components/FitRows.tsx`) | Mede quantas linhas cabem na tela de quem olha e guarda no cookie `erp_linhas` |
| `EquipmentPicker` | Escolher um equipamento buscando por nome ou código, em vez de lista com o catálogo inteiro |

Tela nova usa estas peças. Constante de estilo repetida dentro de uma página é dívida: ao mexer
na página, troque pela peça.

## Linguagem visual

- **Título de página**: família condensada da marca, 24 px no celular e 28 px no computador
  (`h1` em `globals.css`). É ferramenta de trabalho, não cartaz.
- **Texto**: 16 px em campos e ações, 14 px em apoio, 12 px em rótulo de seção e metadado.
- **Dinheiro**: sempre `showMoney` (pt-BR, `R$ 14.196,45`), alinhado à direita, sem quebrar
  linha (`whitespace-nowrap`) e nunca truncado. Diga se o valor tem IPI.
- **Nome de equipamento, cliente, pessoa**: inteiro, em quantas linhas precisar. Sem `truncate`
  em nome que a pessoa precisa ler para decidir.
- **Cor**: orienta e comunica estado; nunca é a única pista (o texto diz o mesmo).
- **Tema escuro**: as telas usam os nomes da paleta clara; cor nova precisa de valor no escuro
  (`tests/theme.test.ts` cobra).
- **Foco**: visível em todo controle (`:focus-visible` global).
- **Retorno**: a resposta de uma ação aparece junto do botão que a disparou (`ActionForm`).
- **Estados**: toda lista tem o seu vazio dito em uma frase, com o que fazer em seguida.

## Como conferir

`npm run test:telas` (Playwright, `tests/visual/telas.spec.ts`) entra com o login local como
Diretoria, percorre todas as telas que o menu alcança (uma de cada tipo) e mede cada uma nos
cinco tamanhos. A matriz de consultas em escala acrescenta 956×440 para cobrir celular em
paisagem. Falha quando a tela rola para o lado, quando algo que se toca tem menos de 44 px
ou quando a página dá erro. Quantas telas de altura cada página ocupa vai para `telas.json`, sem
falhar: meta de 1,0 em todos, e o que passar disso entra na lista de pendências abaixo, com o
motivo. Os prints de cada tela nos cinco tamanhos ficam em `test-results/telas/`.

A harmonização usa a especificação e os critérios de [harmonizacao-ui.md](harmonizacao-ui.md).

Na revisão de 23/10/2026, os índices e listas principais de Comercial, Operação, Financeiro,
Fiscal, Gestão e Parâmetros passaram a compartilhar `PageHeader` e `EmptyState`. Os testes de
harmonização dividem cada viewport em um caso independente: muitas capturas de página inteira no
mesmo contexto acumulam memória no navegador e tornam a evidência instável.

Para rodar na própria máquina, num banco com nome terminado em `_demo` e com `ERP_LOCAL_LOGIN=1`:

```bash
npm run db:migrate
npm run db:seed-demo -- --empresa ludus   # massa funcional comum
# ou, no mesmo banco ainda vazio, quatro listas com 3.000 registros:
npm run db:seed-demo -- --empresa ludus --escala 3000
npm run test:telas
```

Durante a construção rápida, essa varredura é manual. Rode-a quando o usuário pedir validação ou iniciar a fase de estabilização; o pipeline automático apenas compila e gera o pacote de deploy.

## Pendências conhecidas (18/10/2026)

Telas que ainda não obedecem à regra e o caminho previsto para cada uma:

| Tela | Situação | Caminho |
|---|---|---|
| Produtos e custos | Consulta em escala, edição por ficha abaixo de 1536 px e revisão da publicação desde 18/10/2026 | Nenhuma pendência desta auditoria |
| Parâmetros | Índice por assunto; cada configuração individual mostra todas as seções do seu formulário e grava tudo junto | Manter seções visíveis e aceitar rolagem vertical |
| Dashboard | Em abas desde 10/10/2026 (Resumo, Vendas, Em aberto, Dinheiro): 1 tela no computador, até 1,7 no celular (2,3 na aba Dinheiro em 360×640) | Trocar as tabelas da aba Dinheiro por linhas compactas |
| Preços e metas | Em abas desde 10/10/2026 (Resumo, Metas, Tabela): 1 tela, salvo a aba Tabela no celular (2 a 2,6) | Paginar as publicações e o quadro por destino no celular |
| Fornecedores | Busca, filtros, ordenação e paginação em escala desde 18/10/2026; o formulário completo rola verticalmente no celular | Nenhuma divisão em etapas |
| Pedido (um pedido) | Resumo, itens, cliente, entrega, pagamento, fechamento e documentos ficam visíveis na mesma página | Manter seções identificadas e aceitar rolagem vertical |
| Tabela de preços e Simulador em 360×640 | 1,05 a 1,25 tela | Rever o cabeçalho de página para telas muito baixas |
| Comissões, Recebimentos, Aprovações, Equipe | Recebimentos está em abas (em aberto, estornos, recebidos) e Comissões dobra os lançamentos por vendedor; no celular ainda chegam a 1,5 e 1,9 tela em 360×640 | Paginar as parcelas em aberto |
| Novo pedido, Comissões, Recebimentos no celular | 1,2 a 1,8 tela | Usar `EquipmentPicker` no novo pedido; paginar as listas |

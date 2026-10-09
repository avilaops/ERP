# Diretrizes de UX do ERP

Regra da casa para toda tela nova ou alterada. Vale para qualquer empresa que use o ERP: a
marca (logo, nome) é de cada cliente; a forma de trabalhar é a mesma.

## A regra: uma tela, uma tarefa, uma decisão

Cada página ou etapa cabe na área útil de uma tela, no celular e no computador, em uso normal.
Quem abre a tela vê de imediato **onde está**, **o que pode fazer ali**, **qual informação
decide** e **qual é a próxima ação**.

Quando o conteúdo não cabe, ele é **reorganizado**, nunca espremido:

| O que sobra | Para onde vai |
|---|---|
| Passos de uma mesma tarefa | Etapas curtas (`?etapa=`), cada uma com a sua ação principal |
| Lista longa | Paginação (`Pager`), com tantas linhas quantas cabem na tela (`FitRows`) |
| Detalhe de um item | Abre junto do item (`<details>`) ou em tela própria |
| Explicação | Uma frase curta junto do que ela explica; o resto em "Ver …" |
| Filtros pouco usados | "Filtros", fechado, aberto sozinho quando há filtro em uso |

Proibido para "fazer caber": diminuir fonte, apertar controle abaixo de 44 px de altura, cortar
nome ou valor, e `overflow: hidden` para esconder o que vazou. Com zoom, fonte ampliada ou
teclado aberto a tela pode rolar: o que não pode é um campo ou uma ação ficar inalcançável.

## Perguntas antes de entregar uma tela

1. A tarefa principal está clara no título e na primeira dobra?
2. A informação que decide aparece sem rolar nem abrir nada?
3. Há **uma** ação principal, visível, e ela é a primeira do formulário (Enter a executa)?
4. A etapa cabe na área útil em 360×640, 390×844, 430×932, 1366×768 e 1440×900?
5. O que ficou de fora tem um caminho com nome claro ("Ver composição", "Filtros", "Mais")?
6. Dá para avançar, voltar e trocar de filtro sem perder o que foi digitado?
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
| `CARD`, `SECTION_TITLE` | Cartão só quando separa de verdade; agrupamento simples usa só o título pequeno |
| `LABEL`, `INPUT` | Todo campo com rótulo permanente acima e 44 px de altura (`--control`) |
| `PRIMARY`, `SECONDARY` | Uma ação principal por etapa; as demais são secundárias |
| `Pill` | Estado em duas ou três palavras, com texto e cor (`good`, `warn`, `bad`, `neutral`) |
| `pageOf` + `Pager` | Fatia de uma lista e o rodapé "1–8 de 133 · ‹ 1 de 17 ›" |
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

`~/.agents/claude/scratch/shots/ux.cjs` mede, nos cinco tamanhos, quantas telas de altura cada
página ocupa, se há sobra lateral e se alguma área precisa de rolagem horizontal. Meta: 1,0 em
todos. O que passar disso entra na lista de pendências do `docs/ux.md` abaixo, com o motivo.

## Pendências conhecidas (09/10/2026)

Telas que ainda não obedecem à regra e o caminho previsto para cada uma:

| Tela | Situação | Caminho |
|---|---|---|
| Produtos e custos | Catálogo inteiro numa página (10 a 21 telas) | Paginar com `pageOf`/`Pager`/`FitRows`, edição em tela própria |
| Parâmetros | Todos os grupos numa página (4 a 10 telas) | Uma seção por vez, com as abas que já existem como links |
| Dashboard | 2 a 5 telas | Indicadores na primeira dobra; gráficos em "Ver evolução" |
| Preços e metas | 1,6 a 4 telas | Separar quadro de alçada, metas e versões |
| Fornecedores | 1,2 a 2,7 telas | Cadastro em tela própria, lista paginada |
| Pedido (um pedido) | Longa, com abas de âncora | Partes do pedido como etapas reais |
| Tabela de preços e Simulador em 360×640 | 1,05 a 1,25 tela | Rever o cabeçalho de página para telas muito baixas |
| Clientes, Comissões, Recebimentos, Aprovações, Equipe, Dashboard, Preços e metas | Tabela com rolagem lateral dentro do cartão, no celular | Trocar a tabela por linhas compactas com detalhe, como na Tabela de preços |
| Novo pedido, Comissões, Recebimentos no celular | 1,2 a 1,8 tela | Usar `EquipmentPicker` no novo pedido; paginar as listas |

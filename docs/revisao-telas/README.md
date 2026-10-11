# Revisão visual das telas do ERP (2026-10-10)

Capturadas 157 rotas como Diretoria (incluindo abas e etapas, como `?aba=` e `?etapa=`) nos
cinco tamanhos do `docs/ux.md`: 360×640, 390×844, 430×932, 1366×768 e 1440×900. São 785
registros, cada rota uma vez em cada tamanho, com medições em `report.json` e uma amostra dos
prints nesta pasta. Banco local vazio: as telas foram vistas só no estado "sem dados".

## Como refazer

```bash
npm ci
npx playwright install chromium   # uma vez por máquina
npm run db:migrate                 # banco local vazio, com ERP_LOCAL_LOGIN=1 no .env.local
npm run dev                        # em outro terminal
npm run shots                      # prints e report.json em .shots/ (fora do git)
```

`npm run shots -- <pasta>` grava em outra pasta; `SHOTS_BASE` troca o endereço do ERP. O comando
sai com código 1 se uma rota não abrir (erro de rede ou status 4xx/5xx), se a descoberta de rotas
passar do limite ou se alguma rota faltar em algum tamanho. As regras de medição ficam em
`medir.mjs` e são cobertas por `tests/revisao-telas.test.ts`.

Em cada registro, `small` conta botões, links e campos visíveis com menos de 44 px de altura e
`smallMoldura` diz quantos deles são da moldura (menu lateral e barras do topo e de baixo).

## Defeitos encontrados

1. **Controles abaixo de 44 px em quase todas as telas.** Contando só o conteúdo da página, sem
   a moldura, 133 das 157 rotas têm pelo menos um controle baixo no computador e 131 a 132 no
   celular. Os campos têm 42 px e botões como "Adicionar" têm 40 px: ficam na faixa de 40 a 43
   px que a medição anterior (abaixo de 40) não via. As piores, iguais nos cinco tamanhos:
   `/parametros/categorias-de-contas` (78), `/parametros/fiscal` (62),
   `/parametros/formas-de-pagamento` (57, com caixas de seleção de 13 px),
   `/funil/prospeccao?ver=base` (28) e `/equipe/nova` (24). A correção natural é a altura de
   `INPUT` e dos botões em `src/components/ui.tsx` (`--control`), que conserta tudo de uma vez.
2. **Moldura abaixo de 44 px.** No computador, os 23 links do menu lateral (27 em algumas telas)
   ficam abaixo do mínimo, a maioria com 40 px. No celular, 3 ou 4 controles da barra do topo
   têm 32 px em parte das telas.
3. `/parametros/linhas` em 360×640 e 390×844: o `<select>` "De onde vem" passa da largura da
   tela e gera rolagem horizontal. Em 430×932 já cabe. É a única rota com rolagem horizontal
   nos cinco tamanhos.
4. `/funil` no computador: o subtítulo mostra "0 em andamento · R$ 0 · · equipe toda ·". Os
   separadores " · " ficam soltos porque os links entre eles são `md:hidden`
   (`src/app/(app)/funil/page.tsx:79-90`). O separador precisa esconder junto com o link.
5. `/funil`: o botão mostra "+Oportunidade" sem espaço (o "+ Novo pedido" tem).
6. `/dashboard` sem dados: o gráfico "Vendas fechadas por mês" fica um quadro vazio com os
   meses embaixo. Falta um estado vazio ("Nenhuma venda fechada no período").
7. **Telas que rolam na vertical**, mesmo vazias: 91 rotas em 360×640, 43 em 390×844, 36 em
   430×932, 17 em 1366×768 e 8 em 1440×900. Com dados reais esse número só cresce; o
   `docs/ux.md` pede que cada etapa caiba na área útil.

Nenhuma rota falhou ao abrir e nenhuma registrou erro no console.

## Amostra

| Arquivo | O que mostra |
|---|---|
| `360x640_parametros_linhas.png` | Rolagem horizontal do "De onde vem" (item 3) |
| `1440x900_parametros_formas-de-pagamento.png` | Nove formulários com "Salvar" e caixas de 13 px (item 1) |
| `1440x900_funil.png`, `1366x768_funil.png` | Separadores soltos e "+Oportunidade" (itens 4 e 5) |
| `390x844_funil.png` | O mesmo funil no celular |
| `1440x900_dashboard.png`, `390x844_dashboard.png` | Gráfico sem estado vazio (item 6) |

Os prints de página inteira mostram a barra de baixo do celular no meio da imagem, porque ela é
fixa na janela, e o indicador do Next.js no canto, que só existe em desenvolvimento.

## O que automatizar

- Rodar `npm run shots` no CI a cada PR e anexar o antes e depois. Falta subir o Postgres de
  teste e o ERP no job.
- Fazer o comando falhar também quando houver rolagem horizontal ou controle abaixo de 44 px,
  depois de corrigir os itens 1 a 3. Hoje ele só mede e registra.
- `npm run db:seed-demo`: não há carga de dados de exemplo; sem ela as telas só são revisadas
  vazias, e o manual (`docs/manual`) não consegue gerar prints realistas.
- Subir o Postgres de teste com `docker compose` num único comando (o `README` pede instalar à
  mão).

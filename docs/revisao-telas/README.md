# Revisão visual das telas do ERP (2026-10-10)

Capturadas 70 rotas como Diretoria, em 1440×900 e 390×844 (140 prints; amostra em
esta pasta, medições em `report.json`, script em `shoot.mjs`). Banco local vazio: as telas
foram vistas só no estado "sem dados".

## Defeitos encontrados

1. `/parametros/linhas` no celular: o `<select>` "De onde vem" passa da largura da tela e gera
   rolagem horizontal (única rota das 70 com isso).
2. `/funil` no computador: o subtítulo mostra "0 em andamento · R$ 0 · · equipe toda ·". Os
   separadores " · " ficam soltos porque os links entre eles são `md:hidden`
   (`src/app/(app)/funil/page.tsx:79-90`). O separador precisa esconder junto com o link.
3. `/funil`: o botão mostra "+Oportunidade" sem espaço (o "+ Novo pedido" tem).
4. `/parametros/formas-de-pagamento`: 9 formulários com "Salvar" cada um, 43 controles com
   menos de 40 px de altura (caixas de seleção e "Remover") em 1440×900; no celular são 37.
   Contraria o mínimo de 44 px do `docs/ux.md`.
5. `/dashboard` sem dados: o gráfico "Vendas fechadas por mês" fica um quadro vazio com os
   meses embaixo. Falta um estado vazio ("Nenhuma venda fechada no período").
6. Telas de lista (pedidos, produtos, contas a pagar): 11 a 14 controles abaixo de 40 px no
   computador; conferir se são só os links "Ver/Remover".

## O que automatizar

- `npm run shots`: transformar `shoot.mjs` em script do projeto (Playwright + login local) que
  gera prints nos cinco tamanhos do `docs/ux.md` e falha se houver rolagem horizontal ou
  controle abaixo de 44 px. Hoje a regra existe só no texto.
- `npm run db:seed-demo`: não há carga de dados de exemplo; sem ela as telas só são revisadas
  vazias, e o manual (`docs/manual`) não consegue gerar prints realistas.
- Rodar as capturas no CI a cada PR e anexar o antes/depois.
- Subir o Postgres de teste com `docker compose` num único comando (`README` pede instalar à mão).

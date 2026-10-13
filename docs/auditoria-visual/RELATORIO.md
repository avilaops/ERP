# Auditoria visual do ERP

Capturas de 56 telas em dois tamanhos (`desktop-*.png` 1440×900, `mobile-*.png` 390×844), perfil
Diretoria, banco recém-migrado (sem dados). Métricas por tela em `report.json`.

Reproduzir: `npm run dev` com `ERP_LOCAL_LOGIN=1`, depois `node scripts/capturar-telas.mjs`.

## O que a medição mostrou

- Nenhuma tela com erro de console ou resposta diferente de 200.
- Só uma tela com rolagem horizontal: `/parametros/linhas` no celular.
- `/producao/*` redireciona para `/sem-acesso` (módulo desligado na empresa de teste): não foi capturado.
- Rotas com `[id]` não foram capturadas: o banco está vazio.

## Melhorias visuais (por prioridade)

1. **`/parametros/linhas` estoura a largura no celular.** O `<select>` "De onde vem" tem opção longa
   ("Importada (assessoria, pagamento no exterior)") e passa da borda do cartão. Falta `w-full min-w-0`
   no select (`src/app/(app)/parametros/linhas/page.tsx:85`).
2. **Telas de parâmetros longas demais, contra o `docs/ux.md`.** Altura da página: `fiscal` 3846 px
   (6564 no celular), `categorias-de-contas` 2178 (4197), `contrato` 2157, `cores` 1891, `formas-de-pagamento`
   1464. Pela regra "uma tela, uma tarefa": `fiscal` em etapas (`?etapa=certificado|emitente|...`),
   as outras com `Pager`/`FitRows` e `<details>` por item.
3. **Linhas de edição repetidas sem agrupar** (`categorias-de-contas`, `formas-de-pagamento`, `cores`):
   cada linha tem Ordem + Nome + "Em uso" + Salvar + Remover, ~50 controles baixos (<40 px) por tela.
   Trocar por lista compacta com "Editar" que abre o item, ou salvar ao sair do campo.
4. **Campo de arquivo nativo** (`Choose File No file chosen`, em inglês) em `fiscal`. Estilizar o
   `<input type=file>` com rótulo "Escolher arquivo" no padrão de `ui.tsx`.
5. **Estados vazios sem convite.** Dashboard e Pedidos mostram "R$ 0", gráfico em branco e "Nenhum pedido
   ainda". Gráfico vazio deve virar uma frase com a ação ("Feche o primeiro pedido para ver as vendas");
   KPIs zerados podem ficar esmaecidos.
6. **Menu lateral no desktop 1366×768 / 1440×900** corta o fim da lista ("Simulador" fica pela metade, o
   resto só com rolagem do menu). Agrupar (Vendas, Financeiro, Cadastros, Sistema) com seções recolhíveis
   resolve sem rolagem.
7. **Controles abaixo de 44 px** (regra do `docs/ux.md`): 6–13 por tela no desktop, quase todos no menu e
   nas abas. Conferir o `--control` nos links do menu e nas pílulas de filtro.
8. **Distintivo do Next (N)** sobrepõe "Parâmetros" no menu e a primeira aba no celular. É só do `dev`,
   mas atrapalha capturas: `devIndicators: false` em `next.config.ts`.
9. **Títulos com texto de apoio de 3–4 linhas no celular** (`linhas`, `fiscal`) empurram a ação para
   baixo da primeira dobra. Uma frase curta e o resto em "Ver como funciona".

## O que automatizar

1. **Capturas e métricas no CI**: rodar `scripts/capturar-telas.mjs` em PR, falhar se houver
   `overflowX`, erro de console ou status ≠ 200, e anexar os prints como artefato.
2. **Teste de regressão visual** com `toHaveScreenshot` do Playwright nos cinco tamanhos do `docs/ux.md`
   (360×640, 390×844, 430×932, 1366×768, 1440×900), em vez da medição manual de hoje.
3. **Semente de dados de demonstração** (`npm run db:seed-demo`): pedidos, clientes, funil, contas.
   Sem isso as capturas só mostram telas vazias e as rotas `[id]` nunca são cobertas. O manual
   (`docs/manual`) também poderia regenerar os prints sozinho a partir dela.
4. **Checagem de altura mínima de controle** (44 px) e de `overflow: hidden` como teste de lint/Playwright,
   já que são regras da casa que hoje só dependem de revisão.
5. **Perfis**: repetir a captura para Gerente, Vendedor e Financeiro (cada um vê um menu diferente) via
   `ERP_ROLE`.

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
## Auditoria complementar de 13/10/2026

Esta captura independente usa os arquivos de `prints/`; os resultados acima usam
os arquivos `desktop-*.png` e `mobile-*.png`.

Método: ERP local (`ERP_LOCAL_LOGIN=1`, perfil Diretoria, banco recém-migrado, **sem dados**), 58 telas
estáticas em 390×844 (celular) e 1366×768 (computador) = 114 prints em `prints/`. Telas com `[id]`
não foram tiradas porque o banco está vazio. Medição automática: rolagem horizontal, altura da página,
controles com menos de 40 px, erros de console.

## Resultado objetivo

- 0 telas com rolagem horizontal; 0 erros de console; todas respondem 200.
- `/producao` e `/producao/*` caem em `/sem-acesso` (módulo desligado para a empresa; esperado, mas ver item 6).
- `/empresa` redireciona para o dashboard.
- Telas que estouram a regra "uma tela, uma tarefa" no celular (altura da página):
  `/parametros/fiscal` 6564 px, `/parametros/categorias-de-contas` 4197, `/parametros/cores` 3638,
  `/parametros/contrato` 2894, `/parametros/formas-de-pagamento` 2739, `/fornecedores` 1581.
- Controles menores que 40 px (regra: 44 px): `categorias-de-contas` (46 no celular, 52 no computador),
  `formas-de-pagamento` (37 / 43), `cores` (25 / 31), `equipe/nova` (23 / 29), `equipe/perfis` (13 / 19).
  Parte são checkboxes nativos e links "Remover".

## Melhorias visuais (por prioridade)

1. **Listas editáveis em Parâmetros** (categorias, formas de pagamento, cores): cada item é um mini-formulário
   com Ordem + Nome + Em uso + Salvar + Remover. No celular, 15 categorias viram 4 mil px. Trocar por lista
   compacta (nome + `Pill` de estado) com edição ao tocar (`<details>`) e `Pager`/`FitRows`; ordem por arrastar
   ou botões subir/descer em vez de campo numérico.
2. **`/parametros/fiscal`** (6,5 mil px no celular): dividir em etapas (`?etapa=`) conforme `docs/ux.md`
   (emitente, certificado, regras, série/numeração).
3. **Alvos de toque**: checkboxes "Em uso", "Saldo na entrega", "Remover" e os de "Telas liberadas" com
   área clicável de 44 px (envolver em `label` com `min-h-[var(--control)]`).
4. **Estados vazios**: "Nenhum pedido ainda…" é só uma linha em cartão branco enorme. Ícone/ilustração leve +
   botão principal dentro do vazio; o mesmo no dashboard (tudo `R$ 0` / `—` sem explicar que falta dado):
   mostrar "Sem vendas neste período" e esconder os gráficos vazios.
5. **Desktop, conteúdo largo**: `funil/painel` fica num miolo de ~770 px com muito vazio nos lados, enquanto
   `formas-de-pagamento` usa a largura toda. Padronizar largura máxima por tipo de tela (lista, formulário, painel).
6. **Menu lateral**: o item "Comissões" é cortado pelo fim da viewport sem indício de rolagem
   (sombra/degradê no rodapé do menu). Itens de módulos sem acesso (Produção) não deveriam aparecer; ao menos
   `/sem-acesso` deve explicar que o módulo está desligado e quem liga.
7. **Hierarquia dos textos de ajuda**: parágrafos de 2–3 linhas sob o título em todas as telas de Parâmetros;
   a regra pede uma frase curta e o resto em "Ver …".
8. **Indicador do Next dev** (botão "N") cobre a aba "Pedidos" e o menu; só em dev, mas atrapalha prints e
   testes de toque. Desligar com `devIndicators: false` em `next.config.ts`.

## O que dá para automatizar

1. **Prints em CI**: `scripts/prints-das-telas.mjs` (este relatório o usou) gera os 114 prints e a tabela de
   métricas. Rodar em PR com banco semeado e anexar como artefato; comparar com a baseline
   (`toHaveScreenshot` do Playwright) para pegar regressão visual.
2. **Teste de regras do `docs/ux.md`** no mesmo script, falhando o CI quando: rolagem horizontal, controle < 44 px,
   página > N× a altura da tela em telas que não são listas, erro de console.
3. **Seed de demonstração** (`npm run db:seed-demo`): clientes, pedidos, funil e contas a pagar fictícios. Hoje as
   telas vazias escondem os problemas reais (tabelas largas, nomes longos, paginação) e as telas com `[id]`
   não podem ser auditadas.
4. **Cinco tamanhos do `docs/ux.md`** (360×640, 390×844, 430×932, 1366×768, 1440×900) como matriz do script;
   hoje só dois foram medidos aqui.
5. **Axe-core** (acessibilidade: contraste, rótulos, foco) rodando por tela no mesmo laço.
6. **Manual com prints atualizados**: `docs/manual` tem prints manuais; gerar a partir do mesmo script a cada
   release para não envelhecerem.

## Limites desta auditoria

Banco vazio e só o perfil Diretoria; não testei Vendedor/Gerente/Financeiro, telas `[id]`, nem fluxos
(criar pedido, emitir NF-e). Os demais repositórios (TMS, CRM, lojas, auth, cms, site, n8n, motor-web)
não foram abertos nesta rodada.

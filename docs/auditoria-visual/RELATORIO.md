# Auditoria visual do ERP (13/10/2026)

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

# Concluir o módulo Fiscal — plano de implementação

**Goal:** Dar à Diretoria um módulo Fiscal operacional e encontrável, do pedido fechado até emissão, distribuição, revisão e inutilização.

**Architecture:** Separar configuração (`/parametros/fiscal`) de operação (`/fiscal`). A tela operacional lê apenas metadados fiscais por tenant, organiza o trabalho em abas curtas e leva a ação contextual de emissão/eventos para o pedido correspondente. Nenhum XML, certificado ou segredo entra nas listagens.

**Tech Stack:** Next.js 16, TypeScript, PostgreSQL 16, Node test runner e Playwright no GitHub Actions.

## Restrições

- Não transmitir documento fiscal nem e-mail real durante a verificação.
- Não executar build, servidor, banco ou Playwright localmente; a verificação pesada roda no GitHub Actions.
- Preservar isolamento por tenant e escopo de pedidos.
- Todas as telas seguem `docs/ux.md` nos cinco tamanhos.

### Task 1: Acesso e navegação

- [x] Adicionar a permissão e o grupo `Fiscal` ao menu da Diretoria.
- [x] Proteger painel, preparação, prévias e ações fiscais pela permissão fiscal.
- [x] Manter configurações e certificado sob `parametros`.

### Task 2: Consulta operacional

- [x] Consultar pedidos fechados a emitir, filas, revisões, notas e inutilizações sem carregar XML ou segredos.
- [x] Distinguir trabalho a iniciar, em processamento, em revisão e concluído.
- [x] Cobrir o mapeamento e o isolamento das consultas em testes.

### Task 3: Tela Fiscal

- [x] Criar `/fiscal` com indicadores e abas `Pendências`, `Notas fiscais` e `Inutilizações`.
- [x] Oferecer acesso direto ao ponto correto do pedido e às configurações fiscais.
- [x] Paginar listas, preservar área de toque e evitar rolagem lateral.

### Task 4: Sequência no pedido

- [x] Exibir próximos passos no Resumo de pedido fechado.
- [x] Renomear a etapa para `Documentos e nota fiscal` e abrir a seção correta pelos atalhos.
- [x] Deixar explícitos emissão, resultado, downloads e envio por e-mail.

### Task 5: Verificação e entrega

- [x] Corrigir a incompatibilidade de tipos do envio de e-mail detectada pelo CI.
- [x] Atualizar manual, plano e controle da equipe.
- [x] Enviar commits ao GitHub e obter lint, tipos, testes, build e telas verdes.
- [x] Inspecionar os prints de `/fiscal` nos cinco tamanhos e revisar o diff final.

## Resultado

- Implementação validada no GitHub Actions: <https://github.com/avilaops/ERP/actions/runs/39047714624>.
- `/fiscal`, `?ver=notas` e `?ver=inutilizacoes`: uma tela, sem rolagem lateral e sem controles menores que 44 px em 360×640, 390×844, 430×932, 1366×768 e 1440×900.
- Pull request pronta para revisão: <https://github.com/avilaops/ERP/pull/21>.

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

- [ ] Adicionar a permissão e o grupo `Fiscal` ao menu da Diretoria.
- [ ] Proteger painel, preparação, prévias e ações fiscais pela permissão fiscal.
- [ ] Manter configurações e certificado sob `parametros`.

### Task 2: Consulta operacional

- [ ] Consultar pedidos fechados a emitir, filas, revisões, notas e inutilizações sem carregar XML ou segredos.
- [ ] Distinguir trabalho a iniciar, em processamento, em revisão e concluído.
- [ ] Cobrir o mapeamento e o isolamento das consultas em testes.

### Task 3: Tela Fiscal

- [ ] Criar `/fiscal` com indicadores e abas `Pendências`, `Notas fiscais` e `Inutilizações`.
- [ ] Oferecer acesso direto ao ponto correto do pedido e às configurações fiscais.
- [ ] Paginar listas, preservar área de toque e evitar rolagem lateral.

### Task 4: Sequência no pedido

- [ ] Exibir próximos passos no Resumo de pedido fechado.
- [ ] Renomear a etapa para `Documentos e nota fiscal` e abrir a seção correta pelos atalhos.
- [ ] Deixar explícitos emissão, resultado, downloads e envio por e-mail.

### Task 5: Verificação e entrega

- [ ] Corrigir a incompatibilidade de tipos do envio de e-mail detectada pelo CI.
- [ ] Atualizar manual, plano e controle da equipe.
- [ ] Enviar commits ao GitHub e obter lint, tipos, testes, build e telas verdes.
- [ ] Inspecionar os prints de `/fiscal` nos cinco tamanhos e revisar o diff final.

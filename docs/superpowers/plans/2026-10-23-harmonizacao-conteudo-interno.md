# Harmonização do Conteúdo Interno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar hierarquia, espaçamento, ações e estados das páginas internas do ERP sem alterar o menu lateral.

**Architecture:** Evoluir as peças compartilhadas de `src/components/ui.tsx` e substituir implementações locais por esses contratos. Aplicar a mudança por ondas funcionais para manter cada conjunto testável e revisar as telas nos cinco tamanhos antes da integração.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4 e Playwright.

**Spec:** `docs/ux.md` e critérios registrados em `AVL-16`, `AVL-18`, `AVL-19` e `AVL-20`.

## Global Constraints

- O menu lateral não faz parte desta rodada.
- Uma tela, uma tarefa e uma decisão.
- Controles interativos devem medir pelo menos 44 CSS px.
- Fonte condensada fica restrita aos títulos de página.
- Não diminuir fonte, truncar nomes necessários ou esconder excesso para fazer conteúdo caber.
- Commit e push somente após o módulo planejado estar completo e revisado.

## Review Focus

- Estado vazio precisa orientar a próxima ação sem inventar ação que o perfil não possui.
- Cabeçalhos com ações devem quebrar corretamente em 360 px e manter a ação alcançável.
- Listas cheias e vazias devem conservar a mesma posição de título, filtros e paginação.
- Tema escuro precisa manter contraste de texto, borda e foco.
- Texto a 200% não pode criar rolagem lateral nem ocultar ações.

---

### Task 1: Fundação compartilhada e Aprovações

**Files:**
- Modify: `src/components/ui.tsx`
- Modify: `src/app/(app)/aprovacoes/page.tsx`
- Modify: `tests/visual/harmonizacao.spec.ts`

**Interfaces:**
- Produces: `EmptyState({ title, description, action? })` e uso consistente de `PageHeader`.

- [x] **Step 1: Escrever o teste visual do cabeçalho e vazio de Aprovações**
- [x] **Step 2: Executar o teste e confirmar a falha anterior**
- [x] **Step 3: Implementar `EmptyState` e migrar Aprovações**
- [x] **Step 4: Executar lint, tipos e teste visual afetado**

### Task 2: Fluxos comerciais

**Files:**
- Modify: páginas cobertas por `AVL-18`
- Modify: `tests/visual/harmonizacao.spec.ts`

**Interfaces:**
- Consumes: `PageHeader`, `EmptyState`, `ViewTabs`, `ListQuery` e `ListPager`.

- [x] **Step 1: Migrar Clientes, Pedidos, Aprovações, Tabela de preços, Simulador e Preços e metas**
- [x] **Step 2: Validar cabeçalhos, ações, vazios e listas nos cinco tamanhos**

### Task 3: Operação, financeiro e gestão

**Files:**
- Modify: páginas cobertas por `AVL-19`
- Modify: `tests/visual/harmonizacao.spec.ts`

**Interfaces:**
- Consumes: contratos compartilhados das tarefas anteriores.

- [x] **Step 1: Migrar módulos operacionais, financeiros, fiscais e de gestão**
- [x] **Step 2: Validar listas vazias/cheias, permissões e paginação nos cinco tamanhos**

### Task 4: Parâmetros e fechamento

**Files:**
- Modify: páginas cobertas por `AVL-20`
- Modify: `docs/ux.md`
- Modify: testes visuais pertinentes

**Interfaces:**
- Consumes: todos os contratos visuais consolidados.

- [x] **Step 1: Harmonizar o índice e as páginas internas de Parâmetros**
- [ ] **Step 2: Rodar lint, tipos, testes, build e varredura visual completa**
- [ ] **Step 3: Inspecionar artefatos nos cinco tamanhos e atualizar as issues**

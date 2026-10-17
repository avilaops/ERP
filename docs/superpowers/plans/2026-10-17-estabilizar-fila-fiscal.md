# Estabilizar a fila fiscal da PR21 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir a PR21 com fila fiscal recuperável, idempotente e com CI verde.

**Architecture:** Manter a fila PostgreSQL por tenant, vinculando cada job ao documento e ao resultado persistido. Recuperações consultam o estado gravado antes de qualquer nova operação externa; inutilizações de resultado incerto nunca são retransmitidas automaticamente.

**Tech Stack:** Next.js 16, TypeScript, Node test runner, PostgreSQL 16, Playwright.

**Spec:** `docs/validacao-fiscal-local.md` e critérios das AVL-73/AVL-75.

## Global Constraints

- Não transmitir documentos fiscais nem e-mails reais em testes.
- Preservar isolamento por tenant e o transporte/SMTP existentes.
- Não mesclar nem publicar automaticamente.
- Telas alteradas obedecem a `docs/ux.md` nos cinco tamanhos.

## Review Focus

- Queda após resposta externa não pode repetir emissão, evento ou inutilização.
- Operação repetida com conteúdo divergente deve ser recusada explicitamente.
- Troca de ambiente não pode redirecionar evento para outra nota.
- Quinta tentativa e lease expirado devem terminar em revisão manual.
- E-mail automático deve reutilizar o destinatário registrado e ser idempotente.

---

### Task 1: Sincronizar a branch e restaurar o CI

- [ ] Integrar `main` na branch sem reescrever histórico.
- [ ] Reproduzir e corrigir expectativas de migrations, fixture de pagamento e regex multiplataforma de rotas.
- [ ] Executar os três testes direcionados.

### Task 2: Recuperação idempotente de emissão e eventos

- [ ] Escrever testes para resultados autorizados, denegados, não finais e eventos já persistidos após queda.
- [ ] Vincular jobs a nota e resultado persistido em migration nova.
- [ ] Fixar a nota do evento na confirmação, rejeitar conteúdo divergente e recuperar sem retransmitir.
- [ ] Corrigir limite de tentativas, reabertura/exclusão de pedido e erros transitórios.

### Task 3: E-mail automático e processamento em lote

- [ ] Escrever testes para destinatário, deduplicação e recuperação após autorização.
- [ ] Reutilizar o último destinatário bem-sucedido e impedir reenvio do mesmo evento.
- [ ] Drenar no máximo 10 jobs prontos por tenant e manter erros terminais visíveis.

### Task 4: Inutilização segura

- [ ] Escrever testes para justificativa divergente, lease expirado e faixa tornada inválida.
- [ ] Nunca retentar automaticamente uma inutilização incerta.
- [ ] Revalidar faixa e emissões concorrentes imediatamente antes do envio.

### Task 5: Verificação e registro

- [ ] Executar testes direcionados, suíte completa, lint, typecheck, build e Playwright.
- [ ] Atualizar documentação e controle da equipe com evidência real.
- [ ] Revisar o diff completo e corrigir achados importantes antes do handoff.

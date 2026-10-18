# Fluxo fiscal de emissão e e-mail

**Objetivo:** deixar a emissão da NF-e localizável e acionável em todos os estados, e permitir escolher os documentos fiscais enviados por e-mail sem alterar decisões tributárias do cliente.

**Arquitetura:** manter a fila fiscal e o envio automático existentes. A tela passa a apresentar uma etapa de emissão permanente: quando houver impedimentos, mostra o botão desabilitado e leva diretamente à primeira regra que precisa de correção; quando estiver pronta, mantém a confirmação antes de enfileirar. O reenvio manual passa a aceitar uma seleção explícita de anexos disponíveis, validada no servidor. O envio automático continua usando o pacote fiscal padrão para não quebrar a entrega já configurada.

**Stack:** Next.js 16, React 19, TypeScript, PostgreSQL, node:test, Playwright.

## Restrições globais

- Não preencher CST, CFOP, alíquota ou classificação tributária por inferência.
- Não reduzir validações necessárias para construir XML válido.
- Preservar emissão assíncrona, autorização SEFAZ e histórico de e-mails.
- Preservar o pacote automático atual; seleção vale para envio manual.
- Interface responsiva, acessível por teclado e clara em celular.

## Task 1: Rota acionável para pendências fiscais

**Arquivos:** `src/lib/fiscal/rules-form.ts`, `tests/fiscal-rules-form.test.ts`

**Interface:** `firstProblemStep(problems: readonly string[]): number` retorna o índice da primeira etapa relevante, com fallback para Operação.

1. Escrever testes para IPI, IBS/CBS, ICMS, CFOP e mensagem desconhecida.
2. Executar o teste e confirmar RED por função ausente.
3. Implementar o mapeamento mínimo por termos presentes nas mensagens fiscais.
4. Executar o teste e confirmar GREEN.

## Task 2: Seleção segura de anexos no e-mail

**Arquivos:** `src/lib/db/send-nfe-mail.ts`, `src/app/(app)/pedidos/nfe-actions.ts`, `tests/db-orders.test.ts`

**Interface:** `documents?: readonly InvoiceMailDocument[]`, com `xml`, `danfe`, `evento` e `contrato`; ausência preserva o pacote automático atual.

1. Escrever testes de envio manual seletivo, seleção vazia e contrato assinado.
2. Executar os testes e confirmar RED por contrato/API ainda inexistentes.
3. Validar a lista no servidor; anexar somente os documentos escolhidos e disponíveis.
4. Manter o envio automático sem `documents`, preservando XML, DANFE e evento aplicável.
5. Executar os testes e confirmar GREEN.

## Task 3: Fluxo visual único de emitir e enviar

**Arquivos:** `src/app/(app)/pedidos/[numero]/page.tsx`, `tests/routes.test.ts`

**Interface:** o botão `Emitir nota fiscal` sempre aparece. Com pendências, fica realmente desabilitado e acompanhado do CTA para a primeira etapa fiscal. Após autorização, o formulário lista os anexos disponíveis com caixas de seleção.

1. Escrever teste estrutural da tela para o estado bloqueado e os controles de anexos.
2. Executar o teste e confirmar RED.
3. Implementar painel de emissão e formulário de envio responsivos, usando a identidade visual atual.
4. Executar o teste e confirmar GREEN.

## Task 4: Verificação integral e evidência visual

1. Executar testes focados, `npm test`, `npm run typecheck`, `npm run lint` e `npm run build`.
2. Subir a aplicação localmente e gerar prints desktop e mobile do fluxo fiscal.
3. Revisar os prints e corrigir regressões visuais.
4. Revisar o diff completo e só então fazer commit e push da branch.

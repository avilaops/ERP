# SDD ledger — plan: docs/superpowers/plans/2026-10-18-nfe-recebida-operacional.md

Pre-flight: tasks share the fiscal document identity, supplier/product links, purchase and stock effects defined in the specification.

Ruling: no intermediate commits — repository policy permits commit and push only after the whole planned module is implemented, documented, reviewed and ready for final validation.

Task 1: in progress — migration, defensive nfeProc parser, tenant repository, authenticated import/list/download UI. Local evidence: typecheck and lint pass; focused tests 2/2; full suite 533 pass, 244 database skips, 0 failures.

Task 1: DANFE and detail added — authenticated PDF route renders only from the preserved authorized XML; detail shows header, totals, protocol and every item. Focused tests: 3 pass; 2 PostgreSQL tests present and skipped locally because ERP_TEST_DATABASE_URL is absent. Typecheck and lint pass.

Task 1: security gate corrected — import now validates the embedded signed NFe against the versioned local XSD and verifies XML-DSig using the certificate carried by the document. A real signed nfeProc passes; post-signature tampering fails.

Task 2: in progress — explicit supplier/product linking, idempotent purchase creation, immutable cost history and separate stock receiving implemented. Fractional quantities are preserved to four decimal places. PostgreSQL integration tests are present and await GitHub CI.

Ruling: distribution implementation follows official NT 2014.002 v1.40 and Distribuicao DF-e schema package v1.04; after cStat 137, wait at least one hour. Manifestation deadline is 90 days from 2026-06-01.

Tasks 1–9: implemented — complete authorized XML, DANFE, durable distribution cursor, explicit recipient manifestation, supplier/product reconciliation, purchase, cost history, separate stock receipt and versioned API consumed by Lojas.

Local verification: typecheck and focused lint pass; 791 ERP tests discovered, 540 executed and 251 database tests skipped without a database, zero failures; focused PostgreSQL run 26/26; Lojas unit suite 1122/1122. Desktop and mobile evidence is in `docs/revisao-telas/avl-95-nfe-recebida/` and the Lojas integration evidence is in its AVL-254 worktree.

Task 10: pending GitHub delivery — commit only after this final evidence, then push, open PRs and require green CI plus artifact inspection. No deployment is authorized.


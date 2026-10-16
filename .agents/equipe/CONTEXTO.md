# Contexto verificavel

- Identificador: `avila-erp`.
- Origem: raiz deste checkout; nao depende de um caminho absoluto.
- Fontes encontradas: `README.md`, `package.json`, `AGENTS.md`.
- Gerenciador declarado: nao declarado no package.json; conferir lockfile e regras locais.

## Estrutura observada

- `db/`
- `deploy/`
- `docker/`
- `docs/`
- `prototype/`
- `public/`
- `scripts/`
- `src/`
- `tests/`

## Scripts de verificacao declarados

- `lint`: `eslint`
- `typecheck`: `tsc --noEmit`
- `test`: `node --experimental-strip-types --disable-warning=ExperimentalWarning --env-file-if-exists=.env.test.local --import ./tests/register.mjs --test "tests/*.test.ts"`
- `test:telas`: `playwright test`

Esta lista e um retrato de 15/10/2026, nao uma prova de que os comandos passaram.
Confirme os comandos e seus efeitos antes de executa-los. Alguns testes dependem de servicos externos.
Nao execute deploy, migracao ou envio como parte de uma consulta de status.

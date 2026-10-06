# Operação do ERP Ludus

Como rodar, testar e o que falta para produção. Atualizado em 06/10/2026.

## Situação

| Ambiente | Situação |
| --- | --- |
| Desenvolvimento (servidor `creators` da Ávila Ops) | No ar sob demanda: `npm run dev`, bancos `erp` e `erp_test` no PostgreSQL do servidor |
| Integração contínua (GitHub Actions) | `.github/workflows/ci.yml`: lint, tipos, testes com banco e build, a cada push na `main` e em todo PR |
| Produção | **Não existe ainda.** O endereço será `https://erp.avilaops.com` (decisão de 06/10/2026; não haverá domínio próprio da Ludus). Hoje o nome aponta para o Cloudflare sem servidor atrás (erro 525). Servidor, banco de produção e deploy ficaram para depois, para focar no software |

## Variáveis de ambiente

Todas descritas em `.env.example`. Nenhuma tem valor real no repositório.

| Variável | Para quê | Em produção |
| --- | --- | --- |
| `DATABASE_URL` | Banco PostgreSQL do ERP (a única conexão do sistema) | Obrigatória: sem ela o processo não sobe |
| `SSO_JWT_SECRET` | Segredo que confere o cookie do Auth central (`auth.avilaops.com`) | Obrigatória, 32 caracteres ou mais, diferente do valor de exemplo |
| `APP_URL` | Endereço público do sistema, usado na volta do login | Obrigatória e em `https` |
| `ERP_USERS` | Quem entra e com qual perfil (`email:PERFIL`, separados por vírgula) | Obrigatória; entrada inválida impede a subida |
| `ERP_LOCAL_LOGIN` | `1` liga o login local de teste (`/dev/login`) | Ignorada: o login local não existe em produção |
| `ERP_TEST_DATABASE_URL` | Banco dos testes; o nome tem de terminar em `_test` | Não se usa |

Falha fechada: em produção, faltando ou estando inválida qualquer uma das quatro primeiras, a
aplicação não sobe e nenhuma requisição é atendida (`src/instrumentation.ts`).

## Rodar localmente

Node 24 e npm.

```bash
npm install
docker compose up -d                 # PostgreSQL 16 em 127.0.0.1:5433, com os bancos erp e erp_test
cp .env.example .env.local           # ajuste DATABASE_URL para a porta 5433 e a senha erp-local
npm run db:migrate                   # cria ou atualiza as tabelas
npm run dev                          # http://localhost:3020
```

Quem já tem PostgreSQL na máquina pode dispensar o Docker: basta criar os bancos `erp` e
`erp_test` e apontar as duas variáveis para eles.

Para entrar sem o Auth central, ponha `ERP_LOCAL_LOGIN=1` no `.env.local`: `/dev/login` entra
com um usuário de teste por perfil. O login padrão, também em desenvolvimento, é o do Auth
central, que só devolve para o endereço cadastrado do aplicativo.

## Testar

Um comando por vez (o servidor da Ávila Ops tem 4 GB de RAM) e sem `npm run dev` aberto durante o build.

```bash
npm run lint
npm run typecheck
npm test          # com ERP_TEST_DATABASE_URL em .env.test.local; "skipped" tem de ser 0
npm run build
```

Cada arquivo de teste de banco cria um esquema `test_…` só dele, aplica as migrações e o apaga no fim.

## Banco de dados

- Mudança de esquema é arquivo novo em `db/migrations/`, aplicado por `npm run db:migrate`.
  Rodar de novo não muda nada. Migração já aplicada não se edita.
- O banco começa vazio, só com os parâmetros iniciais (migração `0002`). **Não há carga de
  equipamentos:** o protótipo não traz os dados (ficam no banco do artifact do Rogério), e a
  carga dos 133 equipamentos com custo é a fase 3 do roadmap.
- O banco `erp` de desenvolvimento **não tem backup**. Antes de receber dado real precisa entrar
  no backup diário do servidor.

## Integração contínua

A cada push na `main` e em todo PR, o GitHub Actions sobe um PostgreSQL 16, instala as
dependências e roda lint, tipos, testes (falha se algum teste de banco for pulado) e build.
**Não faz deploy.**

## O que falta para produção

Nada disto foi feito. Na ordem em que precisa acontecer:

1. Servidor em nuvem para a aplicação (o `creators` tem 4 GB e já ficou sem memória).
2. PostgreSQL de produção, separado do de desenvolvimento, com backup diário e restauração testada.
3. `erp.avilaops.com` apontando para o servidor, com TLS válido de ponta a ponta (o Cloudflare já responde pelo nome).
4. Aplicativo `erp` no Auth central (já cadastrado com `https://erp.avilaops.com`), e `SSO_JWT_SECRET`,
   `APP_URL` e `ERP_USERS` reais no servidor (nunca no repositório).
5. Passo de deploy no pipeline, depois do build: aplicar migrações e reiniciar o serviço.
6. Conferência final: cada um dos quatro perfis entra pelo endereço de produção e vê só a sua parte.

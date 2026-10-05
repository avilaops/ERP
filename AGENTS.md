# ERP Ludus Equipamentos

Sistema comercial da Ludus Equipamentos, desenvolvido pela Ávila Ops. Next.js (App
Router) + TypeScript strict + Tailwind. Código em inglês, interface em pt-BR.

O que o sistema faz está em `docs/manual/`; o que falta fazer, em `docs/roadmap.md`.

## Como rodar

Node 24 e npm (não há pnpm no servidor).

```bash
npm install
cp .env.example .env.local   # ajuste os valores; nunca comite
npm run dev                  # http://localhost:3020
```

Em desenvolvimento, com `ERP_LOCAL_LOGIN=1` no `.env.local`,
`http://localhost:3020/dev/login` entra com um usuário de teste por perfil, sem
depender do Auth central. Sem a variável a rota responde 404.

## Como testar

Um comando por vez (o servidor tem 4 GB de RAM) e sem `npm run dev` aberto durante o build.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes usam o executor do próprio Node (`tests/*.test.ts`). `tests/loader.mjs`
resolve `@/` e troca `next/headers` e `next/navigation` por substitutos: os cookies da
"requisição" vêm de `setCookies()` em `tests/helpers.ts`.

## Regras de `src/lib/auth/`

Todo o login mora nesta pasta. O resto do código usa só duas funções, de
`@/lib/auth`:

- `getSession()` devolve `{ email, name, role }` ou `null`.
- `requirePermission(item)` devolve a sessão ou redireciona: sem sessão, para o Auth
  central; com sessão e sem permissão, para `/sem-acesso`.

Regras que não se quebram:

1. **Toda página dentro de `src/app/(app)/` chama `await requirePermission(...)` antes
   de renderizar.** A permissão é conferida no servidor, em cada rota; esconder o item
   do menu não protege nada. `tests/routes.test.ts` falha se uma página não chamar.
2. **`permissions.ts` é a única fonte de "qual perfil acessa qual item".** Menu, rotas
   e testes leem de lá. Mudou a matriz: mude esse arquivo e `tests/permissions.test.ts`.
3. **O perfil vem do diretório do ERP (`directory.ts`), nunca do navegador nem do
   `papel` do SSO.** Hoje o diretório lê `ERP_USERS`; quando houver banco, troca-se a
   implementação de `UserDirectory`, não quem a usa. Do token do SSO só se aceita o
   que tem `exp` numérico (`sso.ts`): sessão sem validade é recusada.
4. **Falha fechada.** Em produção, sem `SSO_JWT_SECRET`, `APP_URL` ou `ERP_USERS`
   válidos, o processo não sobe (`src/instrumentation.ts`) e nenhuma requisição é
   atendida. Entrada inválida em `ERP_USERS` é erro, não é ignorada. Em produção o
   `SSO_JWT_SECRET` precisa ter 32 caracteres ou mais e não pode ser o valor do
   `.env.example`, e a `APP_URL` precisa ser `https`.
5. **O login local (`local-provider.ts`, `/dev/login`) só existe com `NODE_ENV`
   `development` ou `test` e, além disso, `ERP_LOCAL_LOGIN=1`.** O cookie dele não é
   assinado, por isso o `NODE_ENV` sozinho não basta. Faltando qualquer um dos dois, e
   sempre em produção, a rota responde 404 e o cookie é ignorado. Não crie atalho de
   login que funcione em produção.
6. A decisão de acesso é a função pura `decideAccess` (`access.ts`). Regra nova de
   acesso entra lá, com teste, e não espalhada pelas páginas.

## Git

Toda alteração vai por commit direto na `main`, na mesma tarefa:
`git pull --rebase origin main` → lint, typecheck, testes e build → commit →
`git push origin main`. Sem branch parada e sem PR aberto esperando. Nunca
`push --force` na `main` e nunca comite segredo (`.env*` está no `.gitignore`; só o
`.env.example`, com valores fictícios, é versionado).

Ao concluir um item do `docs/roadmap.md`, marque a caixa no mesmo commit.

Arquivos temporários de agente: `.work/` (ignorado pelo Git).

## Fora deste repositório

Servidor, domínio, DNS, TLS, deploy e o `SSO_JWT_SECRET` real não são tratados aqui.
O Auth central fica em `auth.avilaops.com`, onde o app `erp` já está registrado.

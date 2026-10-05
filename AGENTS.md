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

## Regras de `src/lib/pricing/`

Todas as contas do ERP moram nesta pasta: custo real, preço de tabela, desconto
máximo, conta do pedido com ICMS e DIFAL, entrada mínima, parcelas e comissão. São
funções puras, sem banco e sem tela, conferidas com os números dos prints do manual
(`tests/pricing-*.test.ts`).

1. **É a única fonte das contas.** Tela, rota e relatório chamam estas funções; não
   refazem cálculo, nem "só uma soma". Importe sempre o arquivo
   (`@/lib/pricing/order`), nunca a pasta.
2. **Mudou a regra, muda a função e o teste-gabarito no mesmo commit.** Os valores
   dos testes vêm do protótipo; número novo precisa de origem (print, manual ou
   pedido do Rogério).
3. **Custo, valor da China e lucro nunca vão para o navegador de quem não é
   Diretoria.** Em `quoteOrder`, tudo de `taxes` para baixo é o quadro "Só o diretor
   vê": a página monta no servidor só o que o perfil pode ver.
4. **A pasta não conhece o resto do sistema.** Sem `next/*`, `react`, `@/lib/auth`,
   `process.env`, relógio ou rede: parâmetros e datas (`AAAA-MM-DD`) entram por
   argumento. `tests/pricing-purity.test.ts` falha se isso mudar.
5. Taxas são frações (`0.15` = 15%). Valores em reais com precisão cheia;
   `roundCents` só na saída.
6. **Entrada inválida é erro em português, nunca `NaN` nem valor negativo.** As funções
   de base conferem o que recebem (`assertAmount`, `assertRate` em `money.ts`) e
   `quoteOrder` chama `validateParams` antes de calcular.
7. **Custo real não se guarda arredondado.** A tabela só fecha no centavo com o
   protótipo quando `tablePrice` recebe o custo real em precisão cheia, vindo de
   `realCost` com o crédito de impostos em sete casas ou mais.
8. O quadro Resultado da tela de Parâmetros (multiplicador, pior destino, equilíbrio e
   entrada mínima sugerida) é `paramsResult`, em `results.ts`.

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

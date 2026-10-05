# ERP Ludus Equipamentos

Sistema comercial da Ludus Equipamentos (importação e venda de equipamentos de musculação), desenvolvido pela Ávila Ops Tecnologia.

## Documentação

- [Manual do sistema](docs/manual/README.md): uma página por funcionalidade, com passo a passo e prints. Versão navegável em [`docs/manual/index.html`](docs/manual/index.html).
- [Roadmap do desenvolvimento](docs/roadmap.md): fases, prazos, pagamentos e pendências.
- [Instruções do Copilot](.github/copilot-instructions.md): stack (PostgreSQL), arquitetura e regras de negócio.
- [Prompts por fase](docs/copilot/prompts.md): um prompt do Copilot para cada fase do roadmap.

## Como rodar

Requer Node 24, npm e um PostgreSQL ao alcance da máquina.

```bash
npm install
cp .env.example .env.local   # ajuste os valores (DATABASE_URL aponta para um banco vazio, só do ERP)
npm run db:migrate           # cria as tabelas e os parâmetros iniciais
npm run dev                  # http://localhost:3020
```

O login é o do **Auth central** (`auth.avilaops.com`). Depois de entrar, o Auth devolve sempre para o endereço cadastrado para o ERP, `https://erp.avilaops.com`, e nunca para `localhost`: o retorno é conferido pelo host, e o cookie de sessão só vale em `avilaops.com`. Por isso, abrindo por `localhost`, você só volta a ver o sistema se `erp.avilaops.com` estiver no ar e servindo este ERP.

Para ver as telas na própria máquina sem depender disso, descomente `ERP_LOCAL_LOGIN=1` no `.env.local`: `http://localhost:3020` passa a abrir o login local (`/dev/login`), com um usuário de teste por perfil. Ele não existe em produção.

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o sistema em desenvolvimento em `http://localhost:3020` (só atende em `127.0.0.1`). |
| `npm run build` | Gera a versão de produção. |
| `npm run start` | Serve a versão de produção (exige as variáveis do `.env.example`, com `SSO_JWT_SECRET` de 32+ caracteres e `APP_URL` em https). |
| `npm run lint` | Confere o código com o ESLint. |
| `npm run typecheck` | Confere os tipos do TypeScript. |
| `npm test` | Roda os testes automatizados (os de banco usam `ERP_TEST_DATABASE_URL`, de `.env.test.local`). |
| `npm run db:migrate` | Aplica as migrações pendentes de `db/migrations/` no banco de `DATABASE_URL`. Rodar de novo não muda nada. |

O login é feito pelo Auth central da Ávila Ops, e o perfil de cada pessoa (Diretoria, Gerente comercial, Vendedor ou Financeiro) é definido dentro do ERP. Em desenvolvimento, com `ERP_LOCAL_LOGIN=1` no `.env.local`, `/dev/login` entra com um usuário de teste por perfil. Detalhes e regras para quem mexe no código estão no [`AGENTS.md`](AGENTS.md).

## Contato

Ávila Ops Tecnologia · (17) 99781-1471 · avilaops.com

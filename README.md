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
cp .env.example .env.local   # depois edite o arquivo: veja abaixo
npm run db:migrate           # cria as tabelas e os parâmetros iniciais
npm run dev                  # http://localhost:3020
```

No `.env.local`, antes de subir:

1. **`DATABASE_URL`**: aponte para um banco PostgreSQL vazio, só do ERP. Sem ele as telas que leem dados dão erro.
2. **`ERP_LOCAL_LOGIN=1`**: tire o `#` da linha. Com ela, `http://localhost:3020` abre o login local (`/dev/login`), com um usuário de teste por perfil.

Sem o `ERP_LOCAL_LOGIN=1` o sistema manda para o login de produção (`auth.avilaops.com`), que **não volta para `localhost`**: ele só devolve para o endereço cadastrado para o ERP. O login local não existe em produção.

O sistema ainda não está publicado em nenhum endereço; hoje ele roda só na máquina de quem desenvolve.

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o sistema em desenvolvimento na porta 3020. |
| `npm run build` | Gera a versão de produção. |
| `npm run start` | Serve a versão de produção (exige as variáveis do `.env.example`, com `SSO_JWT_SECRET` de 32+ caracteres e `APP_URL` em https). |
| `npm run lint` | Confere o código com o ESLint. |
| `npm run typecheck` | Confere os tipos do TypeScript. |
| `npm test` | Roda os testes automatizados (os de banco usam `ERP_TEST_DATABASE_URL`, de `.env.test.local`). |
| `npm run db:migrate` | Aplica as migrações pendentes de `db/migrations/` no banco de `DATABASE_URL`. Rodar de novo não muda nada. |

O login é feito pelo Auth central da Ávila Ops, e o perfil de cada pessoa (Diretoria, Gerente comercial, Vendedor ou Financeiro) é definido dentro do ERP. Em desenvolvimento, com `ERP_LOCAL_LOGIN=1` no `.env.local`, `/dev/login` entra com um usuário de teste por perfil. Detalhes e regras para quem mexe no código estão no [`AGENTS.md`](AGENTS.md).

## Contato

Ávila Ops Tecnologia · (17) 99781-1471 · avilaops.com

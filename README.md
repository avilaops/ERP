# ERP Ludus Equipamentos

Sistema comercial da Ludus Equipamentos (importação e venda de equipamentos de musculação), desenvolvido pela Ávila Ops Tecnologia.

## Documentação

- [Manual do sistema](docs/manual/README.md): uma página por funcionalidade, com passo a passo e prints. Versão navegável em [`docs/manual/index.html`](docs/manual/index.html).
- [Roadmap do desenvolvimento](docs/roadmap.md): fases, prazos, pagamentos e pendências.

## Como rodar

Requer Node 24 e npm.

```bash
npm install
cp .env.example .env.local   # ajuste os valores
npm run dev                  # http://localhost:3020
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o sistema em desenvolvimento na porta 3020. |
| `npm run build` | Gera a versão de produção. |
| `npm run start` | Serve a versão de produção (exige as variáveis do `.env.example`, com `SSO_JWT_SECRET` de 32+ caracteres e `APP_URL` em https). |
| `npm run lint` | Confere o código com o ESLint. |
| `npm run typecheck` | Confere os tipos do TypeScript. |
| `npm test` | Roda os testes automatizados. |

O login é feito pelo Auth central da Ávila Ops, e o perfil de cada pessoa (Diretoria, Gerente comercial, Vendedor ou Financeiro) é definido dentro do ERP. Em desenvolvimento, com `ERP_LOCAL_LOGIN=1` no `.env.local`, `/dev/login` entra com um usuário de teste por perfil. Detalhes e regras para quem mexe no código estão no [`AGENTS.md`](AGENTS.md).

## Contato

Ávila Ops Tecnologia · (17) 99781-1471 · avilaops.com

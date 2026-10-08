# Operação do ERP Ludus

Como rodar, testar e o que falta para produção. Atualizado em 06/10/2026.

## Situação

| Ambiente | Situação |
| --- | --- |
| Desenvolvimento (servidor `creators` da Ávila Ops) | No ar sob demanda: `npm run dev`, bancos `erp` e `erp_test` no PostgreSQL do servidor |
| Integração contínua (GitHub Actions) | `.github/workflows/ci.yml`: lint, tipos, testes com banco e build, a cada push na `main` e em todo PR |
| Produção | **No ar em `https://erp.avilaops.com`**, no servidor `applications` (`178.105.82.48`), em `/opt/erp` (seção Produção) |

## Variáveis de ambiente

Todas descritas em `.env.example`. Nenhuma tem valor real no repositório.

| Variável | Para quê | Em produção |
| --- | --- | --- |
| `DATABASE_URL` | Banco PostgreSQL do ERP (a única conexão do sistema) | Obrigatória: sem ela o processo não sobe |
| `SSO_JWT_SECRET` | Segredo que confere o cookie do Auth central (`auth.avilaops.com`) | Obrigatória, 32 caracteres ou mais, diferente do valor de exemplo |
| `APP_URL` | Endereço público do sistema, usado na volta do login | Obrigatória e em `https` |
| `ERP_TENANTS` | As empresas do sistema (`identificador:Nome`, separadas por `;`). Cada uma tem um esquema próprio no banco | Obrigatória; entrada inválida impede a subida |
| `ERP_USERS` | Quem entra, com qual perfil e em qual empresa (`email:PERFIL@empresa`, separados por vírgula) | Obrigatória; entrada inválida impede a subida |
| `ERP_CERT_KEY` | Chave do cofre do certificado digital A1 (32 bytes em base64). Fica só no servidor; sem ela o envio do certificado é recusado e o resto do sistema segue | Opcional para subir; necessária para o Fiscal |
| `NFE_CA_FILE` | Arquivo PEM que substitui a raiz da ICP-Brasil embutida, para a conexão com a SEFAZ ao emitir nota. A verificação do servidor nunca é desligada | Opcional; sem ele vale a raiz v10 embutida (vence em 01/07/2032) |
| `ERP_LOCAL_LOGIN` | `1` liga o login local de teste (`/dev/login`) | Ignorada: o login local não existe em produção |
| `ERP_TEST_DATABASE_URL` | Banco dos testes; o nome tem de terminar em `_test` | Não se usa |

Falha fechada: em produção, faltando ou estando inválida qualquer uma das cinco primeiras, a
aplicação não sobe e nenhuma requisição é atendida (`src/instrumentation.ts`).

## Empresas (multi-empresa)

O sistema atende várias empresas no mesmo endereço. Cada empresa tem os seus dados num esquema
do PostgreSQL (`tenant_<identificador>`), com as mesmas tabelas; uma não enxerga a outra.

Para incluir uma empresa:

1. Acrescente-a em `ERP_TENANTS` (ex.: `ludus:Ludus Equipamentos;acme:Acme Fitness`).
2. Acrescente os usuários dela em `ERP_USERS` (`email:PERFIL@acme`).
3. Rode `npm run db:migrate`: ele cria o esquema e as tabelas da empresa nova e mantém as outras em dia.
4. A logo quem envia é a diretoria da empresa, em Parâmetros → Empresa (PNG, JPEG ou WebP, até 512 KB).
5. Reinicie a aplicação.

Todas as empresas usam o mesmo endereço, `erp.avilaops.com`: o que separa uma da outra é o login.

Quem pertence a mais de uma empresa escolhe em `/empresa` ("Trocar de empresa", no menu).

## Rodar localmente

Node 24 e npm.

```bash
npm install
docker compose up -d                 # PostgreSQL 16 em 127.0.0.1:5433, com os bancos erp e erp_test
cp .env.example .env.local           # ajuste DATABASE_URL para a porta 5433 e a senha erp-local
npm run db:migrate                   # cria o esquema de cada empresa de ERP_TENANTS e as tabelas
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

## Produção: `erp.avilaops.com` no servidor `applications`

O ERP roda em container no `applications` (`178.105.82.48`, o servidor onde já ficam o Auth
central e os demais sistemas da Ávila Ops), em `/opt/erp`, na porta `3140` só em `127.0.0.1`. Ele
usa o que o servidor já tem: o Caddy atende `erp.avilaops.com` e repassa para a porta; o banco é
o PostgreSQL do servidor (banco e role `erp`, um esquema por empresa); o backup é o
`/usr/local/bin/backup-todos-bancos.sh`, que já inclui o banco `erp`.

**Situação em 06/10/2026:** publicado com `bash deploy/subir.sh` (container `erp` saudável,
esquema `tenant_ludus` migrado, bloco no Caddy, banco no backup diário). O registro A `erp` da zona
`avilaops.com` no Cloudflare aponta para `178.105.82.48`, somente DNS (o valor anterior está em
`/opt/backups/dns-erp.avilaops.com-20261006-antes-applications.json`). `https://erp.avilaops.com`
responde, e o `SSO_JWT_SECRET` é o mesmo do Auth central (conferido por resumo, no servidor).

A primeira instalação, no `apps-noclient`, foi removida no mesmo dia (container, `/opt/erp`, bloco
do Caddy, banco, role e a linha do backup). O banco de lá estava vazio; ficou um dump final em
`/var/backups/erp-removido-20261006/` naquele servidor.

Quem entra hoje: só `nicolas@avilaops.com`, como Diretoria da Ludus. Os outros usuários entram em
`ERP_USERS`, no `/opt/erp/.env`, seguido de `docker compose up -d --force-recreate` em `/opt/erp`.

O `/etc/caddy/Caddyfile` do servidor foi editado direto, no lugar do comentário que marcava o
antigo ERP em Odoo (backup `Caddyfile.bak-20261006-082120-antes-erp-novo` ao lado). O roteiro de
backup original está em `/opt/backups/backup-todos-bancos.sh.bak-20261006-antes-erp`.

### Preparar o servidor (uma vez)

1. **Acesso:** a chave de quem publica autorizada no `applications` e um apelido `applications`
   em `~/.ssh/config`. O servidor `creators` já tem os dois (usuário `root`), desde 06/10/2026.
2. **Banco:** criar a role e o banco do ERP no PostgreSQL do servidor, aceitando conexão da
   rede do Docker (`172.17.0.0/16`), e incluir o banco no backup diário.
   ```sql
   CREATE ROLE erp LOGIN PASSWORD '<senha forte>';
   CREATE DATABASE erp OWNER erp ENCODING 'UTF8';
   REVOKE CONNECT ON DATABASE erp FROM PUBLIC;
   ```
3. **Variáveis:** `/opt/erp/.env`, modo `600`, a partir do `.env.example`:
   - `DATABASE_URL=postgresql://erp:<senha>@host.docker.internal:5432/erp`
   - `SSO_JWT_SECRET`: o mesmo do `auth.avilaops.com` (está no `.env` do Auth, no servidor)
   - `APP_URL=https://erp.avilaops.com`
   - `ERP_TENANTS="ludus:Ludus Equipamentos"`
   - `ERP_USERS`: os e-mails reais, como `email:PERFIL@ludus`
   - `ERP_CERT_KEY`: gerada no próprio servidor, uma por instalação
     (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Nunca vai
     para o repositório. Se for perdida ou trocada, o certificado guardado não abre mais: basta a
     diretoria enviar o certificado de novo em Parâmetros → Fiscal
   - sem `ERP_LOCAL_LOGIN` (em produção é ignorada de qualquer jeito)
4. **Caddy:** colar `deploy/Caddyfile.snippet` em `/etc/caddy/Caddyfile`, validar e recarregar.
5. **Cloudflare:** o registro A `erp` da zona `avilaops.com` aponta para `178.105.82.48`.
6. **Auth central:** o aplicativo `erp` já está cadastrado com `https://erp.avilaops.com`.

### Publicar

```bash
bash deploy/subir.sh
```

O script recusa publicar com alteração não commitada; roda lint, tipos e testes; faz o build;
envia o pacote; monta a imagem no servidor; **aplica as migrações de cada empresa antes de trocar
o container**; sobe; e só termina com sucesso se `/api/health` responder com a revisão enviada.
Se a migração falhar, a versão antiga continua no ar.

### Conferir depois de publicar

- `https://erp.avilaops.com/api/health` mostra a revisão no ar.
- Cada um dos quatro perfis entra pelo login central e vê só a sua parte.
- `https://erp.avilaops.com/dev/login` responde 404 (o login de teste não existe em produção).
- A diretoria envia a logo em Parâmetros → Empresa.

### O que ainda falta depois da primeira publicação

- Deploy automático pelo GitHub Actions (hoje é o script, à mão).
- Backup diário do banco `erp` de produção, com restauração testada.
- Usuários e empresas em tela, em vez de variável de ambiente.

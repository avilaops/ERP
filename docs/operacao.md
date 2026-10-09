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
| `ERP_SMTP_HOST`, `ERP_SMTP_PORT`, `ERP_SMTP_USER`, `ERP_SMTP_PASSWORD`, `ERP_MAIL_FROM` | Caixa de e-mail da Ávila Ops por onde saem o XML e o DANFE das notas de quem não cadastrou caixa própria. Porta 465 (TLS direto) quando `ERP_SMTP_PORT` falta; outra porta usa STARTTLS | Opcionais; sem as quatro (servidor, usuário, senha, remetente) a tela avisa que não há caixa de saída e nenhum e-mail é enviado |
| `ERP_AUTH_CLIENT_SECRET` (e, se não forem os padrões, `ERP_AUTH_CLIENT_ID` = `erp` e `ERP_AUTH_URL` = `https://auth.avilaops.com`) | Credencial do ERP como integração do login central (`auth.avilaops.com/admin/integracoes`, app ERP). Com ela, "Convidar pessoa" cria a conta da pessoa no login central e manda por e-mail o endereço para ela criar a senha (vale 7 dias, só para conta nova) | Opcional; sem ela a pessoa é cadastrada, nenhum e-mail sai e a tela diz que o convite não foi enviado |
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
- O banco `erp` de desenvolvimento (servidor `creators`) **não tem backup**, de propósito: só tem
  dado de teste. O de produção tem; ver "Backup e restauração".

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

## Backup e restauração

- **Onde**: o banco `erp` de produção (servidor `applications`) entra no
  `/usr/local/bin/backup-todos-bancos.sh`, todo dia às 03:30 UTC. O arquivo é
  `/opt/backups/db/host-erp-AAAAMMDD.sql.gz` (texto, `pg_dump`), guardado 7 dias no servidor.
- **Conferência**: o próprio script só dá nome final ao dump depois de `gzip -t`, tamanho e marcador
  de fim; a rodada grava `saida=N` em `/var/log/backup-bancos.log`, e o vigia de saúde do
  `creators` abre tarefa se a saída não for 0 ou se passar de 26 h sem rodada.
- **Fora do servidor**: `sync-r2.sh` copia `/opt/backups/db` para `r2:avilaops-backups/db/`, sem
  expiração.
- **O dump das 03:30 não tem o que entrou depois**: antes de carga ou exclusão em produção, faça um
  dump na hora (`pg_dump -Fc -f /opt/backups/erp-antes-<motivo>-<data>.dump`), como nas cargas de
  08/10/2026.
- **Restaurar** (num banco vazio; a role `erp` precisa existir para os donos ficarem certos):
  `createdb -O erp erp_novo && zcat host-erp-AAAAMMDD.sql.gz | psql -d erp_novo`, conferir
  `SELECT max(name) FROM tenant_<empresa>.schema_migrations` e as contagens, apontar o
  `DATABASE_URL` de `/opt/erp/.env` para ele e recriar o contêiner. As fotos dos equipamentos, o
  logo e o certificado cifrado vão no dump; a chave `ERP_CERT_KEY` não vai: ela só existe no
  `.env` e, sem ela, o certificado e a senha da caixa de e-mail guardados não abrem.
- **Teste de restauração de 08/10/2026**: o dump `host-erp-20261008.sql.gz` (16 MB, mesmo SHA-256
  na origem e no destino) foi restaurado num banco temporário no `apps-noclient` (PostgreSQL 18.6):
  32 tabelas em `tenant_ludus`, migrações até a `0017`, 95 equipamentos, 94 fotos (7 MB), 119 itens
  do catálogo do fornecedor — o estado da madrugada, antes das migrações do dia. Os únicos erros
  foram os 33 `role "erp" does not exist`, esperados num servidor sem a role. Banco temporário e
  arquivo apagados. No R2 estão os dumps de 06, 07 e 08/10 com o mesmo tamanho dos locais.

## Contrato do pedido com assinatura eletrônica

- **O que é**: depois de fechado, o pedido ganha o cartão "Contrato". O contrato sai do modelo de Parâmetros → Contrato (texto com campos entre chaves), vira PDF e vai para o cliente por e-mail, com um link. O cliente assina com nome, CPF e um código de 6 números enviado ao mesmo e-mail. Vendedor, gerente e diretoria assinam pela própria conta, no cartão.
- **Endereço público**: `/contrato/<empresa>/<segredo>` é a única tela do ERP sem login. O segredo tem 32 bytes aleatórios e o banco guarda só o SHA-256 dele; endereço errado, de outra empresa ou de contrato cancelado dá a mesma resposta ("não vale mais"). Depende de `APP_URL` certo no servidor: é ele que vai no e-mail.
- **Limites**: link vale os dias do modelo (padrão 7); código vale 15 minutos, 5 tentativas, um a cada minuto, 10 por contrato. "Enviar o link de novo" troca o segredo e zera esses contadores.
- **O que fica guardado** (`order_contracts`, `order_contract_signatures`, `order_contract_events`): o texto e o PDF como saíram, a impressão digital (SHA-256) do PDF, e cada passo com data, hora e IP. O PDF baixado é o original mais a folha "Registro de assinaturas eletrônicas", montada na hora.
- **IP**: é o último valor de `X-Forwarded-For`, o que o Caddy escreve. Se o ERP passar a ficar atrás de outro proxy (Cloudflare com nuvem laranja, por exemplo), o IP gravado passa a ser o do proxy: rever `clientIp` em `src/lib/contract/public.ts`.
- **E-mail**: sai pela mesma caixa das notas (a da empresa ou a da Ávila Ops). Sem caixa, o contrato não é enviado e a tela diz por quê.
- **Pedido reaberto**: contrato aguardando assinatura é cancelado junto; contrato assinado fica, e impede a exclusão do pedido.
- **Modelo a partir do Word**: em Parâmetros → Contrato, "Já tem o contrato em Word?" lê um `.docx` (ou `.txt`, até 2 MB) e põe o texto no modelo. Só o texto vem: títulos viram `# `, listas viram `- `, negrito, fontes e imagens ficam para trás. `.doc` antigo e PDF são recusados com a explicação. Os campos entre chaves são marcados à mão depois.
- **PDF próprio no pedido**: no cartão Contrato, "Enviar um PDF próprio em vez do modelo" manda para assinatura o arquivo da empresa (até 6 MB, sem senha), guardado byte a byte (`order_contracts.uploaded`, `file_name`). O sistema não preenche nada nele: só junta a folha de registro. O cliente vê o botão "Abrir o contrato (PDF)" em vez do texto.
- **Limite jurídico**: é assinatura eletrônica entre particulares (MP 2.200-2/2001, art. 10, § 2º), atestada pelo sistema de quem vende. Não é assinatura com certificado ICP-Brasil. O texto padrão não tem cláusulas comerciais: são da empresa, com o advogado dela.

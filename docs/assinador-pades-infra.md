# Onde roda o assinador PAdES

Proposta. Não há deploy neste documento. Nenhum serviço foi publicado.

## Decisão sobre o DSS da Comissão Europeia

O DSS (https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/Digital+Signature+Service+-+DSS)
é um assinador Java da Comissão Europeia. O código abaixo foi lido no
`master` de https://github.com/esig/dss em 2026-10-22.

Ele consegue o perfil pedido, com a API pública, sem alterar o projeto:

- `PAdESSignatureParameters.setFilter` e `setSubFilter` são `String`. O padrão
  é Filter `Adobe.PPKLite` e SubFilter `ETSI.CAdES.detached`. O mesmo
  `setSubFilter` que aceita `adbe.pkcs7.detached` aceita `PBAD.PAdES`.
  `setFilter("PBAD_PAdES")` troca o Filter. Fonte:
  `dss-pades/.../PAdESSignatureParameters.java`.
- O CMS não muda de construtor por causa do SubFilter.
  `CMSForPAdESBuilderHelper.initCAdESProfile` devolve sempre
  `PAdESLevelBaselineB`. `isCAdESDetached` só decide se o PDF ganha a extensão
  de desenvolvedor ESIC. `PBAD.PAdES` não entra em `hasPKCS7SubFilter`, que
  compara só com `adbe.pkcs7.detached` e `adbe.pkcs7.sha1`.
- `PAdESLevelBaselineB.addSigningTimeAttribute` está vazio, com o comentário
  da ETSI TS 102 778-3, cláusula 4.5.3. O CMS do nível B não leva
  `signingTime`. A data vai para a entrada `/M` do dicionário PDF.
- Com SHA-256, `CAdESUtils.addSigningCertificateAttribute` grava
  `id-aa-signingCertificateV2`. O algoritmo dentro do `ESSCertIDv2` fica
  ausente: no DSS, SHA-256 é o default do RFC 5035. Com SHA-1 o atributo
  seria o v1, que este perfil não usa.
- `CAdESLevelBaselineB.addSignaturePolicyId` grava `id-aa-ets-sigPolicyId`
  com o OID, o algoritmo, o hash que o chamador passou e, se houver
  `Policy.setSpuri`, um qualificador `id-spq-ets-uri`. O DSS não calcula o
  hash interno da PA. Quem chama passa os bytes do OCTET STRING final da PA
  (DOC-ICP-15.03, nota 2), não o hash do arquivo.

O nível `PAdES_BASELINE_LT` não serve para a PA AD-RB vigente.
`PAdESLevelBaselineLT` estende `PAdESLevelBaselineT` e, ao subir o nível,
embute `signature-time-stamp`. A PA AD-RB diz que carimbo não é usado, e este
ERP recusa esse atributo. CRL e OCSP sem carimbo saem de outra chamada, já
pública: `PDFSignatureService.addDssDictionary` sobre o PDF do nível B, com
`setIncludeVRIDictionary(true)`. O padrão do VRI no DSS é falso.

Esta entrega continua no PKIjs (`scripts/pades-signer.ts`). O motivo não é
SubFilter travado. É que usar o DSS aqui seria um processo Java novo, com
PDFBox, num CI que só tem Node. Isso não foi feito, e nenhum PDF do DSS foi
levado ao VALIDAR/ITI.

## Onde

| Máquina | Por que não, ou por que sim |
| --- | --- |
| `applications` | Já roda o ERP, o banco e o site. A chave de assinatura não fica no mesmo container do ERP. |
| `orchestrator` | Plano de controle. Não assina PDF de cliente. |
| `apps-noclient` | É aqui. Já hospedou o ERP e hoje não tem esse processo. O assinador escuta só na rede privada. O ERP, em `applications`, chama por HTTPS. |

Nada disso foi instalado. A instalação antiga do ERP nessa máquina não é reativada.

## Porta

O Dockerfile não tem `EXPOSE`. O `compose.yaml` do assinador não tem `ports`.
Nada é publicado em `0.0.0.0` nem em `127.0.0.1` do anfitrião.

Dentro do container o processo escuta `ERP_PADES_BIND=0.0.0.0` na porta
`ERP_PADES_SIGNER_PORT` (8443). Esse endereço é a interface do container, para
outro container da mesma rede alcançar o nome `pades-signer`. Não é a
interface do servidor. O healthcheck fala com `127.0.0.1` dentro do container.

## Token e TLS

O assinador aceita os dois por ambiente e por arquivo montado. Nada disso entra
na imagem.

| O quê | Onde |
| --- | --- |
| Token | variável `ERP_PADES_SIGNER_TOKEN` (mínimo 16 caracteres). O compose interpola `${ERP_PADES_SIGNER_TOKEN}` do ambiente de quem sobe. Não há arquivo de token. |
| Certificado TLS | arquivo montado. `ERP_PADES_TLS_CERT=/tls/cert.pem` e `ERP_PADES_TLS_KEY=/tls/key.pem`. Volume `./tls:/tls:ro`. |
| CA do healthcheck | arquivo montado. `NODE_EXTRA_CA_CERTS=/tls/ca.pem`. |
| Nome no certificado TLS | `ERP_PADES_TLS_NAME`. O healthcheck usa esse nome ao falar com `127.0.0.1`. O padrão é `localhost`. |
| Senha da chave A1, se o PEM estiver cifrado | `ERP_PADES_KEY_PASSWORD`. Vazia quando `key.pem` não contém `ENCRYPTED`. |

O ERP, do outro lado:

| O quê | Onde |
| --- | --- |
| URL | `ERP_PADES_SIGNER_URL`, obrigatoriamente `https`, sem usuário nem senha na URL. Homologação: `https://pades-signer:8443/assinar`. |
| Token | o mesmo `ERP_PADES_SIGNER_TOKEN`, no cabeçalho `Authorization: Bearer`. |
| CA | `ERP_PADES_TLS_CA` é o PEM da CA, o texto, não um caminho. Sem ela, o Node usa as CAs públicas. |
| Nome esperado no certificado | `ERP_PADES_TLS_SERVERNAME`. Tem de ser um nome que esteja no certificado TLS do assinador. |
| Prazo | `ERP_PADES_SIGNER_TIMEOUT_MS`, opcional. Padrão 20000. Inteiro de 100 a 60000. |

mTLS no proxy continua sendo o endurecimento na hora de publicar para fora
desta rede. O código autentica com token sobre TLS.

## Certificado A1

São duas cópias do mesmo certificado. A impressão SHA-256 tem de ser a mesma.
O PFX e a senha do PFX não vão ao assinador e não entram no Git.

No assinador, a chave privada fica no disco, um diretório por empresa
(`ERP_PADES_KEY_DIR/<slug>/`, no compose `/chaves/<slug>/`):

- `cert.pem` — certificado do signatário
- `chain.pem` — intermediárias e raiz
- `key.pem` — chave privada, PKCS#8
- `crl.der` ou `ocsp.der` — pelo menos uma evidência oficial de revogação é obrigatória; sem ambas o diretório é ignorado

O slug tem de casar com `^[a-z][a-z0-9_]{1,30}$`. A busca é
`<slug>:<sha256 do DER de cert.pem>`. A chave de uma empresa não assina PDF
de outra. Se o corpo do `POST /assinar` trouxer `pfx`, `password` ou
`privateKeyPem`, a resposta é 400 `segredo-recusado`.

No ERP, o A1 entra pela tela de parâmetros fiscais. O arquivo e a senha são
cifrados com AES-256-GCM pela chave `ERP_CERT_KEY` (32 bytes em base64) e
gravados no esquema `tenant_<slug>`, tabela `fiscal_certificates`:

- `ciphertext`, `iv`, `auth_tag` — PFX e senha cifrados
- `subject`, `holder_cnpj`, `valid_from`, `valid_until`
- `fingerprint` — SHA-256 do certificado, 64 hex minúsculos
- `uploaded_at`, `uploaded_by`

O contrato não abre esse PFX. Lê `fingerprint`, `subject`, `valid_from` e
`valid_until` e manda ao assinador o slug, a impressão, o PDF, o motivo e a
data. Se o certificado vence em 30 dias ou menos, o processo escreve um aviso
com a impressão e a data, sem a chave. O PDF selado volta e fica em
`tenant_<slug>.order_contracts.sealed_pdf`. O evento `assinado` fica em
`tenant_<slug>.order_contract_events`.

## Variáveis mínimas do ERP na homologação

Para o processo subir com `NODE_ENV=production`:

- `DATABASE_URL` — `postgresql://…` do banco desta homologação
- `SSO_JWT_SECRET` — 32 caracteres ou mais, diferente do exemplo
- `APP_URL` — `https`, sem barra no fim
- `ERP_TENANTS` — `slug:Nome`, separado por ponto e vírgula se houver mais de uma
- `ERP_USERS` — `email:PERFIL@slug`

Para concluir um contrato assinado, além dessas:

- `ERP_CERT_KEY` — a mesma chave que cifrou o A1 desta instalação
- `ERP_PADES_SIGNER_URL`
- `ERP_PADES_SIGNER_TOKEN`
- `ERP_PADES_TLS_CA`
- `ERP_PADES_TLS_SERVERNAME`

Para enviar o link do contrato, a caixa de e-mail: `ERP_SMTP_HOST`,
`ERP_SMTP_USER`, `ERP_SMTP_PASSWORD`, `ERP_MAIL_FROM`. Sem caixa, o envio do
link recusa. A conclusão da assinatura já gravada não depende desse envio: se
o e-mail da cópia falhar, o contrato permanece assinado.

`ERP_TEST_DATABASE_URL` é só da suíte automatizada. A homologação usa
`DATABASE_URL`.

## Migrações

`npm run db:migrate` (no pacote, `node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/db-migrate.ts`)
aplica, em cada esquema `tenant_<slug>` de `ERP_TENANTS`, todo arquivo de
`db/migrations/` que ainda não está em `schema_migrations`. Banco novo precisa
da sequência inteira, de `0001_parametros_e_produtos.sql` até
`0079_pdf_selado_do_contrato.sql`. Banco que já está em `0078` precisa só da
`0079`.

A `0079` acrescenta `order_contracts.sealed_pdf` (bytea, nulo, entre 100 e
12000000 bytes). Sem ela, a assinatura válida não é gravada. Não há restrição
que exija o PDF selado nos contratos já assinados antes desta coluna.

## Saúde, prazo, log, monitoramento, volta atrás

- `GET /health` responde `{"status":"ok"}`. Não leva token, nome de empresa nem caminho de chave.
- O pedido de assinatura corta em 15 s no assinador. O ERP espera `ERP_PADES_SIGNER_TIMEOUT_MS` (padrão 20 s, entre 100 ms e 60 s).
- Log: `assinatura tenant=… certificado=… resultado=…`. Resultado é uma palavra (`assinado`, `recusado-tenant`, `recusado-revogado`, `falha`). Não entra PDF, token, PEM, senha nem corpo do pedido.
- Monitorar: o health, a taxa de `falha` e de `recusado-revogado`, e o prazo do certificado (o aviso dos 30 dias). Alerta se o health cair ou se o certificado estiver a menos de 30 dias do fim.
- Volta atrás: parar o container do assinador. O ERP passa a recusar a conclusão e não grava contrato assinado. PDF já selado continua no banco. Não se apaga contrato selado para "desfazer". A imagem do ERP volta junto com a do assinador, senão um ERP novo fala com um assinador velho.

## Imagem

`deploy/pades-signer/Dockerfile` e `deploy/pades-signer/compose.yaml`. A imagem é
construída no GitHub Actions e publicada com o SHA integral do commit em
`ghcr.io/avilaops/erp-pades-signer:<sha>`. O servidor apenas baixa essa imagem;
não compila o código.
A imagem não contém chave, token nem certificado TLS. Os volumes `./tls` e
`./chaves` são só leitura. Não foi executado contra servidor nenhum.

A imagem do ERP continua sendo a da raiz, que recebe o `standalone.tgz` já
construído. Este servidor não builda o Next.

## Compose de homologação

Sugestão para o apps-noclient. Não foi executada. O assinador e o banco não
publicam porta. O ERP publica só em `127.0.0.1:3140`, no mesmo desenho do
servidor de produção, para um túnel. Quem coloca o nome público na frente fica
fora deste arquivo.

O certificado TLS do assinador precisa ter o nome usado em
`ERP_PADES_TLS_SERVERNAME` (aqui, `pades-signer`). A rede não é `internal: true`:
o ERP ainda fala com o login e com o correio. O que fica fechado é a porta do
assinador.

```yaml
# Sugestão. Não sobe sozinha. Segredos vêm do ambiente de quem executa.
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: erp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: erp_homolog
    volumes:
      - homolog-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U erp -d erp_homolog"]
      interval: 5s
      timeout: 5s
      retries: 10

  pades-signer:
    image: ghcr.io/avilaops/erp-pades-signer:${ERP_PADES_IMAGE_TAG:?informe o SHA aprovado}
    environment:
      ERP_PADES_BIND: 0.0.0.0
      ERP_PADES_SIGNER_PORT: "8443"
      ERP_PADES_SIGNER_TOKEN: ${ERP_PADES_SIGNER_TOKEN}
      ERP_PADES_TLS_CERT: /tls/cert.pem
      ERP_PADES_TLS_KEY: /tls/key.pem
      ERP_PADES_KEY_DIR: /chaves
      ERP_PADES_KEY_PASSWORD: ${ERP_PADES_KEY_PASSWORD:-}
      NODE_EXTRA_CA_CERTS: /tls/ca.pem
      ERP_PADES_TLS_NAME: pades-signer
    volumes:
      - ./tls:/tls:ro
      - ./chaves:/chaves:ro
    read_only: true
    tmpfs: [/tmp]

  migrate:
    image: erp:homologacao
    environment:
      DATABASE_URL: postgresql://erp:${POSTGRES_PASSWORD}@postgres:5432/erp_homolog
      ERP_TENANTS: ${ERP_TENANTS}
    command: ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "scripts/db-migrate.ts"]
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  erp:
    image: erp:homologacao
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://erp:${POSTGRES_PASSWORD}@postgres:5432/erp_homolog
      SSO_JWT_SECRET: ${SSO_JWT_SECRET}
      APP_URL: ${APP_URL}
      ERP_TENANTS: ${ERP_TENANTS}
      ERP_USERS: ${ERP_USERS}
      ERP_CERT_KEY: ${ERP_CERT_KEY}
      ERP_PADES_SIGNER_URL: https://pades-signer:8443/assinar
      ERP_PADES_SIGNER_TOKEN: ${ERP_PADES_SIGNER_TOKEN}
      ERP_PADES_TLS_CA: ${ERP_PADES_TLS_CA}
      ERP_PADES_TLS_SERVERNAME: pades-signer
      ERP_SMTP_HOST: ${ERP_SMTP_HOST:-}
      ERP_SMTP_USER: ${ERP_SMTP_USER:-}
      ERP_SMTP_PASSWORD: ${ERP_SMTP_PASSWORD:-}
      ERP_MAIL_FROM: ${ERP_MAIL_FROM:-}
    ports:
      - "127.0.0.1:3140:3140"
    depends_on:
      migrate:
        condition: service_completed_successfully
      pades-signer:
        condition: service_started

volumes:
  homolog-postgres:
```

`ERP_PADES_TLS_CA` nesse arquivo é o PEM, porque o cliente do ERP lê o texto
da variável (`src/lib/contract/pades-provider.ts`). O arquivo `tls/ca.pem`
montado no assinador serve ao healthcheck; o mesmo PEM precisa estar na
variável do ERP.

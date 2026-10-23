# Processo do assinador PAdES. Não leva chave, senha nem PFX.
# O build de produção do ERP continua sendo o Dockerfile da raiz.
FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/pades-signer.ts scripts/register.mjs scripts/loader.mjs ./scripts/

ENV NODE_ENV=production
USER node

# Sem EXPOSE: `docker run -P` publicaria a porta em 0.0.0.0. O healthcheck
# fala com o loopback e confere o certificado pelo nome em
# ERP_PADES_TLS_NAME (padrão localhost). A CA está em NODE_EXTRA_CA_CERTS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node --input-type=module -e "import { readFileSync } from 'node:fs'; import { request } from 'node:https'; const ca = process.env.NODE_EXTRA_CA_CERTS ? readFileSync(process.env.NODE_EXTRA_CA_CERTS) : undefined; const req = request({ hostname: '127.0.0.1', port: 8443, path: '/health', method: 'GET', ca, servername: process.env.ERP_PADES_TLS_NAME || 'localhost', rejectUnauthorized: true }, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--import", "./scripts/register.mjs", "scripts/pades-signer.ts"]

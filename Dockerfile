# Imagem de RUNTIME. O build do Next (standalone) é feito fora do servidor de produção
# e chega pronto em standalone.tgz: o servidor não tem memória para buildar.
# Fluxo completo em deploy/subir.sh e docs/operacao.md.
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3140 HOSTNAME=0.0.0.0
WORKDIR /app
ADD standalone.tgz /app/
ARG GIT_SHA=dev
ARG BUILT_AT=
ENV GIT_SHA=$GIT_SHA BUILT_AT=$BUILT_AT
USER node
EXPOSE 3140
CMD ["node", "server.js"]

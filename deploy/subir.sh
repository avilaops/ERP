#!/usr/bin/env bash
# Publica o ERP no apps-noclient: build local → standalone.tgz → /opt/erp →
# imagem de runtime → migração de cada empresa → docker compose up → conferência.
# Só sai 0 se /api/health responder com a revisão enviada.
#
# Uso: bash deploy/subir.sh
# Pré-requisitos (uma vez, ver docs/operacao.md): acesso por SSH ao servidor,
# /opt/erp/.env preenchido, banco e bloco do Caddy criados.
set -euo pipefail
SERVIDOR="${SERVIDOR:-apps-noclient}"
PASTA="/opt/erp"
PORTA=3140
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "! Há alteração não commitada. Commite antes de subir:"; git status --short; exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"
AGORA="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=== ERP → $SERVIDOR ($COMMIT) ==="

PACOTE="$(mktemp -d)/standalone.tgz"
bash deploy/empacotar.sh "$PACOTE"

echo "▸ enviando"
ssh "$SERVIDOR" "mkdir -p $PASTA && [ -f $PASTA/.env ] || { echo '! falta $PASTA/.env (copie .env.example e preencha)'; exit 1; }"
ssh "$SERVIDOR" "cat > $PASTA/standalone.tgz" < "$PACOTE"
scp -q Dockerfile "$SERVIDOR:$PASTA/Dockerfile"
scp -q deploy/docker-compose.yml "$SERVIDOR:$PASTA/docker-compose.yml"

echo "▸ imagem, migração e subida"
ssh "$SERVIDOR" "bash -s" <<REMOTO
set -euo pipefail
cd $PASTA
GIT_SHA=$COMMIT BUILT_AT=$AGORA docker compose build -q
# Migração antes de trocar o container: cria o esquema de cada empresa de
# ERP_TENANTS e aplica o que falta. Falha aqui aborta o deploy com a versão antiga no ar.
docker compose run --rm --no-deps -T erp \
  node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/db-migrate.ts
GIT_SHA=$COMMIT BUILT_AT=$AGORA docker compose up -d --force-recreate
docker image prune -f >/dev/null
REMOTO

echo "▸ conferindo"
for i in $(seq 1 25); do
  SAUDE=$(ssh "$SERVIDOR" "curl -sf -m 5 http://127.0.0.1:$PORTA/api/health" 2>/dev/null || true)
  if echo "$SAUDE" | grep -q "\"commit\":\"$COMMIT\""; then echo "· no ar: $SAUDE"; exit 0; fi
  sleep 3
done
echo "! não respondeu com a revisão $COMMIT em 75s"
ssh "$SERVIDOR" "cd $PASTA && docker compose logs --tail 40"
exit 1

#!/usr/bin/env bash
# Publica o ERP no servidor applications: conferência local (lint, tipos, testes) →
# build no servidor de build (apps-noclient, para não pesar no creators) → standalone.tgz → /opt/erp →
# imagem de runtime → migração de cada empresa → docker compose up → conferência.
# Só sai 0 se /api/health responder com a revisão enviada.
#
# Uso: bash deploy/subir.sh            (BUILD_HOST=local faz o build nesta máquina)
# Pré-requisitos (uma vez, ver docs/operacao.md): acesso por SSH ao servidor,
# /opt/erp/.env preenchido, banco e bloco do Caddy criados.
set -euo pipefail
SERVIDOR="${SERVIDOR:-applications}"
# Onde o `next build` roda. Pedido do Nicolas (2026-10-08): no apps-noclient, não no creators.
BUILD_HOST="${BUILD_HOST:-apps-noclient}"
BUILD_DIR="/opt/build/erp"
PASTA="/opt/erp"
PORTA=3140
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "! Há alteração não commitada. Commite antes de subir:"; git status --short; exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"
AGORA="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=== ERP → $SERVIDOR ($COMMIT) ==="

ssh "$SERVIDOR" "mkdir -p $PASTA && [ -f $PASTA/.env ] || { echo '! falta $PASTA/.env (copie .env.example e preencha)'; exit 1; }"
if [ "$BUILD_HOST" = "local" ]; then
  PACOTE="$(mktemp -d)/standalone.tgz"
  bash deploy/empacotar.sh "$PACOTE"
  echo "▸ enviando"
  ssh "$SERVIDOR" "cat > $PASTA/standalone.tgz" < "$PACOTE"
else
  ETAPA=conferir bash deploy/empacotar.sh
  echo "▸ build em $BUILD_HOST"
  # Só o que está commitado vai: nenhum .env, nada de rascunho. O node_modules de lá é reaproveitado
  # enquanto o package-lock for o mesmo.
  ssh "$BUILD_HOST" "mkdir -p $BUILD_DIR/work && cd $BUILD_DIR/work && find . -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +"
  git archive HEAD | ssh "$BUILD_HOST" "tar -x -C $BUILD_DIR/work"
  ssh "$BUILD_HOST" "bash -s" <<REMOTO
set -euo pipefail
cd $BUILD_DIR/work
if ! sha256sum -c ../lock.sha256 >/dev/null 2>&1 || [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null
  sha256sum package-lock.json > ../lock.sha256
fi
ETAPA=montar bash deploy/empacotar.sh $BUILD_DIR/standalone.tgz
REMOTO
  echo "▸ enviando"
  ssh "$BUILD_HOST" "cat $BUILD_DIR/standalone.tgz" | ssh "$SERVIDOR" "cat > $PASTA/standalone.tgz"
fi
scp -q Dockerfile "$SERVIDOR:$PASTA/Dockerfile"
scp -q deploy/docker-compose.yml "$SERVIDOR:$PASTA/docker-compose.yml"

echo "▸ imagem, migração e subida"
ssh "$SERVIDOR" "bash -s" <<REMOTO
set -euo pipefail
cd $PASTA
GIT_SHA=$COMMIT BUILT_AT=$AGORA docker compose build -q
# Migração antes de trocar o container: cria o esquema de cada empresa de
# ERP_TENANTS e aplica o que falta. Falha aqui aborta o deploy com a versão antiga no ar.
# </dev/null: sem isso o "compose run" lê a entrada padrão e engole o resto deste
# roteiro, e o "compose up" logo abaixo nunca roda. (Sem crases aqui: este trecho
# é interpretado pelo shell local antes de ir para o servidor.)
docker compose run --rm --no-deps -T erp \
  node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/db-migrate.ts </dev/null
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

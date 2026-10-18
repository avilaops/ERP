#!/usr/bin/env bash
# Publica o ERP no servidor applications: conferência local (lint, tipos, testes) →
# build no servidor de build (apps-noclient, para não pesar no creators) → standalone.tgz → /opt/erp →
# imagem de runtime → migração de cada empresa → docker compose up → conferência.
# Só sai 0 se /api/health responder com a revisão enviada.
#
# Uso: bash deploy/subir.sh
#      PACOTE_PRONTO=/caminho/standalone.tgz bash deploy/subir.sh
# O segundo modo publica o artefato produzido pelo GitHub e não executa build.
# Pré-requisitos (uma vez, ver docs/operacao.md): acesso por SSH ao servidor,
# /opt/erp/.env preenchido, banco e bloco do Caddy criados.
set -euo pipefail
SERVIDOR="${SERVIDOR:-applications}"
# Onde o `next build` roda. Pedido do Nicolas (2026-10-08): no apps-noclient, não no creators.
BUILD_HOST="${BUILD_HOST:-apps-noclient}"
PACOTE_PRONTO="${PACOTE_PRONTO:-}"
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
if [ -n "$PACOTE_PRONTO" ]; then
  [ -f "$PACOTE_PRONTO" ] || { echo "! pacote do GitHub não encontrado: $PACOTE_PRONTO"; exit 1; }
  gzip -t "$PACOTE_PRONTO"
  [ "$(tar -tzf "$PACOTE_PRONTO" | grep -cxF './server.js' || true)" = "1" ] \
    || { echo "! pacote do GitHub sem server.js"; exit 1; }
  echo "▸ enviando pacote aprovado pelo GitHub"
  ssh "$SERVIDOR" "cat > $PASTA/standalone.tgz" < "$PACOTE_PRONTO"
elif [ "$BUILD_HOST" = "local" ]; then
  # A pasta temporária sai no fim, com sucesso ou não: cada publicação deixava 14 MB em /tmp.
  TEMPORARIA="$(mktemp -d)"
  trap 'rm -rf "$TEMPORARIA"' EXIT
  PACOTE="$TEMPORARIA/standalone.tgz"
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

echo "▸ backup anterior às migrações"
BACKUP="/opt/backups/erp-antes-deploy-$COMMIT-$(date -u +%Y%m%dT%H%M%SZ).dump"
ssh "$SERVIDOR" "bash -s" <<REMOTO
set -euo pipefail
PARCIAL="$BACKUP.parcial"
rm -f "\$PARCIAL"
sudo -u postgres pg_dump -Fc -f "\$PARCIAL" erp
test -s "\$PARCIAL"
sudo -u postgres pg_restore -l "\$PARCIAL" >/dev/null
mv "\$PARCIAL" "$BACKUP"
chmod 640 "$BACKUP"
echo "· $BACKUP"
REMOTO

echo "▸ imagem, migração e subida"
ssh "$SERVIDOR" "bash -s" <<REMOTO
set -euo pipefail
cd $PASTA
GIT_SHA=$COMMIT BUILT_AT=$AGORA docker compose build -q
# O worker antigo para antes da migração. Assim ele não pode capturar um job
# legado no intervalo entre o backfill e a troca do container. Se a migração
# falhar, o trap religa exatamente o container antigo.
docker compose stop erp
MIGROU=0
trap 'if [ "\$MIGROU" -eq 0 ]; then docker compose start erp; fi' EXIT
# Cria o esquema de cada empresa de ERP_TENANTS e aplica o que falta.
# </dev/null: sem isso o "compose run" lê a entrada padrão e engole o resto deste
# roteiro, e o "compose up" logo abaixo nunca roda. (Sem crases aqui: este trecho
# é interpretado pelo shell local antes de ir para o servidor.)
docker compose run --rm --no-deps -T erp \
  node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/db-migrate.ts </dev/null
MIGROU=1
GIT_SHA=$COMMIT BUILT_AT=$AGORA docker compose up -d --force-recreate
trap - EXIT
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

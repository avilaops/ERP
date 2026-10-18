#!/usr/bin/env bash
# Baixa o pacote da execução verde do commit atual em main e o publica. O build
# acontece somente no GitHub Actions; esta máquina apenas orquestra o envio.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${REPO:-avilaops/ERP}"
HEAD="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"

[ "$BRANCH" = "main" ] || { echo "! a publicação exige o branch main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "! há alterações locais; não vou publicar outra árvore"; git status --short; exit 1; }
[ "$(git rev-parse origin/main)" = "$HEAD" ] || { echo "! main local não corresponde a origin/main"; exit 1; }

RUN_ID="$(gh run list --repo "$REPO" --workflow CI --branch main --commit "$HEAD" --event push --limit 5 \
  --json databaseId,status,conclusion,headSha \
  --jq 'map(select(.headSha == "'"$HEAD"'" and .status == "completed" and .conclusion == "success"))[0].databaseId // empty')"
[ -n "$RUN_ID" ] || { echo "! não há CI verde de main para $HEAD"; exit 1; }

TEMPORARIA="$(mktemp -d)"
trap 'rm -rf "$TEMPORARIA"' EXIT
echo "▸ baixando artefato da execução $RUN_ID"
gh run download "$RUN_ID" --repo "$REPO" --name "erp-production-$HEAD" --dir "$TEMPORARIA"

PACOTE="$TEMPORARIA/standalone.tgz"
[ -f "$PACOTE" ] || { echo "! o artefato não contém standalone.tgz"; exit 1; }
PACOTE_PRONTO="$PACOTE" bash deploy/subir.sh

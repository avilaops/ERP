#!/usr/bin/env bash
# Garante que o runtime foi produzido exatamente pelo commit que será publicado.
set -euo pipefail

PACOTE="${1:-}"
COMMIT_ESPERADO="${2:-}"

[ -f "$PACOTE" ] || { echo "! pacote não encontrado: $PACOTE" >&2; exit 1; }
[[ "$COMMIT_ESPERADO" =~ ^[0-9a-f]{40}$ ]] \
  || { echo "! commit esperado inválido" >&2; exit 1; }

gzip -t "$PACOTE"
LISTA="$(tar -tzf "$PACOTE")"
conta() { printf '%s\n' "$LISTA" | grep -cxF "$1" || true; }

[ "$(conta './server.js')" = "1" ] \
  || { echo "! pacote sem server.js único" >&2; exit 1; }
[ "$(conta './.erp-source-sha')" = "1" ] \
  || { echo "! pacote sem identidade do commit única" >&2; exit 1; }

COMMIT_DO_PACOTE="$(tar -xOzf "$PACOTE" ./.erp-source-sha | tr -d '\r\n')"
[[ "$COMMIT_DO_PACOTE" =~ ^[0-9a-f]{40}$ ]] \
  || { echo "! identidade do commit inválida no pacote" >&2; exit 1; }
[ "$COMMIT_DO_PACOTE" = "$COMMIT_ESPERADO" ] \
  || { echo "! pacote produzido por outro commit: $COMMIT_DO_PACOTE" >&2; exit 1; }

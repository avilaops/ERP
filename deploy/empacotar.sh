#!/usr/bin/env bash
# Confere, faz o build standalone e empacota em standalone.tgz.
# Uso: bash deploy/empacotar.sh [arquivo-de-saida]
# ETAPA=conferir só confere (lint, tipos, testes); ETAPA=montar só faz o build e o
# pacote, para rodar no servidor de build; sem ETAPA, faz as duas coisas aqui.
#
# Armadilhas conhecidas:
# 1. nunca gerar o .tgz dentro da pasta empacotada;
# 2. .next/static não entra sozinho no standalone, e não pode ser de outro build;
# 3. nenhum .env nem .git pode ir no pacote.
set -euo pipefail
cd "$(dirname "$0")/.."
ETAPA="${ETAPA:-tudo}"

if [ "$ETAPA" != "montar" ]; then
echo "▸ conferindo (lint, tipos, testes)"
npm run lint
npm run typecheck
npm test 2>&1 | tee /tmp/erp-testes.$$ | grep -E "^(ℹ|#) (tests|pass|fail|skipped)"
grep -qE "^(ℹ|#) fail 0$" /tmp/erp-testes.$$ && grep -qE "^(ℹ|#) skipped 0$" /tmp/erp-testes.$$ || { echo "! testes falharam ou foram pulados"; rm -f /tmp/erp-testes.$$; exit 1; }
rm -f /tmp/erp-testes.$$
fi
[ "$ETAPA" = "conferir" ] && exit 0

echo "▸ build"
rm -rf .next
npm run build >/dev/null

echo "▸ montando o pacote"
RAIZ=.next/standalone
rm -rf "$RAIZ/.next/static" && cp -r .next/static "$RAIZ/.next/"
[ -d public ] && cp -r public "$RAIZ/public"
# O que `npm run db:migrate` precisa para rodar dentro do container.
mkdir -p "$RAIZ/scripts" "$RAIZ/src/lib/auth" "$RAIZ/src/lib/db" "$RAIZ/db"
cp scripts/db-migrate.ts "$RAIZ/scripts/"
cp src/lib/auth/tenants.ts "$RAIZ/src/lib/auth/"
cp src/lib/db/config.ts src/lib/db/migrate.ts src/lib/db/control-schema.ts "$RAIZ/src/lib/db/"
rm -rf "$RAIZ/db/migrations" && cp -r db/migrations "$RAIZ/db/"
rm -rf "$RAIZ/db/control" && cp -r db/control "$RAIZ/db/"

SAIDA="${1:-$(mktemp -d)/standalone.tgz}"
tar -czf "$SAIDA" -C "$RAIZ" \
  --exclude='./.git' --exclude='./.env*' --exclude='./tests' --exclude='./.work' \
  --exclude='./prototype' --exclude='./docs' --exclude='./tsconfig.tsbuildinfo' .

echo "▸ conferindo o pacote"
# Sem `grep -q` depois do tar: com pipefail, o grep fechando cedo derruba o tar.
LISTA="$(tar -tzf "$SAIDA")"
conta() { printf '%s\n' "$LISTA" | grep -cE "$1" || true; }
[ "$(conta '^\./server\.js$')" = "1" ] || { echo "! sem server.js no pacote"; exit 1; }
[ "$(conta '^\./(\.env|\.git/)')" = "0" ] || { echo "! segredo dentro do pacote"; exit 1; }
[ "$(conta '\.css$')" != "0" ] || { echo "! sem CSS no pacote"; exit 1; }
[ "$(conta '^\./db/migrations/[0-9]{4}_.*\.sql$')" != "0" ] || { echo "! sem migrações no pacote"; exit 1; }
[ "$(conta '^\./db/control/[0-9]{4}_.*\.sql$')" != "0" ] || { echo "! sem as migrações do cadastro de empresas no pacote (db/control)"; exit 1; }
# Tudo o que o db-migrate.ts importa por caminho relativo tem de ir junto: faltando um
# arquivo, a migração cai ao carregar e o deploy para com a versão antiga no ar.
for MODULO in $(grep -oE 'from "\.\./[^"]+"' scripts/db-migrate.ts | sed -E 's#from "\.\./([^"]+)"#\1#'); do
  printf '%s\n' "$LISTA" | grep -qxF "./$MODULO" || { echo "! $MODULO não está no pacote (o db-migrate.ts importa)"; exit 1; }
done
[ "$(conta '^\./node_modules/pg/package\.json$')" = "1" ] || { echo "! sem o pacote pg (a migração não rodaria)"; exit 1; }
# O sharp só funciona com o binário nativo e a libvips ao lado: sem eles o PUT da foto dá 500.
[ "$(conta '^\./node_modules/sharp/package\.json$')" = "1" ] || { echo "! sem o pacote sharp (a foto do equipamento não gravaria)"; exit 1; }
[ "$(conta '^\./node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64\.node$')" = "1" ] || { echo "! sem o binário nativo do sharp (@img/sharp-linux-x64)"; exit 1; }
[ "$(conta '^\./node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp\.so')" != "0" ] || { echo "! sem a libvips do sharp (@img/sharp-libvips-linux-x64)"; exit 1; }
[ "$(conta '^\./public/icons/icon-512\.png$')" = "1" ] || { echo "! sem os ícones do aplicativo (public/icons)"; exit 1; }
echo "· $(du -h "$SAIDA" | cut -f1) em $SAIDA"
echo "$SAIDA"

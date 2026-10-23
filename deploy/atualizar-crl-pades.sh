#!/usr/bin/env bash
set -euo pipefail

PASTA="${ERP_PADES_DIR:-/opt/erp/pades}"
URL="${ERP_PADES_CRL_URL:?informe ERP_PADES_CRL_URL}"
TENANT="${ERP_PADES_TENANT:-ludus}"
DESTINO="$PASTA/chaves/$TENANT/crl.der"
CADEIA="$PASTA/chaves/$TENANT/chain.pem"
TEMPORARIO="$(mktemp "$PASTA/crl.XXXXXX")"
trap 'rm -f "$TEMPORARIO"' EXIT

curl --fail --silent --show-error --location --max-time 60 "$URL" -o "$TEMPORARIO"
openssl crl -inform DER -in "$TEMPORARIO" -verify -CAfile "$CADEIA" -noout
PROXIMA_ATUALIZACAO="$(openssl crl -inform DER -in "$TEMPORARIO" -nextupdate -noout | sed 's/^nextUpdate=//')"
LIMITE="$(( $(date -u +%s) + 3600 ))"
[ "$(date -u -d "$PROXIMA_ATUALIZACAO" +%s)" -gt "$LIMITE" ] || {
  echo "A LCR vence em menos de uma hora" >&2
  exit 1
}
chown --reference="$DESTINO" "$TEMPORARIO"
chmod --reference="$DESTINO" "$TEMPORARIO"
mv -f "$TEMPORARIO" "$DESTINO"
trap - EXIT

cd /opt/erp
docker compose restart pades-signer

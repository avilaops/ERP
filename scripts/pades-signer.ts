import { readFileSync } from "node:fs";
import { loadKeysFromDirectory, startPadesSigner } from "@/lib/contract/pades-signer";

/**
 * Processo do assinador. Segredos só por variável de ambiente ou arquivo montado.
 * Não imprime token, senha, PEM nem PFX.
 */
const token = process.env.ERP_PADES_SIGNER_TOKEN ?? "";
const certPath = process.env.ERP_PADES_TLS_CERT ?? "";
const keyPath = process.env.ERP_PADES_TLS_KEY ?? "";
const keyDir = process.env.ERP_PADES_KEY_DIR ?? "";
const host = process.env.ERP_PADES_BIND ?? "127.0.0.1";
const port = Number(process.env.ERP_PADES_SIGNER_PORT ?? "8443");

if (token.length < 16 || certPath === "" || keyPath === "") {
  console.error("[pades] faltam ERP_PADES_SIGNER_TOKEN, ERP_PADES_TLS_CERT ou ERP_PADES_TLS_KEY");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[pades] ERP_PADES_SIGNER_PORT inválida");
  process.exit(1);
}
if (keyDir !== "") {
  const loaded = loadKeysFromDirectory(keyDir, process.env.ERP_PADES_KEY_PASSWORD);
  console.info("[pades] chaves carregadas=%d", loaded);
}

const server = await startPadesSigner({
  token,
  cert: readFileSync(certPath),
  key: readFileSync(keyPath),
  port,
  host,
});
console.info("[pades] escutando em %s", server.url);

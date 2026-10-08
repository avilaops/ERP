import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** A short secret (the password of a mailbox), sealed. Only who has the key of the vault opens it. */
export type SealedSecret = { ciphertext: Buffer; iv: Buffer; authTag: Buffer };

/** Says what the sealed thing is: a secret sealed as one kind does not open as another. */
const CONTEXT = Buffer.from("erp:mail-password:v1", "utf8");

/** AES-256-GCM with the key of the vault (`vaultKey` of the certificate). Each sealing has its own random IV. */
export function sealSecret(secret: string, key: Buffer): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(CONTEXT);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(secret, "utf8")), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Opens what `sealSecret` sealed. A wrong key or a changed byte throws. */
export function openSecret(sealed: SealedSecret, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAAD(CONTEXT);
  decipher.setAuthTag(sealed.authTag);
  try {
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Não foi possível abrir a senha guardada da caixa de e-mail: a chave do cofre não é a que a selou, ou o conteúdo foi alterado.");
  }
}

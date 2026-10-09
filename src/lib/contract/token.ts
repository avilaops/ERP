import { createHash, randomBytes, randomInt } from "node:crypto";

/** How long a confirmation code is good for, and how many wrong tries it stands. */
export const CODE_MINUTES = 15;
export const CODE_MAX_ATTEMPTS = 5;
/** Between one code and the next, and how many a contract may ask for in all. */
export const CODE_INTERVAL_SECONDS = 60;
export const CODE_MAX_SENT = 10;

/** The shape of the secret a signing link carries: 32 random bytes in base64url. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

/** A new secret for a signing link. Only its hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export const hashToken = (token: string) => sha256(`contrato:${token}`);

/** Six digits, every one of the million as likely as the others. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** The code is hashed together with the secret of the link: the stored value alone opens nothing. */
export const hashCode = (token: string, code: string) => sha256(`codigo:${token}:${code}`);

/** The fingerprint of a file, as the record of signatures prints it. */
export const fingerprint = (bytes: Uint8Array) => sha256(bytes);

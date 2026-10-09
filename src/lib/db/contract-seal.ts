import { certificateHolder } from "@/lib/contract/seal";
import { loadContractSettings } from "@/lib/db/contracts";
import { loadSealedCertificate } from "@/lib/db/fiscal";
import type { Queryable } from "@/lib/db/pool";
import { openCertificate } from "@/lib/fiscal/certificate";
import { signingKeyOf } from "@/lib/fiscal/sign";
import type { SigningKey } from "@/lib/fiscal/sign";

export type ContractSeal = { key: SigningKey; /** The name on the certificate, as the record of signatures shows it. */ holder: string };

/** Why a signed contract leaves without the seal, in the words of the screen; `null` when it will be sealed. */
export type SealStanding = "desligado" | "sem-certificado" | "vencido" | null;

/** Whether the company's signed contracts are being sealed, without opening the certificate. */
export async function sealStanding(conn: Queryable, now: Date): Promise<SealStanding> {
  if (!(await loadContractSettings(conn)).seal) return "desligado";
  const stored = await loadSealedCertificate(conn);
  if (!stored) return "sem-certificado";
  return stored.validUntil.getTime() <= now.getTime() ? "vencido" : null;
}

/**
 * The key that seals the signed contracts of the company, when it turned the
 * seal on and has a certificate in force. The certificate is the same A1 of
 * the invoices and is opened here only to sign; nothing of it is returned
 * beyond what signs, and nothing is logged.
 */
export async function loadContractSeal(conn: Queryable, vault: () => Buffer, now: Date): Promise<ContractSeal | null> {
  if ((await sealStanding(conn, now)) !== null) return null;
  const stored = (await loadSealedCertificate(conn))!;
  const certificate = openCertificate(stored, vault());
  const key = signingKeyOf(certificate.pfx, certificate.password);
  return { key, holder: certificateHolder(key) };
}

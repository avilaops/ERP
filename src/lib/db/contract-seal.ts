import { loadCertificateInfo, loadSealedCertificate } from "@/lib/db/fiscal";
import type { Queryable } from "@/lib/db/pool";

/**
 * O que o contrato precisa saber do A1 da empresa: quem é, a impressão e o prazo.
 * A chave privada não é aberta aqui. Quem assina o PDF é o serviço PAdES, que
 * guarda a chave da empresa e não aceita a de outra.
 */
export type ContractSeal = {
  fingerprint: string;
  /** Nome no certificado, como o registro de assinaturas mostra. */
  holder: string;
  validFrom: Date;
  validUntil: Date;
};

/** Por que a assinatura não pode ser selada. `null` quando o certificado está em vigor. */
export type SealStanding = "desligado" | "sem-certificado" | "vencido" | null;

/** Se os contratos desta empresa podem ser selados, sem abrir o certificado. */
export async function sealStanding(conn: Queryable, now: Date): Promise<SealStanding> {
  const stored = await loadSealedCertificate(conn);
  if (!stored) return "sem-certificado";
  return stored.validUntil.getTime() <= now.getTime() ? "vencido" : null;
}

/** O certificado em vigor desta empresa. Sem PFX, sem senha e sem chave privada. */
export async function loadContractSeal(conn: Queryable, now: Date): Promise<ContractSeal | null> {
  if ((await sealStanding(conn, now)) !== null) return null;
  const info = await loadCertificateInfo(conn);
  if (!info || info.validFrom.getTime() > now.getTime()) return null;
  return { fingerprint: info.fingerprint, holder: info.subject, validFrom: info.validFrom, validUntil: info.validUntil };
}

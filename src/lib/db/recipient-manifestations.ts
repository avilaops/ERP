import type { Queryable } from "@/lib/db/pool";
import { withQueryableConnection } from "@/lib/db/pool";
import { loadFiscalSettings, loadSealedCertificate } from "@/lib/db/fiscal";
import { openCertificate } from "@/lib/fiscal/certificate";
import type { Send } from "@/lib/fiscal/channel";
import { eventEnvelope, parseEvent, processedEventXml } from "@/lib/fiscal/events";
import { assertFiscalXml } from "@/lib/fiscal/local-layout";
import { recipientManifestXml } from "@/lib/fiscal/recipient-manifest";
import type { RecipientManifestKind } from "@/lib/fiscal/recipient-manifest";
import { signEventXml, signingKeyOf } from "@/lib/fiscal/sign";

export const RECIPIENT_EVENT_URL = "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
export const RECIPIENT_EVENT_HOMOLOGATION_URL = "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
export const recipientEventUrl = (environment: "homologacao" | "producao") => environment === "producao" ? RECIPIENT_EVENT_URL : RECIPIENT_EVENT_HOMOLOGATION_URL;
export const RECIPIENT_EVENT_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

export type RecipientManifestation = { id: number; kind: RecipientManifestKind; reason: string | null; status: "pending" | "processing" | "registered" | "manual_review"; protocol: string | null; statusCode: string | null; statusReason: string | null; lastError: string | null; createdAt: Date; registeredAt: Date | null };

export async function listRecipientManifestations(nfeId: number, conn: Queryable): Promise<RecipientManifestation[]> {
  const { rows } = await conn.query("SELECT id,kind,reason,status,protocol,status_code,status_reason,last_error,created_at,registered_at FROM fiscal_recipient_manifestations WHERE nfe_id=$1 ORDER BY id", [nfeId]);
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind as RecipientManifestKind, reason: row.reason === null ? null : String(row.reason), status: row.status as RecipientManifestation["status"], protocol: row.protocol === null ? null : String(row.protocol), statusCode: row.status_code === null ? null : String(row.status_code), statusReason: row.status_reason === null ? null : String(row.status_reason), lastError: row.last_error === null ? null : String(row.last_error), createdAt: row.created_at as Date, registeredAt: row.registered_at as Date | null }));
}

export async function queueRecipientManifestation(nfeId: number, kind: RecipientManifestKind, reason: string | null, who: string, conn: Queryable): Promise<number> {
  if (!Number.isSafeInteger(nfeId) || nfeId < 1 || !who.trim()) throw new Error("NF-e ou responsável inválido.");
  const clean = reason?.replace(/\s+/g, " ").trim() || null;
  if (kind === "nao_realizada" && (!clean || clean.length < 15 || clean.length > 255)) throw new Error("Explique a operação não realizada com 15 a 255 letras.");
  const { rows } = await conn.query(
    `INSERT INTO fiscal_recipient_manifestations (nfe_id,access_key,kind,reason,created_by)
     SELECT id,access_key,$2,$3,$4 FROM fiscal_received_nfes WHERE id=$1
     ON CONFLICT (access_key,kind) DO UPDATE SET reason=EXCLUDED.reason
       WHERE fiscal_recipient_manifestations.status='pending' AND fiscal_recipient_manifestations.reason IS NOT DISTINCT FROM EXCLUDED.reason
     RETURNING id`, [nfeId, kind, clean, who],
  );
  if (!rows[0]) throw new Error("Esta manifestação já foi solicitada ou a NF-e não existe.");
  return Number(rows[0].id);
}

export async function queueSummaryManifestation(nsu: string, kind: RecipientManifestKind, reason: string | null, who: string, conn: Queryable): Promise<number> {
  if (!/^\d{15}$/.test(nsu) || !who.trim()) throw new Error("Resumo ou responsável inválido.");
  const clean = reason?.replace(/\s+/g, " ").trim() || null;
  if (kind === "nao_realizada" && (!clean || clean.length < 15 || clean.length > 255)) throw new Error("Explique a operação não realizada com 15 a 255 letras.");
  const { rows } = await conn.query(
    `INSERT INTO fiscal_recipient_manifestations (summary_nsu,access_key,kind,reason,created_by)
     SELECT nsu,access_key,$2,$3,$4 FROM fiscal_received_nfe_summaries WHERE nsu=$1 AND full_nfe_id IS NULL
     ON CONFLICT (access_key,kind) DO UPDATE SET reason=EXCLUDED.reason
       WHERE fiscal_recipient_manifestations.status='pending' AND fiscal_recipient_manifestations.reason IS NOT DISTINCT FROM EXCLUDED.reason
     RETURNING id`, [nsu, kind, clean, who],
  );
  if (!rows[0]) throw new Error("Esta manifestação já foi solicitada ou o resumo não existe mais.");
  return Number(rows[0].id);
}

const saoPauloTime = (date: Date) => `${new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19)}-03:00`;

/** Claims and sends one explicit recipient event. Ambiguous outcomes require manual review, never blind retry. */
export async function runOneRecipientManifestation(now: Date, key: () => Buffer, send: Send, conn: Queryable): Promise<boolean> {
  const job = await withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      await held.query(`UPDATE fiscal_recipient_manifestations SET status='manual_review',last_error='Envio interrompido; confira a situação na SEFAZ antes de repetir.'
        WHERE status='processing' AND processing_started_at < $1::timestamptz - interval '15 minutes'`, [now]);
      const { rows } = await held.query(`SELECT m.id,m.nfe_id,m.kind,m.reason,m.access_key FROM fiscal_recipient_manifestations m
        WHERE m.status='pending' AND m.available_at <= $1 ORDER BY m.id FOR UPDATE SKIP LOCKED LIMIT 1`, [now]);
      if (!rows[0]) { await held.query("COMMIT"); return null; }
      await held.query("UPDATE fiscal_recipient_manifestations SET status='processing',processing_started_at=$2,attempts=attempts+1,last_error=NULL WHERE id=$1", [rows[0].id, now]);
      await held.query("COMMIT"); return rows[0];
    } catch (error) { await held.query("ROLLBACK"); throw error; }
  });
  if (!job) return false;
  try {
    const [settings, sealed] = await Promise.all([loadFiscalSettings(conn), loadSealedCertificate(conn)]);
    if (!settings.cnpj || !sealed || sealed.validUntil.getTime() <= now.getTime()) throw new Error("Certificado fiscal válido e CNPJ são obrigatórios para manifestar.");
    const certificate = openCertificate(sealed, key());
    const event = recipientManifestXml({ accessKey: String(job.access_key), cnpj: settings.cnpj, environment: settings.environment, at: saoPauloTime(now), kind: job.kind as RecipientManifestKind, reason: job.reason === null ? undefined : String(job.reason) });
    const signed = signEventXml(event.xml, signingKeyOf(certificate.pfx, certificate.password));
    await assertFiscalXml(signed, "evento");
    const response = await send(recipientEventUrl(settings.environment), RECIPIENT_EVENT_ACTION, eventEnvelope(signed, String(job.id)), { pfx: certificate.pfx, passphrase: certificate.password });
    const result = parseEvent(response, String(job.access_key));
    if (!result.registered) throw new Error(`A SEFAZ não registrou (${result.code}): ${result.reason}`);
    const complete = processedEventXml(signed, response);
    await conn.query(`UPDATE fiscal_recipient_manifestations SET status='registered',signed_xml=$2,response_xml=$3,protocol=$4,status_code=$5,status_reason=$6,registered_at=$7 WHERE id=$1`, [job.id, complete, response, result.protocol, result.code, result.reason, now]);
  } catch (error) {
    await conn.query("UPDATE fiscal_recipient_manifestations SET status='manual_review',last_error=$2 WHERE id=$1", [job.id, error instanceof Error ? error.message.slice(0, 1000) : "Falha ao manifestar."]);
  }
  return true;
}

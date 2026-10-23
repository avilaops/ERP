import type { Queryable } from "@/lib/db/pool";
import { distributionStanding, processDistributedDocuments, saveDistributionBatch } from "@/lib/db/nfe-distribution";
import { loadFiscalSettings, loadSealedCertificate } from "@/lib/db/fiscal";
import { openCertificate } from "@/lib/fiscal/certificate";
import type { Send } from "@/lib/fiscal/channel";
import { DISTRIBUTION_ACTION, distributionEnvelope, distributionUrl, parseDistributionResponse } from "@/lib/fiscal/distribution";

export async function runNfeDistribution(now: Date, key: () => Buffer, send: Send, conn: Queryable): Promise<{ queried: boolean; imported: number; failed: number }> {
  const state = await distributionStanding(conn);
  if (state.nextQueryAt.getTime() > now.getTime()) return { queried: false, imported: 0, failed: 0 };
  const [settings, sealed] = await Promise.all([loadFiscalSettings(conn), loadSealedCertificate(conn)]);
  if (!settings.cnpj || !sealed || sealed.validUntil.getTime() <= now.getTime()) return { queried: false, imported: 0, failed: 0 };
  const certificate = openCertificate(sealed, key());
  const response = await send(distributionUrl(settings.environment), DISTRIBUTION_ACTION, distributionEnvelope(settings.cnpj, state.lastNsu, settings.environment), { pfx: certificate.pfx, passphrase: certificate.password });
  const result = parseDistributionResponse(response);
  await saveDistributionBatch(result, now, conn);
  const processed = await processDistributedDocuments(settings.cnpj, conn);
  return { queried: true, ...processed };
}

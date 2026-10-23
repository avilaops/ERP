import { apiAccess, apiJson } from "@/lib/api/access";
import { listReceivedNfes } from "@/lib/db/received-nfes";
import { listNfeSummaries } from "@/lib/db/nfe-distribution";

export const dynamic = "force-dynamic";

/** Operational received-invoice feed consumed by Lojas and other systems of the same tenant. */
export async function GET(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const [rows, summaries] = await Promise.all([listReceivedNfes(access.conn), listNfeSummaries(access.conn)]);
  const pending = summaries.filter((summary) => summary.fullNfeId === null);
  return apiJson({ total: rows.length, pendentes: pending.length, notas: rows.slice(0, 500).map((note) => ({
    id: note.id, chave: note.accessKey, numero: note.number, serie: note.series, emitida_em: note.issuedAt.toISOString(), valor: note.totalInvoice,
    fornecedor: { documento: note.issuerDocument, nome: note.issuerName, vinculado: note.supplierId !== null, id: note.supplierId },
    itens: note.itemCount, compra_id: note.purchaseId,
  })), pendencias: pending.slice(0, 500).map((summary) => ({
    nsu: summary.nsu, chave: summary.accessKey, emitida_em: summary.issuedAt.toISOString(), valor: summary.totalInvoice,
    situacao: summary.situation, fornecedor: { documento: summary.issuerDocument, nome: summary.issuerName },
  })) });
}

import { apiAccess, apiJson } from "@/lib/api/access";
import { listReceivedNfes } from "@/lib/db/received-nfes";

export const dynamic = "force-dynamic";

/** Operational received-invoice feed consumed by Lojas and other systems of the same tenant. */
export async function GET(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const rows = await listReceivedNfes(access.conn);
  return apiJson({ total: rows.length, notas: rows.slice(0, 500).map((note) => ({
    id: note.id, chave: note.accessKey, numero: note.number, serie: note.series, emitida_em: note.issuedAt.toISOString(), valor: note.totalInvoice,
    fornecedor: { documento: note.issuerDocument, nome: note.issuerName, vinculado: note.supplierId !== null, id: note.supplierId },
    itens: note.itemCount, compra_id: note.purchaseId,
  })) });
}

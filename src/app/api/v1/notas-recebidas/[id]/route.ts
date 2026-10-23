import { apiAccess, apiError, apiJson } from "@/lib/api/access";
import { getReceivedNfe, receivedNfeXml } from "@/lib/db/received-nfes";
import { danfeData } from "@/lib/fiscal/danfe";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const idText = (await params).id;
  if (!/^[1-9]\d{0,18}$/.test(idText)) return apiError(404, "NF-e recebida não encontrada.");
  const id = Number(idText);
  const [note, document] = await Promise.all([getReceivedNfe(id, access.conn), receivedNfeXml(id, access.conn)]);
  if (!note || !document) return apiError(404, "NF-e recebida não encontrada.");
  const fiscal = danfeData(document.xml);
  return apiJson({
    id: note.id, chave: note.accessKey, numero: note.number, serie: note.series, protocolo: note.protocol, emitida_em: note.issuedAt.toISOString(),
    emitente: fiscal.issuer, destinatario: fiscal.recipient, totais: fiscal.totals, transporte: { modalidade: fiscal.freightMode, transportadora: fiscal.carrier, volumes: fiscal.volumes },
    pagamentos: fiscal.payments, entrega: fiscal.delivery, informacoes_adicionais: fiscal.info, informacoes_fisco: fiscal.model.taxAuthorityInfo,
    fornecedor_id: note.supplierId, compra_id: note.purchaseId,
    itens: note.items.map((item, index) => ({ ...item, tributos: fiscal.items[index] ? { codigo: fiscal.items[index].taxCode, base_icms: fiscal.items[index].icmsBase, icms: fiscal.items[index].icms, aliquota_icms: fiscal.items[index].icmsRate, base_ipi: fiscal.items[index].ipiBase, ipi: fiscal.items[index].ipi, aliquota_ipi: fiscal.items[index].ipiRate, reforma: fiscal.items[index].reform } : null })),
    arquivos: { xml: `/api/v1/notas-recebidas/${note.id}/xml`, danfe: `/api/v1/notas-recebidas/${note.id}/danfe` },
  });
}

import { openSigning } from "@/lib/contract/public";
import { linkDelivers, loadContractSettings } from "@/lib/db/contracts";
import { contractFile, contractFileName } from "@/lib/db/send-contract";
import { vaultKey } from "@/lib/fiscal/certificate";

/**
 * The contract a signing link opens, as a PDF, with its record of signatures
 * as it stands. Answered to whoever has the link, only while the contract was
 * not withdrawn by the company and the link still delivers (`linkDelivers`).
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ empresa: string; token: string }> };

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { empresa, token } = await context.params;
  const signing = await openSigning(empresa, token);
  const gone = () => new Response("Contrato não encontrado.", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  if (!signing || signing.contract.status === "cancelado") return gone();
  const { contract } = signing;
  const now = new Date();
  // The file leaves by the link only while the contract waits within its time, or for the days the company set after the signature.
  if (!linkDelivers(contract, now, (await loadContractSettings(signing.conn)).downloadDays)) return gone();
  const pdf = await contractFile(contract, { company: signing.tenant.name, orderNumber: contract.orderNumber, now, vault: () => vaultKey(process.env.ERP_CERT_KEY) }, signing.conn);
  return new Response(Buffer.from(pdf), {
    headers: { ...HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${contractFileName(contract.orderNumber, contract)}"`, "Content-Length": String(pdf.length) },
  });
}

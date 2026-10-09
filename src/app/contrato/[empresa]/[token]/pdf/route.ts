import { openSigning } from "@/lib/contract/public";
import { contractFile, contractFileName } from "@/lib/db/send-contract";

/**
 * The contract a signing link opens, as a PDF, with its record of signatures
 * as it stands. Answered to whoever has the link, and only while the contract
 * was not withdrawn by the company.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ empresa: string; token: string }> };

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { empresa, token } = await context.params;
  const signing = await openSigning(empresa, token);
  if (!signing || signing.contract.status === "cancelado") {
    return new Response("Contrato não encontrado.", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const { contract } = signing;
  const pdf = await contractFile(contract, { company: signing.tenant.name, orderNumber: contract.orderNumber, now: new Date() }, signing.conn);
  return new Response(Buffer.from(pdf), {
    headers: { ...HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${contractFileName(contract.orderNumber, contract)}"`, "Content-Length": String(pdf.length) },
  });
}

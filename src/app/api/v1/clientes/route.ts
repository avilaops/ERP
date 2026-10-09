import { apiAccess, apiJson } from "@/lib/api/access";
import { formatDocument, matchesCustomer } from "@/lib/customer";
import { listCustomers } from "@/lib/db/customers";

/** The customers of the company, for other systems: what identifies and reaches each one. `?q=` searches name and document. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const search = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const rows = (await listCustomers(access.conn)).filter((customer) => matchesCustomer(customer, search));
  return apiJson({
    total: rows.length,
    clientes: rows.slice(0, 500).map((customer) => ({
      id: customer.id, tipo: customer.kind, nome: customer.name, fantasia: customer.tradeName, documento: formatDocument(customer.document), contato: customer.contactName, telefone: customer.phone,
      email: customer.email, cidade: customer.city, uf: customer.uf,
    })),
  });
}

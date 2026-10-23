import Link from "next/link";
import { notFound } from "next/navigation";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import { CARD, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getReceivedNfe } from "@/lib/db/received-nfes";
import { listProducts } from "@/lib/db/products";
import { tenantDb } from "@/lib/db/pool";
import { showMoney } from "@/lib/format";
import { linkReceivedProductAction } from "../../../../actions";

export const metadata = { title: "Vincular produto da NF-e · ERP" };
export const dynamic = "force-dynamic";

export default async function LinkReceivedItemPage({ params, searchParams }: { params: Promise<{ id: string; line: string }>; searchParams: Promise<{ erro?: string }> }) {
  const session = await requirePermission("fiscal");
  const values = await params;
  const conn = tenantDb(session.tenant.slug);
  const [note, products, query] = await Promise.all([getReceivedNfe(Number(values.id), conn), listProducts({ active: true }, conn), searchParams]);
  const item = note?.items.find((candidate) => candidate.lineNumber === Number(values.line));
  if (!note || !item || note.purchaseId) notFound();
  return <><PageHeader title="Vincular produto" hint={`NF-e ${note.number} · item ${item.lineNumber}`} actions={<Link href={`/fiscal/recebidas/${note.id}`} className={SECONDARY}>Voltar à nota</Link>} />
    <section className={`${CARD} mt-3 p-4`}><p className="font-semibold">{item.description}</p><p className="mt-1 text-sm text-slate-600">{item.quantity} {item.commercialUnit} · código {item.supplierCode ?? "não informado"} · {showMoney(item.productValue)}</p>
      {query.erro && <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{query.erro}</p>}
      {products.length === 0 ? <p className="mt-3 text-sm text-slate-600">Cadastre primeiro um produto em Produtos e custos.</p> : <form action={linkReceivedProductAction} className="mt-4"><input type="hidden" name="nfeId" value={note.id} /><input type="hidden" name="lineNumber" value={item.lineNumber} /><EquipmentPicker name="productId" chosen={item.productId ?? products[0].id} items={products.map((product) => ({ id: product.id, name: product.name, code: product.code, price: product.advisoryCost === null ? "sem custo atual" : showMoney(product.advisoryCost) }))} /><button className={`${PRIMARY} mt-3`} type="submit">Salvar vínculo</button></form>}
    </section></>;
}

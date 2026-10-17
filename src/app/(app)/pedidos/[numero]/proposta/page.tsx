import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalFields } from "@/components/ProposalFields";
import { PageHeader, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { loadProposalDetails } from "@/lib/db/proposal-details";
import { ORDER_NUMBER } from "@/lib/order-number";
import { ORDER_PROPOSAL_STEPS, proposalStep } from "@/lib/quote/settings";
import { saveOrderProposalAction } from "./actions";

export const metadata = { title: "Condições da proposta · ERP" };
export const dynamic = "force-dynamic";
export default async function OrderProposalPage({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("pedidos");
  const { numero } = await params;
  if (!ORDER_NUMBER.test(numero)) notFound();
  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) notFound();
  const [stored, company] = await Promise.all([loadProposalDetails(conn, order.id), loadProposalDetails(conn)]);
  const step = proposalStep((await searchParams).etapa, ORDER_PROPOSAL_STEPS.length);
  const back = `/pedidos/${numero}?ver=entrega`;
  const lock = await conn.query(`SELECT EXISTS (SELECT 1 FROM order_contracts WHERE order_id = $1 AND status IN ('enviado', 'assinado'))
    OR EXISTS (SELECT 1 FROM fiscal_invoices WHERE order_id = $1 AND status IN ('assinada', 'autorizada', 'denegada')) AS locked`, [order.id]);
  const locked = lock.rows[0]?.locked || !["em_negociacao", "fechado"].includes(order.status);
  return <><PageHeader title="Condições da proposta" hint={`Pedido #${numero} · em branco, usa o padrão da empresa.`} actions={<Link href={back} className={SECONDARY}>Pedido</Link>} />
    {locked ? <div className="mt-3 max-w-2xl space-y-3"><p>Este pedido já tem contrato/nota emitidos ou não está disponível para alteração. Confira o documento antes de negociar novas condições.</p><a href={`/api/pedidos/${numero}/orcamento`} target="_blank" rel="noopener" className={SECONDARY}>Conferir PDF</a></div>
      : <ProposalFields steps={ORDER_PROPOSAL_STEPS} step={step} details={stored.details} defaults={company.details} revision={stored.revision} number={numero} back={back} action={saveOrderProposalAction} />}
  </>;
}

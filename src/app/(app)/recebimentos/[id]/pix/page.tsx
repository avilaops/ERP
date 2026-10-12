import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyButton } from "@/components/CopyButton";
import { CARD, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { loadPixSettings } from "@/lib/db/pix";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables } from "@/lib/db/receivables";
import { showIsoDate, showMoney } from "@/lib/format";
import { pixCode } from "@/lib/pix";

export const metadata = { title: "Cobrar por PIX · ERP" };
export const dynamic = "force-dynamic";

const HERE = menuItem("recebimentos").href;

/** The PIX of one amount still to be received: the code to paste and its QR, with what is left of the amount. */
export default async function PixDaParcelaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);
  const { id } = await params;
  const item = /^[1-9]\d{0,8}$/.test(id) ? (await listOpenReceivables(conn)).find((receivable) => receivable.id === Number(id)) : undefined;
  if (!item) notFound();
  const pix = await loadPixSettings(conn);
  const back = (
    <p className="text-sm">
      <Link href={HERE} className={QUIET_LINK}>
        ← {menuItem("recebimentos").label}
      </Link>
    </p>
  );

  if (!pix) {
    return (
      <div className="mx-auto max-w-md">
        {back}
        <PageHeader title="Cobrar por PIX" hint="A empresa ainda não cadastrou a chave PIX." />
        <p className={`${CARD} mt-3 p-4 text-sm`}>
          {allows(session, "parametros") ? (
            <Link href="/parametros/cobranca" className="text-brand underline">
              Cadastrar a chave em Parâmetros → Cobrança por PIX
            </Link>
          ) : (
            "Peça à diretoria para cadastrar a chave em Parâmetros → Cobrança por PIX."
          )}
        </p>
      </div>
    );
  }

  const code = pixCode({ key: pix.key, name: pix.name, city: pix.city, amount: item.open, identifier: `${item.orderNumber}P${item.id}` });
  const image = await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 2, width: 480 });

  return (
    <div className="mx-auto max-w-md">
      {back}
      <PageHeader title="Cobrar por PIX" hint={`${item.customerName ?? "sem cliente"} · pedido #${item.orderNumber} · ${item.label}`} />
      <section className={`${CARD} mt-3 p-4 text-center`} aria-label="PIX da parcela">
        <p className="text-2xl font-bold">{showMoney(item.open)}</p>
        <p className="text-sm text-slate-600">
          {item.dueDate ? `vence em ${showIsoDate(item.dueDate)} · ` : ""}para {pix.name}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated here, from the code below */}
        <img src={image} alt="QR do PIX desta parcela" width={240} height={240} className="mx-auto mt-3 rounded bg-white" />
        <p className="mt-3 break-all rounded border border-slate-200 bg-slate-50 p-2 text-left font-mono text-xs">{code}</p>
        <CopyButton text={code} label="Copiar o PIX copia e cola" className={`${PRIMARY} mt-3 w-full justify-center`} />
      </section>
      <p className="mt-3 text-sm text-slate-600">Mande o código ao cliente. Quando o dinheiro cair na conta, dê a baixa em Recebimentos: o sistema não fica sabendo sozinho.</p>
    </div>
  );
}

import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { loadPixSettings } from "@/lib/db/pix";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { pixSettingsAction } from "./actions";

export const metadata = { title: "Cobrança por PIX · ERP" };
export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const [pix, company] = await Promise.all([loadPixSettings(conn), loadFiscalSettings(conn)]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Cobrança por PIX" hint="Com a chave da empresa, cada parcela em aberto ganha um PIX copia e cola com o valor. O dinheiro cai direto na conta; a baixa continua sendo dada em Recebimentos." />
      <ActionForm action={pixSettingsAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-3 p-4`}>
        <div className="basis-full">
          <label htmlFor="key" className={LABEL}>
            Chave PIX (CNPJ, CPF, e-mail, celular ou chave aleatória)
          </label>
          <input id="key" name="key" type="text" required maxLength={77} autoComplete="off" defaultValue={pix?.key ?? company.cnpj ?? ""} key={pix?.key ?? ""} className={INPUT} />
        </div>
        <div className="basis-full sm:basis-64 sm:flex-1">
          <label htmlFor="name" className={LABEL}>
            Nome de quem recebe (até 25 letras)
          </label>
          <input id="name" name="name" type="text" required maxLength={60} autoComplete="off" defaultValue={pix?.name ?? company.legalName ?? session.tenant.name} key={pix?.name ?? ""} className={INPUT} />
        </div>
        <div className="basis-full sm:basis-48 sm:flex-1">
          <label htmlFor="city" className={LABEL}>
            Cidade da conta (até 15 letras)
          </label>
          <input id="city" name="city" type="text" required maxLength={40} autoComplete="off" defaultValue={pix?.city ?? company.city ?? ""} key={pix?.city ?? ""} className={INPUT} />
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2">
          <button type="submit" name="what" value="salvar" className={PRIMARY}>
            Salvar
          </button>
          {pix && <ConfirmButton label="Remover chave" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />}
        </div>
      </ActionForm>
      <p className="mt-3 text-sm text-slate-600">
        Confira a chave com um PIX de teste de valor baixo antes de mandar para cliente: o sistema não tem como saber se a chave existe no banco. Nome e cidade saem sem acento, como o código exige.
      </p>
    </div>
  );
}

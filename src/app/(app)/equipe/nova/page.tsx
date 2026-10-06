import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { ActionForm } from "../../pedidos/ActionForm";
import { inviteUserAction } from "../actions";
import { BOTTOM_BAR, PersonFields, PRIMARY_BUTTON } from "../PersonFields";

export const metadata = { title: "Convidar pessoa · ERP" };

export default async function NovaPessoaPage() {
  await requirePermission("equipe");
  return (
    <div className="mx-auto max-w-xl">
        <Link href={menuItem("equipe").href} aria-label="Voltar para Equipe e acessos" className="inline-block rounded-lg bg-brand-soft px-4 py-2 text-xl text-brand">
          ←
        </Link>
      <h1 className="mt-3 text-2xl font-semibold">Convidar pessoa</h1>
      <p className="mt-1 text-slate-600">Nome, e-mail e o tipo de acesso. Ela entra no próximo login.</p>
      <ActionForm action={inviteUserAction} className="mt-6 flex flex-col gap-5">
        <input type="hidden" name="active" value="sim" />
        <PersonFields saved={null} />
        <div className={BOTTOM_BAR}>
          <button type="submit" className={PRIMARY_BUTTON}>
            Convidar
          </button>
        </div>
      </ActionForm>
    </div>
  );
}

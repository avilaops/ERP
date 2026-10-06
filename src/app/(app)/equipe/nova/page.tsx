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
      <div className="flex items-center gap-3">
        <Link href={menuItem("equipe").href} aria-label="Voltar para Equipe e acessos" className="shrink-0 rounded-lg bg-brand-soft px-3 py-1.5 text-xl text-brand">
          ←
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-semibold">Convidar pessoa</h1>
      </div>
      <ActionForm action={inviteUserAction} className="mt-3 flex flex-col gap-3">
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

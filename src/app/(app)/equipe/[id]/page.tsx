import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { deleteUserAction, saveUserAction } from "../actions";
import { BOTTOM_BAR, PersonFields, PRIMARY_BUTTON } from "../PersonFields";

export const metadata = { title: "Pessoa · ERP" };
export const dynamic = "force-dynamic";

export default async function PessoaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const user = /^[1-9]\d{0,8}$/.test(id) ? (await listUsers(conn)).find((item) => item.id === Number(id)) : undefined;
  if (!user) notFound();
  const self = user.email === session.email;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <Link href={menuItem("equipe").href} aria-label="Voltar para Equipe e acessos" className="shrink-0 rounded-lg bg-brand-soft px-3 py-1.5 text-xl text-brand">
          ←
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-semibold">{user.name}</h1>
      </div>
      {self && <p className="mt-1 text-sm text-slate-600">Este é o seu cadastro: você não muda o próprio tipo de acesso nem tira o próprio acesso.</p>}
      <ActionForm action={saveUserAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="id" value={user.id} />
        <PersonFields saved={user} />
        <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-4">
          <input type="checkbox" name="active" value="sim" defaultChecked={user.active} className="h-5 w-5" />
          <span>
            <span className="block font-semibold">Pode entrar</span>
            <span className="block text-sm text-slate-600">Desmarque para tirar o acesso. O cadastro e o histórico ficam.</span>
          </span>
        </label>
        <div className={BOTTOM_BAR}>
          <button type="submit" className={PRIMARY_BUTTON}>
            Salvar
          </button>
        </div>
      </ActionForm>
      {!self && (
        <ActionForm action={deleteUserAction} className="mt-4">
          <input type="hidden" name="id" value={user.id} />
          <ConfirmButton label="Remover pessoa" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
        </ActionForm>
      )}
    </div>
  );
}

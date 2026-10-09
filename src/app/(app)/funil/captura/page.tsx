import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { publicAppUrl } from "@/lib/contract/public";
import { listCaptureForms } from "@/lib/db/capture";
import type { CaptureForm } from "@/lib/db/capture";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { captureFormAction } from "../marketing-actions";

export const metadata = { title: "Formulários de captura · ERP" };
export const dynamic = "force-dynamic";

function Fields({ saved, people }: { saved: CaptureForm | null; people: { email: string; name: string }[] }) {
  const suffix = saved?.id ?? "novo";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <div>
        <label htmlFor={`nome-${suffix}`} className={LABEL}>
          Nome (só a equipe vê; vira a origem da oportunidade)
        </label>
        <input id={`nome-${suffix}`} name="name" type="text" defaultValue={saved?.name ?? ""} placeholder="Ex.: Site" autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`dono-${suffix}`} className={LABEL}>
          Quem recebe as oportunidades
        </label>
        <select id={`dono-${suffix}`} name="ownerEmail" defaultValue={saved?.ownerEmail ?? ""} className={INPUT}>
          <option value="">Escolha…</option>
          {people.map((user) => (
            <option key={user.email} value={user.email}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`titulo-${suffix}`} className={LABEL}>
          Título da página
        </label>
        <input id={`titulo-${suffix}`} name="title" type="text" defaultValue={saved?.title ?? ""} placeholder="Ex.: Peça o seu orçamento" autoComplete="off" className={INPUT} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`abertura-${suffix}`} className={LABEL}>
          Texto de abertura (opcional)
        </label>
        <textarea id={`abertura-${suffix}`} name="intro" rows={2} defaultValue={saved?.intro ?? ""} className={`${INPUT} py-2`} />
      </div>
      {saved && (
        <div>
          <label htmlFor={`ativo-${suffix}`} className={LABEL}>
            Situação
          </label>
          <select id={`ativo-${suffix}`} name="active" defaultValue={saved.active ? "sim" : "nao"} key={String(saved.active)} className={INPUT}>
            <option value="sim">No ar</option>
            <option value="nao">Fora do ar</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default async function CapturaPage() {
  const session = await requirePermission("funil", "/funil/captura");
  if (!seesAllOrders(session)) notFound();
  const conn = tenantDb(session.tenant.slug);
  const forms = await listCaptureForms(conn);
  const people = (await listUsers(conn)).filter((user) => user.active);
  const address = (form: CaptureForm) => `${publicAppUrl()}/captura/${session.tenant.slug}/${form.token}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/funil/campanhas" className={QUIET_LINK}>
          ← Campanhas
        </Link>
      </p>
      <PageHeader title="Formulários de captura" hint="Uma página pública para pôr no site, no Instagram ou num anúncio. Quem preenche vira oportunidade na primeira etapa do funil." />

      <ul className="mt-3 flex flex-col gap-2">
        {forms.map((form) => (
          <li key={form.id} className={CARD}>
            <details className="group">
              <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{form.name}</span>
                  <span className="block text-sm text-slate-600">
                    {form.answers} {form.answers === 1 ? "resposta" : "respostas"} · vai para {form.ownerName}
                  </span>
                </span>
                <Pill tone={form.active ? "good" : "neutral"}>{form.active ? "No ar" : "Fora do ar"}</Pill>
                <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className="border-t border-slate-200 p-3">
                <p className={LABEL}>Endereço da página</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <a href={address(form)} target="_blank" rel="noreferrer" className={`${QUIET_LINK} min-w-0 flex-1 break-all text-sm`}>
                    {address(form)}
                  </a>
                  <CopyButton text={address(form)} label="Copiar endereço" className={SECONDARY} />
                </div>
                <ActionForm action={captureFormAction} className="mt-3">
                  <Fields saved={form} people={people} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="submit" name="what" value="salvar" className={SECONDARY}>
                      Salvar
                    </button>
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                  </div>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className={`${CARD} mt-3`} open={forms.length === 0}>
        <summary className="flex min-h-[var(--control)] cursor-pointer items-center px-3 font-medium">+ Novo formulário</summary>
        <ActionForm action={captureFormAction} className="border-t border-slate-200 p-3">
          <Fields saved={null} people={people} />
          <button type="submit" name="what" value="salvar" className={`${PRIMARY} mt-3`}>
            Criar formulário
          </button>
        </ActionForm>
      </details>
    </div>
  );
}

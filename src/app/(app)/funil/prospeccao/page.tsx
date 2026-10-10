import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CARD, INPUT, LABEL, Pager, PageHeader, pageOf, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { formatDocument, formatPhone } from "@/lib/customer";
import { tenantDb } from "@/lib/db/pool";
import { listProspectLoads, loadProspectFilters, MAX_CNAES } from "@/lib/db/prospect-load";
import { IMPORT_LIMIT, listProspects, prospectTotals } from "@/lib/db/prospects";
import { showDateTime } from "@/lib/format";
import { UFS } from "@/lib/pricing/states";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { importProspectsAction, prospectAction, prospectBaseAction } from "../actions";

export const metadata = { title: "Prospecção · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/funil/prospeccao";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const DANGER = "inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50";

export default async function ProspeccaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", HERE);
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const totals = await prospectTotals(conn);
  // The load of the Receita's base brings thousands of companies at once: it is of who answers for the team.
  const lead = seesAllOrders(session);
  const TABS = [["novo", `A trabalhar · ${totals.novo}`], ["virou", `Viraram oportunidade · ${totals.virou}`], ["descartado", `Descartadas · ${totals.descartado}`], ["importar", "+ Por CNPJ"], ...(lead ? ([["base", "Base da Receita"]] as const) : [])] as const;
  // An empty list opens on the way to fill it, at its own address: the answer of the import stays on the screen after the list changes.
  if (first(query.ver) === "" && totals.novo + totals.virou + totals.descartado === 0) redirect(`${HERE}?ver=importar`);
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "novo";
  const search = first(query.q).slice(0, 80);
  const city = first(query.cidade).slice(0, 80);
  const uf = totals.ufs.includes(first(query.uf)) ? first(query.uf) : null;
  const hrefOf = (page: number) => `${HERE}?${new URLSearchParams({ ver: tab, ...(search ? { q: search } : {}), ...(city ? { cidade: city } : {}), ...(uf ? { uf } : {}), ...(page > 1 ? { pagina: String(page) } : {}) }).toString()}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("funil").href} className={QUIET_LINK}>
          ← {menuItem("funil").label}
        </Link>
      </p>
      <PageHeader title="Prospecção" hint="Empresas que ainda não são clientes, com os dados públicos da Receita. A lista é de toda a equipe; quem transforma em oportunidade fica com ela." />
      <nav aria-label="Partes da prospecção" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`${HERE}?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "importar" ? <Import /> : tab === "base" ? <Base /> : <List />}
    </div>
  );

  function Import() {
    return (
      <ActionForm action={importProspectsAction} className={`${CARD} mt-3 p-3`}>
        <label htmlFor="cnpjs" className={LABEL}>
          CNPJs das empresas, um por linha (até {IMPORT_LIMIT} por vez)
        </label>
        <textarea id="cnpjs" name="cnpjs" rows={6} placeholder={"12.345.678/0001-95\n98.765.432/0001-10"} className={`${INPUT} py-2 font-mono`} />
        <p className="mt-2 text-sm text-slate-600">
          Cada CNPJ é consultado no cadastro público da Receita Federal e a empresa entra na lista com razão social, atividade, cidade, telefone e e-mail do cadastro. Só dados da empresa: nenhum sócio.
        </p>
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Buscar na Receita e guardar
        </button>
      </ActionForm>
    );
  }

  async function Base() {
    const filters = await loadProspectFilters(conn);
    const loads = await listProspectLoads(conn);
    const running = loads.find((load) => load.status === "pedida" || load.status === "rodando") ?? null;
    const STATUS = { pedida: "na fila", rodando: "em andamento", concluida: "concluída", falhou: "parou" } as const;
    return (
      <>
        <ActionForm action={prospectBaseAction} className={`${CARD} mt-3 p-3`}>
          <label htmlFor="cnaes" className={LABEL}>
            Atividades que interessam (CNAE principal, até {MAX_CNAES}), uma por linha
          </label>
          <textarea id="cnaes" name="cnaes" rows={3} defaultValue={filters.cnaes.join("\n")} key={filters.cnaes.join(",")} placeholder={"9313-1/00\n8650-0/04"} className={`${INPUT} py-2 font-mono`} />
          <p className="mt-1 text-xs text-slate-600">
            O código de cada atividade está no cartão CNPJ de qualquer empresa do ramo, ou na busca do IBGE (CONCLA). Ex.: 9313-1/00 é academia; 8650-0/04, fisioterapia.
          </p>
          <fieldset className="mt-3">
            <legend className={LABEL}>Estados (nenhum marcado é o Brasil todo)</legend>
            <div className="mt-1 grid grid-cols-6 gap-1 sm:grid-cols-9">
              {UFS.map((uf) => (
                <label key={uf} className="flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded border border-slate-300 bg-white text-sm has-[:checked]:border-brand has-[:checked]:font-semibold has-[:checked]:text-brand">
                  <input type="checkbox" name="ufs" value={uf} defaultChecked={filters.ufs.includes(uf)} className="sr-only" />
                  {uf}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-sm text-slate-600">
            Só entram empresas ativas, com os dados públicos do cadastro: nome, atividade, endereço, telefone e e-mail da empresa. Nenhum sócio. A carga lê a base inteira da Receita pela internet e guarda só o recorte; leva algumas horas e pode ser repetida todo mês.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" name="what" value="salvar" className={SECONDARY}>
              Salvar recorte
            </button>
            {!running && (
              <button type="submit" name="what" value="trazer" className={PRIMARY}>
                Salvar e trazer da Receita
              </button>
            )}
          </div>
        </ActionForm>
        {loads.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2" aria-label="Cargas">
            {loads.map((load) => (
              <li key={load.id} className={`${CARD} flex flex-wrap items-center gap-2 px-3 py-2`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {showDateTime(load.requestedAt)} · {load.cnaes.length} {load.cnaes.length === 1 ? "atividade" : "atividades"} · {load.ufs.length === 0 ? "Brasil todo" : load.ufs.join(", ")}
                  </span>
                  <span className="block text-sm text-slate-600">{load.detail ?? "Esperando a vez."}</span>
                </span>
                <Pill tone={load.status === "concluida" ? "good" : load.status === "falhou" ? "bad" : "warn"}>{STATUS[load.status]}</Pill>
                {(load.status === "pedida" || load.status === "rodando") && (
                  <ActionForm action={prospectBaseAction}>
                    <ConfirmButton label="Cancelar" confirmLabel="Confirmar: cancelar a carga" className={DANGER} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  async function List() {
    const status = tab as "novo" | "virou" | "descartado";
    const slice = pageOf(await listProspects({ status, search, uf, city }, conn), first(query.pagina), rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
    return (
      <>
        <form method="get" role="search" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_auto] sm:items-end">
          <input type="hidden" name="ver" value={tab} />
          <label className="col-span-2 text-sm font-medium text-slate-700 sm:col-span-1">
            Nome, atividade ou CNPJ
            <input name="q" type="search" defaultValue={search} className={INPUT} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Cidade
            <input name="cidade" type="search" defaultValue={city} className={INPUT} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Estado
            <select name="uf" defaultValue={uf ?? ""} className={INPUT}>
              <option value="">Todos</option>
              {totals.ufs.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${SECONDARY} col-span-2 sm:col-span-1`}>
            Filtrar
          </button>
        </form>
        {slice.total === 0 ? (
          <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>
            Nenhuma empresa aqui{search || city || uf ? " com esse filtro" : ""}.{" "}
            {status === "novo" && (
              <Link href={`${HERE}?ver=importar`} className={QUIET_LINK}>
                Trazer empresas pelo CNPJ
              </Link>
            )}
          </p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-2">
              {slice.rows.map((prospect) => (
                <li key={prospect.cnpj} className={CARD}>
                  <details className="group">
                    <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold leading-snug">{prospect.tradeName ?? prospect.legalName}</span>
                        <span className="block truncate text-sm text-slate-600">
                          {[prospect.city && prospect.uf ? `${prospect.city}/${prospect.uf}` : (prospect.city ?? prospect.uf), prospect.activity].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {prospect.isCustomer ? <Pill tone="good">já é cliente</Pill> : prospect.registryStatus.toUpperCase() !== "ATIVA" ? <Pill tone="bad">{prospect.registryStatus.toLowerCase()}</Pill> : null}
                      <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                        ›
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 p-3 text-sm">
                      <p className="text-slate-700">
                        {prospect.legalName} · CNPJ {formatDocument(prospect.cnpj)}
                        {prospect.size ? ` · ${prospect.size.toLowerCase()}` : ""}
                        {prospect.openedOn ? ` · aberta em ${prospect.openedOn.split("-").reverse().join("/")}` : ""}
                      </p>
                      <p className="mt-1 text-slate-700">{[prospect.phone ? formatPhone(prospect.phone) : null, prospect.email].filter(Boolean).join(" · ") || "Sem telefone nem e-mail no cadastro da Receita."}</p>
                      <ActionForm action={prospectAction} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="cnpj" value={prospect.cnpj} />
                        {status === "virou" && prospect.opportunityId !== null ? (
                          <Link href={`/funil/${prospect.opportunityId}`} className={SECONDARY}>
                            Abrir a oportunidade
                          </Link>
                        ) : (
                          <>
                            <button type="submit" name="what" value="virar" className={PRIMARY}>
                              Virar oportunidade
                            </button>
                            <button type="submit" name="what" value={status === "descartado" ? "voltar" : "descartar"} className={SECONDARY}>
                              {status === "descartado" ? "Voltar para a lista" : "Descartar"}
                            </button>
                          </>
                        )}
                        <ConfirmButton label="Remover" confirmLabel="Confirmar: remover da lista" className={DANGER} />
                      </ActionForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <Pager {...slice} noun={["empresa", "empresas"]} hrefFor={hrefOf} />
          </>
        )}
      </>
    );
  }
}

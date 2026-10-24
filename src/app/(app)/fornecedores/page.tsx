import Link from "next/link";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, INPUT, PageHeader, Pill, PRIMARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { CnpjError, companySummary, lookupCnpj } from "@/lib/cnpj";
import { formatDocument, formatPhone } from "@/lib/customer";
import { listSupplierCountries, querySuppliers, SUPPLIER_KIND_LABELS } from "@/lib/db/suppliers";
import { tenantDb } from "@/lib/db/pool";
import { parseListQuery } from "@/lib/list-query";
import { ActionForm } from "../pedidos/ActionForm";
import { createSupplierAction } from "./actions";
import { SupplierFields } from "./SupplierFields";

const ITEM = menuItem("fornecedores");
const HERE = ITEM.href;

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("fornecedores");
  const conn = tenantDb(session.tenant.slug);
  const raw = await searchParams;
  const countries = await listSupplierCountries(conn);
  const options = {
    sorts: ["nome", "cadastro"] as const,
    defaultSort: "nome" as const,
    filters: { tipo: ["PJ", "PF", "EX"], pais: countries, situacao: ["ativo", "inativo"] },
  };
  const query = parseListQuery(raw, options);
  const result = await querySuppliers(query, conn);
  const { items, ...page } = result;
  const adding = first(raw.novo) === "1" || (result.total === 0 && query.search === "" && Object.keys(query.filters).length === 0);
  const typedCnpj = adding ? (first(raw.cnpj) ?? "").trim() : "";
  let lookup: Awaited<ReturnType<typeof lookupCnpj>> | null = null;
  let lookupError: string | null = null;
  if (typedCnpj !== "") {
    try {
      lookup = await lookupCnpj(typedCnpj);
    } catch (error) {
      if (!(error instanceof CnpjError)) throw error;
      lookupError = error.message;
    }
  }
  const defaults = lookup ? {
    kind: "PJ" as const,
    name: lookup.legalName,
    tradeName: lookup.tradeName,
    document: formatDocument(lookup.cnpj),
    phone: lookup.phone ? formatPhone(lookup.phone) : null,
    email: lookup.email,
  } : undefined;

  return (
    <>
      <PageHeader title={ITEM.label} hint="Quem a empresa paga: fábrica, transportadora e prestadores usados nas contas a pagar." actions={!adding && <Link href={`${HERE}?novo=1`} className={PRIMARY}>+ Novo fornecedor</Link>} />

      {adding ? (
        <section className={`${CARD} mt-4`} aria-label="Novo fornecedor">
          <div className="flex items-center justify-between gap-3 px-5 py-3"><h2 className="text-sm font-semibold uppercase tracking-wide">Novo fornecedor</h2>{result.total > 0 && <Link href={HERE} className="font-medium text-brand underline">Voltar para a lista</Link>}</div>
          <form method="get" role="search" className="flex flex-wrap items-end gap-2 border-t border-slate-200 px-5 py-3">
            <input type="hidden" name="novo" value="1" />
            <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
              Preencher pela Receita Federal
              <input type="text" name="cnpj" inputMode="numeric" defaultValue={typedCnpj} placeholder="00.000.000/0000-00" autoComplete="off" className={INPUT} />
            </label>
            <button type="submit" className="inline-flex min-h-[var(--control)] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">Buscar CNPJ</button>
          </form>
          {lookupError && <p role="alert" className="mx-5 mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{lookupError}</p>}
          {lookup && <p role="status" className="mx-5 mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{companySummary(lookup)}. Confira os dados antes de salvar.</p>}
          <ActionForm action={createSupplierAction} className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-2">
            <SupplierFields key={lookup?.cnpj ?? "vazio"} saved={null} defaults={defaults} />
            <div className="sticky bottom-[var(--tabbar)] z-10 -mx-4 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:col-span-2 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0"><button type="submit" className={`${PRIMARY} w-full lg:w-auto`}>Salvar fornecedor</button></div>
          </ActionForm>
        </section>
      ) : (
        <section className={`${CARD} mt-4 list-screen`} aria-label="Fornecedores cadastrados">
          <ListQuery
            path={HERE}
            query={query}
            options={options}
            searchLabel="Buscar fornecedor por nome, documento, contato ou país"
            searchPlaceholder="Nome, documento, contato ou país"
            sorts={[{ value: "nome", label: "Nome" }, { value: "cadastro", label: "Data de cadastro" }]}
            filters={[
              { key: "tipo", label: "Tipo", multiple: true, choices: [{ value: "PJ", label: "Empresa" }, { value: "PF", label: "Pessoa física" }, { value: "EX", label: "Exterior" }] },
              { key: "situacao", label: "Situação", choices: [{ value: "ativo", label: "Em uso" }, { value: "inativo", label: "Desligado" }] },
              ...(countries.length ? [{ key: "pais", label: "País", multiple: true, choices: countries.map((country) => ({ value: country, label: country })) }] : []),
            ]}
          />
          {items.length === 0 ? <p className="p-6 text-slate-600">Nenhum fornecedor corresponde à busca e aos filtros aplicados.</p> : (
            <ul className="list-results">
              {items.map((supplier) => (
                <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <Link href={`${HERE}/${supplier.id}`} className="break-words font-medium text-brand underline">{supplier.tradeName ?? supplier.name}</Link>
                    {supplier.tradeName && supplier.tradeName !== supplier.name && <span className="block break-words text-sm text-slate-600">{supplier.name}</span>}
                    <p className="mt-1 break-words text-xs text-slate-500">{[SUPPLIER_KIND_LABELS[supplier.kind], supplier.kind === "EX" ? supplier.country : supplier.document && formatDocument(supplier.document), supplier.contactName, supplier.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Pill tone={supplier.active ? "good" : "neutral"}>{supplier.active ? "Em uso" : "Desligado"}</Pill>
                </li>
              ))}
            </ul>
          )}
          <ListPager path={HERE} query={query} options={options} result={page} noun={["fornecedor", "fornecedores"]} />
        </section>
      )}
    </>
  );
}

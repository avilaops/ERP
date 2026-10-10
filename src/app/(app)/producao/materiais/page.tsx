import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, INPUT, LABEL, Pager, PageHeader, pageOf, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listMaterialMoves, listMaterials, listProductsForMaterials, MATERIAL_UNITS } from "@/lib/db/materials";
import type { Material } from "@/lib/db/materials";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { materialAction, moveMaterialAction } from "../material-actions";

export const metadata = { title: "Materiais · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/producao/materiais";
const TABS = [["estoque", "Estoque"], ["listas", "Listas por equipamento"], ["novo", "+ Material"]] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** `12`, `12,5`, `0,125`: the quantity as a person reads it. */
const show = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const KINDS: Record<string, string> = { entrada: "Entrada", saida: "Saída", ajuste: "Contagem", consumo: "Consumo", estorno: "Devolução" };

function Fields({ saved }: { saved: Material | null }) {
  const suffix = saved?.id ?? "novo";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <div className="col-span-2">
        <label htmlFor={`nome-${suffix}`} className={LABEL}>
          Material
        </label>
        <input id={`nome-${suffix}`} name="name" type="text" defaultValue={saved?.name ?? ""} placeholder="Ex.: Tubo 50x30 2 mm" autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`unidade-${suffix}`} className={LABEL}>
          Unidade
        </label>
        <select id={`unidade-${suffix}`} name="unit" defaultValue={saved?.unit ?? "un"} className={INPUT}>
          {Object.entries(MATERIAL_UNITS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`minimo-${suffix}`} className={LABEL}>
          Estoque mínimo
        </label>
        <input id={`minimo-${suffix}`} name="minimum" type="text" inputMode="decimal" defaultValue={saved ? String(saved.minimum).replace(".", ",") : ""} autoComplete="off" className={`${INPUT} text-right`} />
      </div>
      {!saved && (
        <div className="col-span-2">
          <label htmlFor="estoque-novo" className={LABEL}>
            Quanto tem hoje
          </label>
          <input id="estoque-novo" name="stock" type="text" inputMode="decimal" autoComplete="off" className={`${INPUT} text-right`} />
        </div>
      )}
    </div>
  );
}

export default async function MateriaisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("producao", HERE);
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "estoque";
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const hrefOf = (page: number) => `${HERE}?ver=${tab}${page > 1 ? `&pagina=${page}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("producao").href} className={QUIET_LINK}>
          ← {menuItem("producao").label}
        </Link>
      </p>
      <PageHeader
        title="Materiais"
        hint="O estoque do que a fábrica usa e quanto vai em cada equipamento. Só quantidades."
        actions={
          <Link href="/producao/necessidades" className={SECONDARY}>
            O que vai faltar
          </Link>
        }
      />
      <nav aria-label="Partes dos materiais" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
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
      {tab === "estoque" && <Stock />}
      {tab === "listas" && <Bills />}
      {tab === "novo" && (
        <ActionForm action={materialAction} className={`${CARD} mt-3 p-3`}>
          <Fields saved={null} />
          <button type="submit" name="what" value="salvar" className={`${PRIMARY} mt-3`}>
            Adicionar material
          </button>
        </ActionForm>
      )}
    </div>
  );

  async function Stock() {
    const slice = pageOf(await listMaterials(conn), first(query.pagina), size);
    if (slice.total === 0) {
      return (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>
          Nenhum material cadastrado.{" "}
          <Link href={`${HERE}?ver=novo`} className={QUIET_LINK}>
            Cadastrar o primeiro
          </Link>
          .
        </p>
      );
    }
    const opened = first(query.material);
    return (
      <>
        <ul className="mt-3 flex flex-col gap-2">
          {await Promise.all(
            slice.rows.map(async (material) => {
              const open = opened === String(material.id);
              const moves = open ? await listMaterialMoves(material.id, conn) : [];
              const low = material.stock < material.minimum;
              return (
                <li key={material.id} className={CARD}>
                  <Link href={open ? hrefOf(slice.page) : `${hrefOf(slice.page)}${hrefOf(slice.page).includes("?") ? "&" : "?"}material=${material.id}`} scroll={false} className="flex min-h-[var(--control)] items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-snug">{material.name}</span>
                      <span className="block text-sm text-slate-600">
                        {show(material.stock)} {MATERIAL_UNITS[material.unit]} · mínimo {show(material.minimum)}
                      </span>
                    </span>
                    {material.stock < 0 ? <Pill tone="bad">negativo</Pill> : low ? <Pill tone="warn">comprar</Pill> : null}
                    <span className={`text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
                      ›
                    </span>
                  </Link>
                  {open && (
                    <div className="border-t border-slate-200 p-3">
                      <ActionForm action={moveMaterialAction} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_7rem_minmax(0,1fr)_auto] sm:items-end">
                        <input type="hidden" name="id" value={material.id} />
                        <div>
                          <label htmlFor={`tipo-${material.id}`} className={LABEL}>
                            Lançamento
                          </label>
                          <select id={`tipo-${material.id}`} name="kind" defaultValue="entrada" className={INPUT}>
                            <option value="entrada">Entrada</option>
                            <option value="saida">Saída</option>
                            <option value="ajuste">Contagem (quanto tem)</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`qtd-${material.id}`} className={LABEL}>
                            Quantidade
                          </label>
                          <input id={`qtd-${material.id}`} name="quantity" type="text" inputMode="decimal" autoComplete="off" className={`${INPUT} text-right`} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label htmlFor={`nota-${material.id}`} className={LABEL}>
                            Observação (opcional)
                          </label>
                          <input id={`nota-${material.id}`} name="note" type="text" maxLength={200} autoComplete="off" className={INPUT} />
                        </div>
                        <button type="submit" className={`${PRIMARY} col-span-2 sm:col-span-1`}>
                          Lançar
                        </button>
                      </ActionForm>
                      {moves.length > 0 && (
                        <ul className="mt-3 text-sm">
                          {moves.slice(0, 5).map((move, index) => (
                            <li key={index} className="py-0.5 text-slate-700">
                              <span className="font-medium">
                                {move.quantity > 0 ? "+" : ""}
                                {show(move.quantity)}
                              </span>{" "}
                              · {KINDS[move.kind] ?? move.kind}
                              {move.productionNumber ? ` da ordem ${move.productionNumber}` : ""}
                              {move.note ? ` · ${move.note}` : ""} · {showDateTime(move.at)} · {move.by}
                            </li>
                          ))}
                        </ul>
                      )}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-700">Mudar nome, unidade ou mínimo</summary>
                        <ActionForm action={materialAction} className="mt-2">
                          <Fields saved={material} />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="submit" name="what" value="salvar" className={SECONDARY}>
                              Salvar
                            </button>
                            <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                          </div>
                        </ActionForm>
                      </details>
                    </div>
                  )}
                </li>
              );
            }),
          )}
        </ul>
        <Pager {...slice} noun={["material", "materiais"]} hrefFor={hrefOf} />
      </>
    );
  }

  async function Bills() {
    const slice = pageOf(await listProductsForMaterials(conn), first(query.pagina), size);
    return (
      <>
        <p className="mt-3 text-sm text-slate-700">O que vai em uma unidade de cada equipamento. Quando a ordem fica pronta, o estoque baixa sozinho pela lista.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {slice.rows.map((product) => (
            <li key={product.id}>
              <Link href={`/producao/lista/${product.id}`} className="flex min-h-[var(--control)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-brand">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {product.code ? `${product.code} · ` : ""}
                  {product.name}
                </span>
                {product.materials === 0 ? <Pill tone="neutral">sem lista</Pill> : <Pill tone="good">{product.materials} {product.materials === 1 ? "material" : "materiais"}</Pill>}
              </Link>
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["equipamento", "equipamentos"]} hrefFor={hrefOf} />
      </>
    );
  }
}

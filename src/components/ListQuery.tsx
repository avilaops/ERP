import Link from "next/link";
import { INPUT, Pager, SECONDARY } from "@/components/ui";
import { LIST_PAGE_SIZES, listHref } from "@/lib/list-query";
import type { ListQuery as Query, ListQueryOptions, ListResult } from "@/lib/list-query";

export type QueryChoice = { value: string; label: string };
export type QueryFilter = { key: string; label: string; choices: QueryChoice[]; multiple?: boolean };

type Props<Sort extends string> = {
  path: string;
  query: Query<Sort>;
  options: ListQueryOptions<Sort>;
  searchLabel: string;
  searchPlaceholder: string;
  sorts: { value: Sort; label: string }[];
  filters?: QueryFilter[];
};

const activeCount = <Sort extends string>(query: Query<Sort>, options: ListQueryOptions<Sort>, visible: Set<string>) =>
  Object.entries(query.filters).reduce((total, [key, values]) => total + (visible.has(key) ? values.length : 0), 0) +
  (query.sort === options.defaultSort && query.direction === (options.defaultDirection ?? "asc") ? 0 : 1);

/** The same search/filter/sort grammar for every large operational list. */
export function ListQuery<Sort extends string>({ path, query, options, searchLabel, searchPlaceholder, sorts, filters = [] }: Props<Sort>) {
  const visible = new Set(filters.map((filter) => filter.key));
  const hiddenFilters = Object.fromEntries(Object.entries(query.filters).filter(([key]) => !visible.has(key)));
  const clearHref = listHref(path, query, {
    search: "",
    pageSize: 25,
    sort: options.defaultSort,
    direction: options.defaultDirection ?? "asc",
    filters: hiddenFilters,
  }, options);
  const count = activeCount(query, options, visible);
  const activeFilters = filters.flatMap((filter) => (query.filters[filter.key] ?? []).map((value) => ({
    key: filter.key,
    value,
    label: `${filter.label}: ${filter.choices.find((choice) => choice.value === value)?.label ?? value}`,
  })));
  return (
    <div className="list-query border-b border-slate-200 p-2 sm:p-4">
      <form method="get" action={path} role="search" className="grid gap-1 sm:gap-3">
        {Object.entries(query.filters).flatMap(([key, values]) => visible.has(key) ? [] : values.map((value) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />))}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 sm:max-w-md">
            <span className="sr-only">{searchLabel}</span>
            <input type="search" name="q" defaultValue={query.search} placeholder={searchPlaceholder} aria-label={searchLabel} className={INPUT} />
          </label>
          <button type="submit" className={SECONDARY}>Buscar</button>
          {(query.search !== "" || count > 0) && <Link href={clearHref} className={SECONDARY}>Limpar</Link>}
        </div>

        <details className="group" open={count > 0}>
          <summary className="inline-flex min-h-[var(--control)] cursor-pointer items-center gap-2 font-medium text-brand">
            Filtros e ordenação{count > 0 ? ` (${count})` : ""}
          </summary>
          <div className="grid gap-4 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            {filters.map((filter) => (
              <fieldset key={filter.key}>
                <legend className="text-sm font-medium text-slate-700">{filter.label}</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                  {filter.choices.map((choice) => (
                    <label key={choice.value} className="inline-flex min-h-[var(--control)] items-center gap-2 text-sm">
                      <input type={filter.multiple ? "checkbox" : "radio"} name={filter.key} value={choice.value} defaultChecked={query.filters[filter.key]?.includes(choice.value)} />
                      {choice.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="text-sm font-medium text-slate-700">
              Ordenar por
              <select name="ordenar" defaultValue={query.sort} className={INPUT}>
                {sorts.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Direção
              <select name="direcao" defaultValue={query.direction} className={INPUT}>
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
              </select>
            </label>
            <input type="hidden" name="porPagina" value={query.pageSize} />
            <div className="self-end"><button type="submit" className={SECONDARY}>Aplicar filtros</button></div>
          </div>
        </details>
      </form>
      {(query.search || activeFilters.length > 0) && <div aria-label="Critérios ativos" className="mt-2 flex flex-wrap gap-2 text-xs">
        {query.search && <Link href={listHref(path, query, { search: "" }, options)} className="inline-flex min-h-[var(--control)] items-center rounded-full border border-slate-300 px-3">Busca: {query.search} ×</Link>}
        {activeFilters.map((active) => {
          const next = { ...query.filters, [active.key]: (query.filters[active.key] ?? []).filter((value) => value !== active.value) };
          return <Link key={`${active.key}-${active.value}`} href={listHref(path, query, { filters: next }, options)} className="inline-flex min-h-[var(--control)] items-center rounded-full border border-slate-300 px-3">{active.label} ×</Link>;
        })}
      </div>}
    </div>
  );
}
function Criteria<Sort extends string>({ query, options, includeSize }: { query: Query<Sort>; options: ListQueryOptions<Sort>; includeSize: boolean }) {
  const fields: [string, string][] = [];
  if (query.search) fields.push(["q", query.search]);
  if (includeSize && query.pageSize !== 25) fields.push(["porPagina", String(query.pageSize)]);
  if (query.sort !== options.defaultSort) fields.push(["ordenar", query.sort]);
  if (query.direction !== (options.defaultDirection ?? "asc")) fields.push(["direcao", query.direction]);
  for (const key of Object.keys(options.filters ?? {})) for (const value of query.filters[key] ?? []) fields.push([key, value]);
  return <>{fields.map(([name, value], index) => <input key={`${name}-${value}-${index}`} type="hidden" name={name} value={value} />)}</>;
}

/** Page size and direct page jump sit beside the shared previous/next pager. */
export function ListPager<Sort extends string>({ path, query, options, result, noun }: {
  path: string;
  query: Query<Sort>;
  options: ListQueryOptions<Sort>;
  result: Omit<ListResult<unknown>, "items">;
  noun: [one: string, many: string];
}) {
  return (
    <div data-list-pager>
      <div className="hidden md:block"><PageOptions path={path} query={query} options={options} result={result} /></div>
      <div className="hidden md:block"><Pager {...result} noun={noun} hrefFor={(page) => listHref(path, query, { page }, options)} /></div>
      <MobilePager path={path} query={query} options={options} result={result} noun={noun} />
    </div>
  );
}

function MobilePager<Sort extends string>({ path, query, options, result, noun }: {
  path: string;
  query: Query<Sort>;
  options: ListQueryOptions<Sort>;
  result: Omit<ListResult<unknown>, "items">;
  noun: [one: string, many: string];
}) {
  const step = (page: number, label: string, symbol: string, enabled: boolean) => enabled
    ? <Link href={listHref(path, query, { page }, options)} scroll={false} aria-label={label} className={`${SECONDARY} px-3`}>{symbol}</Link>
    : <span aria-hidden="true" className={`${SECONDARY} px-3 opacity-40`}>{symbol}</span>;
  const count = result.total === 0 ? `Nenhum ${noun[0]}` : `${result.from}–${result.to} de ${result.total}`;

  return <nav aria-label="Páginas" data-after-rows className="flex min-h-[var(--control)] items-center justify-between gap-2 border-t border-slate-200 px-2 py-1 text-sm md:hidden">
    <p className="min-w-0 text-slate-600">{count}</p>
    <div className="flex shrink-0 items-center gap-1">
      {result.pages > 1 && step(result.page - 1, "Página anterior", "‹", result.page > 1)}
      <details className="relative">
        <summary className="inline-flex min-h-[var(--control)] cursor-pointer list-none items-center whitespace-nowrap px-2 font-medium text-brand">
          {result.page} de {result.pages}<span className="sr-only">; opções de paginação</span>
        </summary>
        <div className="absolute bottom-[calc(100%+.5rem)] right-0 z-30 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-lg">
          <PageOptions path={path} query={query} options={options} result={result} />
        </div>
      </details>
      {result.pages > 1 && step(result.page + 1, "Próxima página", "›", result.page < result.pages)}
    </div>
  </nav>;
}

function PageOptions<Sort extends string>({ path, query, options, result }: {
  path: string;
  query: Query<Sort>;
  options: ListQueryOptions<Sort>;
  result: Omit<ListResult<unknown>, "items">;
}) {
  return <div className="flex flex-wrap items-end justify-end gap-3 px-3 py-2 text-sm">
    <form method="get" action={path} className="flex items-end gap-2">
      <Criteria query={query} options={options} includeSize={false} />
      <label className="text-xs text-slate-600">Por página
        <select name="porPagina" defaultValue={query.pageSize} className="ml-2 min-h-[var(--control)] rounded-lg border border-slate-300 bg-white px-2 text-sm">
          {LIST_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button className={SECONDARY} type="submit">Aplicar</button>
    </form>
    {result.pages > 1 && <form method="get" action={path} className="flex items-end gap-2">
      <Criteria query={query} options={options} includeSize />
      <label className="text-xs text-slate-600">Ir para página
        <input name="pagina" type="number" min={1} max={result.pages} defaultValue={result.page} className="ml-2 min-h-[var(--control)] w-20 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
      </label>
      <button className={SECONDARY} type="submit">Ir</button>
    </form>}
  </div>;
}

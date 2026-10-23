export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];
export type ListDirection = "asc" | "desc";
export type QueryValue = string | string[] | undefined;
export type QueryRecord = Record<string, QueryValue>;

export type ListQuery<Sort extends string = string> = {
  search: string;
  page: number;
  pageSize: ListPageSize;
  sort: Sort;
  direction: ListDirection;
  filters: Record<string, string[]>;
};

export type ListResult<Row> = {
  items: Row[];
  total: number;
  page: number;
  pageSize: ListPageSize;
  pages: number;
  from: number;
  to: number;
};

export type ListQueryOptions<Sort extends string> = {
  sorts: readonly Sort[];
  defaultSort: Sort;
  defaultDirection?: ListDirection;
  filters?: Record<string, readonly string[]>;
};

export type ListQueryChanges<Sort extends string> = Partial<Omit<ListQuery<Sort>, "filters">> & {
  filters?: Record<string, string[]>;
};

/** Keeps letters introduced by the alphanumeric CNPJ format while removing punctuation. */
export const compactDocumentSearch = (value: string): string => value.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Avoids reading short order codes such as DM09 as document fragments. */
export const orderDocumentSearch = (value: string): string => {
  const compact = compactDocumentSearch(value);
  return /^[\d\s./-]+$/.test(value.trim()) || compact.length >= 8 ? compact : "";
};

const first = (value: QueryValue): string | undefined => (Array.isArray(value) ? value[0] : value);
const all = (value: QueryValue): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

const positivePage = (value: string | undefined): number => (/^[1-9]\d{0,5}$/.test(value ?? "") ? Number(value) : 1);

const pageSize = (value: string | undefined): ListPageSize => {
  const parsed = Number(value);
  return LIST_PAGE_SIZES.includes(parsed as ListPageSize) ? (parsed as ListPageSize) : 25;
};

/** Turns untrusted URL values into the small, explicit query contract accepted by a list. */
export function parseListQuery<Sort extends string>(input: QueryRecord, options: ListQueryOptions<Sort>): ListQuery<Sort> {
  const askedSort = first(input.ordenar);
  const askedDirection = first(input.direcao);
  const filters: Record<string, string[]> = {};

  for (const [key, allowed] of Object.entries(options.filters ?? {})) {
    const values = [...new Set(all(input[key]).filter((value) => allowed.includes(value)))];
    if (values.length > 0) filters[key] = values;
  }

  return {
    search: (first(input.q) ?? "").trim().slice(0, 120),
    page: positivePage(first(input.pagina)),
    pageSize: pageSize(first(input.porPagina)),
    sort: options.sorts.includes(askedSort as Sort) ? (askedSort as Sort) : options.defaultSort,
    direction: askedDirection === "asc" || askedDirection === "desc" ? askedDirection : (options.defaultDirection ?? "asc"),
    filters,
  };
}
/** Builds a stable list address. Changing a criterion returns to page one. */
export function listHref<Sort extends string>(
  path: string,
  current: ListQuery<Sort>,
  changes: ListQueryChanges<Sort>,
  options: ListQueryOptions<Sort>,
): string {
  const criterionChanged = ["search", "pageSize", "sort", "direction", "filters"].some((key) => Object.hasOwn(changes, key));
  const next: ListQuery<Sort> = {
    ...current,
    ...changes,
    filters: changes.filters ?? current.filters,
    page: changes.page ?? (criterionChanged ? 1 : current.page),
  };
  const params = new URLSearchParams();
  if (next.search !== "") params.set("q", next.search);
  if (next.page > 1) params.set("pagina", String(next.page));
  if (next.pageSize !== 25) params.set("porPagina", String(next.pageSize));
  if (next.sort !== options.defaultSort) params.set("ordenar", next.sort);
  if (next.direction !== (options.defaultDirection ?? "asc")) params.set("direcao", next.direction);
  for (const key of Object.keys(options.filters ?? {})) {
    for (const value of next.filters[key] ?? []) params.append(key, value);
  }
  const text = params.toString();
  return text === "" ? path : `${path}?${text}`;
}

/** Metadata for a validated database page. */
export function listResult<Row>(items: Row[], total: number, askedPage: number, size: ListPageSize): ListResult<Row> {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, askedPage));
  const firstIndex = (page - 1) * size;
  return {
    items,
    total,
    page,
    pageSize: size,
    pages,
    from: total === 0 ? 0 : firstIndex + 1,
    to: Math.min(total, firstIndex + items.length),
  };
}

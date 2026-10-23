/** Matches the URL-side NFD normalization used by every operational list. */
export const normalizedSearch = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/**
 * PostgreSQL's normalize() decomposes every Unicode diacritic before the
 * complete combining-mark range is removed. Values such as Muñoz therefore
 * match both "Muñoz" and "Munoz", without requiring a privileged extension.
 */
export const searchableText = (column: string): string =>
  `regexp_replace(normalize(lower(COALESCE(${column}, '')), NFD), U&'[\\0300-\\036f]', '', 'g')`;

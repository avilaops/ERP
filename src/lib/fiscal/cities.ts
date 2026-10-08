import cities from "./municipios.json" with { type: "json" };

/**
 * The code of a city in IBGE, which the invoice asks for and nobody knows by
 * heart: found by the name and the state already in the register. The list is
 * IBGE's (5,571 municipalities, 2026). Accents, case, hyphens and apostrophes
 * do not matter; a name that is not there gives `null`, never a guess.
 */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BY_STATE = new Map(
  Object.entries(cities as Record<string, string[][]>).map(([uf, list]) => [uf, new Map(list.map(([name, code]) => [fold(name), { name, code }]))]),
);

export function findCity(city: string | null, uf: string | null): { name: string; code: string } | null {
  if (!city || !uf) return null;
  return BY_STATE.get(uf)?.get(fold(city)) ?? null;
}

export const cityCode = (city: string | null, uf: string | null): string | null => findCity(city, uf)?.code ?? null;

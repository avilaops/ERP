/**
 * A plate-loaded equipment leaves with pegs for Olympic or for standard plates.
 * Which one is chosen in the order, item by item; the equipment only says that
 * the choice exists.
 */
export const PLATES = [
  ["olimpico", "Olímpico"],
  ["standard", "Standard"],
] as const;

export type Plates = (typeof PLATES)[number][0];

export const isPlates = (value: unknown): value is Plates => PLATES.some(([key]) => key === value);

export const platesLabel = (plates: Plates) => PLATES.find(([key]) => key === plates)![1];

/** `Supino Declinado (anilheiro olímpico)`: the name as the customer, the contract and the warehouse read it. */
export const withPlates = (name: string, plates: Plates | null | undefined) => (plates ? `${name} (anilheiro ${platesLabel(plates).toLowerCase()})` : name);

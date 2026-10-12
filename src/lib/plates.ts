/**
 * What the customer chooses for one equipment of an order, beyond the quantity:
 * pegs for Olympic or for standard plates (only a plate-loaded equipment has
 * them), the colour of the frame and the colour of the swing arm. None of it
 * changes the price; all of it says what leaves the warehouse.
 */
export const PLATES = [
  ["olimpico", "Olímpico"],
  ["standard", "Standard"],
] as const;

export type Plates = (typeof PLATES)[number][0];

export const isPlates = (value: unknown): value is Plates => PLATES.some(([key]) => key === value);

export const platesLabel = (plates: Plates) => PLATES.find(([key]) => key === plates)![1];

/** The parts of an equipment that take a colour, with the name the screens give them. */
export const COLOR_PARTS = [
  ["estrutura", "Estrutura"],
  ["braco", "Braço articulado"],
] as const;

export type ColorPart = (typeof COLOR_PARTS)[number][0];

export const isColorPart = (value: unknown): value is ColorPart => COLOR_PARTS.some(([key]) => key === value);

export type ItemOptions = { plates?: Plates | null; frameColor?: string | null; armColor?: string | null };

/** `anilheiro olímpico, estrutura Piano Black, braço Ocean Blue`, with what was chosen; empty when nothing was. */
export const optionsText = ({ plates, frameColor, armColor }: ItemOptions) =>
  [plates ? `anilheiro ${platesLabel(plates).toLowerCase()}` : null, frameColor ? `estrutura ${frameColor}` : null, armColor ? `braço ${armColor}` : null].filter(Boolean).join(", ");

/** `Supino Declinado (anilheiro olímpico, estrutura Piano Black)`: the name as the customer, the contract and the warehouse read it. */
export const withOptions = (name: string, options: ItemOptions) => (optionsText(options) ? `${name} (${optionsText(options)})` : name);

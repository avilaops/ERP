export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/** 512 KB: the same limit the table has. A logo for the menu is far smaller than this. */
export const LOGO_MAX_BYTES = 512 * 1024;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * What the file really is, by its first bytes. The name and the type the browser
 * sends are not trusted. SVG is left out on purpose: it can carry script.
 */
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Why the file cannot be the logo, or `null` when it can. */
export function logoProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "Escolha o arquivo da logo.";
  if (bytes.length > LOGO_MAX_BYTES) return "A logo passa de 512 KB. Envie uma imagem menor.";
  if (detectLogoType(bytes) === null) return "Envie a logo em PNG, JPEG ou WebP.";
  return null;
}

import { createHash } from "node:crypto";
import sharp from "sharp";

/** The server has 4 GB: one image at a time, and no cache of decoded files. */
sharp.concurrency(1);
sharp.cache(false);

/** Largest file accepted, before anything is decoded. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Largest image accepted, in pixels (width × height). */
export const MAX_INPUT_PIXELS = 50_000_000;
/** The stored photo fits in a square of this side. */
export const MAX_SIDE = 1200;
/** The stored photo never passes this size (the table refuses more). */
export const MAX_STORED_BYTES = 1024 * 1024;

export const FORMAT_MESSAGE = "Formato de imagem não aceito: use JPG, PNG ou WebP.";
export const UNREADABLE_MESSAGE = "Não foi possível ler a imagem.";
export const TOO_LARGE_MESSAGE = "Imagem grande demais: o limite é 15 MB.";
export const TOO_MANY_PIXELS_MESSAGE = "Imagem com pixels demais: o limite é 50 megapixels. Reduza a foto e envie de novo.";
export const TOO_HEAVY_MESSAGE = "A foto não coube em 1 MB depois de reduzida. Envie uma foto com menos detalhe ou menor.";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PhotoError extends Error {}

export type NormalizedPhoto = {
  /** JPEG, without metadata. */
  bytes: Buffer;
  width: number;
  height: number;
  /** Hexadecimal hash of `bytes`. */
  sha256: string;
};

type Format = "jpeg" | "png" | "webp";

const startsWith = (input: Uint8Array, bytes: number[], offset = 0) =>
  input.length >= offset + bytes.length && bytes.every((byte, index) => input[offset + index] === byte);

/** The format by the first bytes of the file. The name and the Content-Type say nothing here. */
export function sniffFormat(input: Uint8Array): Format | null {
  if (startsWith(input, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" …… "WEBP"
  if (startsWith(input, [0x52, 0x49, 0x46, 0x46]) && startsWith(input, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/** Tried in order until the photo fits in MAX_STORED_BYTES. Almost every photo stops at the first. */
const QUALITIES = [82, 70, 55];

/**
 * The photo as it is stored: turned upright by its EXIF orientation, reduced to
 * fit MAX_SIDE × MAX_SIDE (never enlarged, never distorted), white where it was
 * transparent, re-encoded as JPEG with no metadata. The same input gives the
 * same output. Throws `PhotoError`, in Portuguese, for anything it refuses.
 */
export async function normalizePhoto(input: Uint8Array): Promise<NormalizedPhoto> {
  if (input.length > MAX_UPLOAD_BYTES) throw new PhotoError(TOO_LARGE_MESSAGE);
  if (sniffFormat(input) === null) throw new PhotoError(FORMAT_MESSAGE);

  try {
    // Only the header is read here: the size is known before a pixel is decoded.
    const { width = 0, height = 0 } = await sharp(input, { limitInputPixels: false }).metadata();
    if (width * height > MAX_INPUT_PIXELS) throw new PhotoError(TOO_MANY_PIXELS_MESSAGE);

    for (const quality of QUALITIES) {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_STORED_BYTES) {
        return {
          bytes: data,
          width: info.width,
          height: info.height,
          sha256: createHash("sha256").update(data).digest("hex"),
        };
      }
    }
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(UNREADABLE_MESSAGE);
  }
  throw new PhotoError(TOO_HEAVY_MESSAGE);
}

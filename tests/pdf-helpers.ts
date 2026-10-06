import { inflateSync } from "node:zlib";

const WIN_ANSI = new TextDecoder("windows-1252");

export type PdfPiece = { text: string; x: number; y: number };

/**
 * Every piece of text drawn in a PDF made by `renderQuotePdf`, with where it
 * starts. The server has no `pdftotext`: this inflates every stream of the file
 * and reads the text operators (`… x y Tm <hex> Tj`), which the standard fonts
 * write in WinAnsi.
 */
export function pdfPieces(bytes: Uint8Array): PdfPiece[] {
  const raw = Buffer.from(bytes);
  const pieces: PdfPiece[] = [];
  let from = 0;
  for (;;) {
    const start = raw.indexOf("stream\n", from);
    if (start < 0) break;
    const end = raw.indexOf("endstream", start);
    from = end + 9;
    let content: string;
    try {
      content = inflateSync(raw.subarray(start + 7, end)).toString("latin1");
    } catch {
      continue; // An image: not a deflated stream.
    }
    for (const [, x, y, hex] of content.matchAll(/([\d.]+) ([\d.]+) Tm\s*<([0-9A-Fa-f]+)>\s*Tj/g)) {
      pieces.push({ text: WIN_ANSI.decode(Buffer.from(hex, "hex")), x: Number(x), y: Number(y) });
    }
  }
  return pieces;
}

/** The text of the PDF, one drawn piece per line. */
export const pdfText = (bytes: Uint8Array): string => pdfPieces(bytes).map((piece) => piece.text).join("\n");

/** How many images the file carries. */
export function pdfImages(bytes: Uint8Array): number {
  return Buffer.from(bytes).toString("latin1").split("/Subtype /Image").length - 1;
}

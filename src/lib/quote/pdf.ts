import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import type { QuoteDocument, QuoteItem } from "@/lib/quote/document";

/** A4 upright, in points. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;
/** Nothing of the body is drawn below this line: the footer lives under it. */
const BODY_BOTTOM = MARGIN + 26;

/** The square the photo of an item fits in. */
const PHOTO_BOX = 56;
const ROW_PADDING = 6;
const ROW_MIN_HEIGHT = PHOTO_BOX + 2 * ROW_PADDING;
const DESCRIPTION_MAX_LINES = 3;
/** The box the logo fits in, at the top left. */
const LOGO_BOX = { width: 170, height: 48 };

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const SHADE = rgb(0.95, 0.96, 0.97);

type Fonts = { regular: PDFFont; bold: PDFFont };

export type QuoteAssets = {
  /** The company's logo as PNG, or `null`: the name is written in its place. */
  logo: Uint8Array | null;
  /** The photo of each product, as a JPEG already reduced. A product without one gets an empty frame. */
  photos: Map<number, Uint8Array>;
};

/**
 * Text the standard fonts can draw: line breaks and tabs become a space, and a
 * character outside WinAnsi (emoji, arrow, ideogram) becomes `?` instead of
 * bringing the whole file down.
 */
function drawable(text: string, font: PDFFont): string {
  const known = new Set(font.getCharacterSet());
  return [...text.normalize("NFC").replace(/\s+/g, " ").trim()].map((char) => (known.has(char.codePointAt(0) ?? 0) ? char : "?")).join("");
}

/** The text in lines no wider than `width`. A word wider than the column is cut by letter. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (line: string) => font.widthOfTextAtSize(line, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const joined = line === "" ? word : `${line} ${word}`;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line !== "") lines.push(line);
    line = "";
    for (const char of word) {
      if (line !== "" && !fits(line + char)) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** At most `max` lines; when something is left out, the last one ends in "…". */
function clamp(lines: string[], max: number, font: PDFFont, size: number, width: number): string[] {
  if (lines.length <= max) return lines;
  let last = lines[max - 1];
  while (last !== "" && font.widthOfTextAtSize(`${last}…`, size) > width) last = last.slice(0, -1);
  return [...lines.slice(0, max - 1), `${last.trimEnd()}…`];
}

type Column = { label: string; width: number; value: (item: QuoteItem) => string; bold: boolean };

const HEAD_SIZE = 7;
const VALUE_SIZE = 8;
/** Room between one numeric column and the next. */
const COLUMN_GAP = 10;

/**
 * The numeric columns, left to right, each as wide as its widest value: a large
 * amount never runs over its neighbour. The one of the discount exists only
 * when the order has a discount.
 */
function numericColumns(document: QuoteDocument, fonts: Fonts): Column[] {
  const columns: (Omit<Column, "width" | "bold"> & { bold?: boolean })[] = [
    { label: "Qtd", value: (item) => String(item.quantity) },
    { label: "Unit. s/ IPI", value: (item) => item.unitPrice },
    ...(document.hasDiscount ? [{ label: "Desconto", value: (item: QuoteItem) => item.unitDiscount ?? "" }] : []),
    { label: "IPI unit.", value: (item) => item.unitIpi },
    { label: "Unit. c/ IPI", value: (item) => item.unitWithIpi },
    { label: "Total c/ IPI", value: (item) => item.totalWithIpi, bold: true },
  ];
  return columns.map(({ label, value, bold = false }) => {
    const font = bold ? fonts.bold : fonts.regular;
    const widest = Math.max(
      fonts.bold.widthOfTextAtSize(label.toUpperCase(), HEAD_SIZE),
      ...document.items.map((item) => font.widthOfTextAtSize(drawable(value(item), font), VALUE_SIZE)),
    );
    return { label, value, bold, width: Math.ceil(widest) + COLUMN_GAP };
  });
}

/** `DD/MM/AAAA` as a moment that is the same day in any time zone. */
function dateOf(text: string): Date {
  const [day, month, year] = text.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/**
 * The quotation as a PDF. Draws only what `document` carries: no database, no
 * session, no clock. The same input gives the same bytes.
 */
export async function renderQuotePdf(document: QuoteDocument, { logo, photos }: QuoteAssets): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const issued = dateOf(document.issuedOn);
  pdf.setTitle(document.title);
  pdf.setAuthor(document.company);
  pdf.setCreator("ERP");
  pdf.setCreationDate(issued);
  pdf.setModificationDate(issued);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const clean = (text: string) => drawable(text, fonts.regular);

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  /** Top of what comes next, going down the page. */
  let y = PAGE.height - MARGIN;

  const write = (
    text: string,
    x: number,
    baseline: number,
    { size = 9, bold = false, color = INK, align = "left" as "left" | "right" } = {},
  ) => {
    const font = bold ? fonts.bold : fonts.regular;
    const shown = clean(text);
    if (shown === "") return;
    page.drawText(shown, { x: align === "right" ? x - font.widthOfTextAtSize(shown, size) : x, y: baseline, size, font, color });
  };
  const rule = (at: number, color = RULE) =>
    page.drawLine({ start: { x: MARGIN, y: at }, end: { x: PAGE.width - MARGIN, y: at }, thickness: 0.6, color });
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  /** Wrapped text from `y` down, one page break at a time. */
  const paragraph = (text: string, { size = 9, bold = false, color = INK, x = MARGIN, width = CONTENT_WIDTH } = {}) => {
    const leading = size + 3;
    for (const line of wrap(clean(text), bold ? fonts.bold : fonts.regular, size, width)) {
      if (y - leading < BODY_BOTTOM) newPage();
      write(line, x, y - size, { size, bold, color });
      y -= leading;
    }
  };

  // Header: the logo (or the company's name) on the left; title, issue and validity on the right.
  const right = PAGE.width - MARGIN;
  if (logo) {
    const image = await pdf.embedPng(logo);
    const { width, height } = image.scaleToFit(LOGO_BOX.width, LOGO_BOX.height);
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
  } else {
    write(document.company, MARGIN, y - 18, { size: 16, bold: true });
  }
  write(document.title, right, y - 15, { size: 15, bold: true, align: "right" });
  write(`Emissão: ${document.issuedOn}`, right, y - 30, { color: MUTED, align: "right" });
  write(`Validade: ${document.validUntil}`, right, y - 42, { color: MUTED, align: "right" });
  y -= LOGO_BOX.height + 10;
  rule(y);
  y -= 14;

  // Seller and customer, side by side.
  const half = CONTENT_WIDTH / 2;
  const block = (title: string, lines: (string | null)[], x: number): number => {
    let at = y;
    write(title.toUpperCase(), x, at - 7, { size: 7, bold: true, color: MUTED });
    at -= 12;
    lines
      .filter((line) => line !== null && line.trim() !== "")
      .forEach((line, index) => {
        const size = 9;
        for (const piece of wrap(clean(line ?? ""), index === 0 ? fonts.bold : fonts.regular, size, half - 12)) {
          write(piece, x, at - size, { size, bold: index === 0 });
          at -= size + 3;
        }
      });
    return at;
  };
  const { customer, seller } = document;
  const afterSeller = block("Vendedor", [seller.name, seller.email], MARGIN);
  const afterCustomer = customer
    ? block(
        "Cliente",
        [
          customer.name,
          customer.tradeName,
          customer.document,
          customer.contactName && `Contato: ${customer.contactName}`,
          [customer.phone, customer.email].filter(Boolean).join(" · "),
          customer.cityUf,
        ],
        MARGIN + half,
      )
    : block("Cliente", ["Cliente: a informar"], MARGIN + half);
  y = Math.min(afterSeller, afterCustomer) - 10;

  // Items: photo, what the equipment is, and the values.
  const numeric = numericColumns(document, fonts);
  const numericWidth = numeric.reduce((total, column) => total + column.width, 0);
  const textX = MARGIN + PHOTO_BOX + 10;
  // What is left for the name and the description; never so narrow that a word has no room.
  const textWidth = Math.max(80, CONTENT_WIDTH - (PHOTO_BOX + 10) - numericWidth - 6);
  const numericX = PAGE.width - MARGIN - numericWidth;
  const HEAD_HEIGHT = 18;

  const tableHead = () => {
    page.drawRectangle({ x: MARGIN, y: y - HEAD_HEIGHT, width: CONTENT_WIDTH, height: HEAD_HEIGHT, color: SHADE });
    write("EQUIPAMENTO", MARGIN + 4, y - 12, { size: 7, bold: true, color: MUTED });
    let edge = numericX;
    for (const column of numeric) {
      edge += column.width;
      write(column.label.toUpperCase(), edge - 3, y - 12, { size: HEAD_SIZE, bold: true, color: MUTED, align: "right" });
    }
    y -= HEAD_HEIGHT;
  };

  const embedded = new Map<number, PDFImage>();
  for (const item of document.items) {
    const bytes = photos.get(item.productId);
    if (bytes && !embedded.has(item.productId)) embedded.set(item.productId, await pdf.embedJpg(bytes));
  }

  tableHead();
  for (const item of document.items) {
    const name = wrap(clean(item.name), fonts.bold, 9, textWidth);
    const description = item.description
      ? clamp(wrap(clean(item.description), fonts.regular, 8, textWidth), DESCRIPTION_MAX_LINES, fonts.regular, 8, textWidth)
      : [];
    const textHeight = (item.code === "" ? 0 : 10) + name.length * 11 + description.length * 10;
    const height = Math.max(ROW_MIN_HEIGHT, textHeight + 2 * ROW_PADDING);

    // A row never splits: it goes whole to the next page, under the head again.
    if (y - height < BODY_BOTTOM) {
      newPage();
      tableHead();
    }

    const frame = { x: MARGIN, y: y - ROW_PADDING - PHOTO_BOX };
    const photo = embedded.get(item.productId);
    if (photo) {
      const { width, height: tall } = photo.scaleToFit(PHOTO_BOX, PHOTO_BOX);
      page.drawImage(photo, { x: frame.x + (PHOTO_BOX - width) / 2, y: frame.y + (PHOTO_BOX - tall) / 2, width, height: tall });
    }
    page.drawRectangle({ ...frame, width: PHOTO_BOX, height: PHOTO_BOX, borderColor: RULE, borderWidth: 0.5 });

    let at = y - ROW_PADDING;
    if (item.code !== "") {
      write(item.code, textX, at - 7.5, { size: 7.5, color: MUTED });
      at -= 10;
    }
    for (const line of name) {
      write(line, textX, at - 9, { bold: true });
      at -= 11;
    }
    for (const line of description) {
      write(line, textX, at - 8, { size: 8, color: MUTED });
      at -= 10;
    }

    let edge = numericX;
    for (const column of numeric) {
      edge += column.width;
      write(column.value(item), edge - 3, y - ROW_PADDING - 9, { size: VALUE_SIZE, bold: column.bold, align: "right" });
    }
    y -= height;
    rule(y);
  }

  // Totals, kept together.
  const totalsHeight = 16 + document.totals.reduce((total, row) => total + (row.strong ? 24 : 14), 0);
  if (y - totalsHeight < BODY_BOTTOM) newPage();
  y -= 12;
  write(`${document.units} un.`, MARGIN, y - 9, { color: MUTED });
  const labelX = right - 230;
  for (const row of document.totals) {
    if (row.strong) {
      y -= 6;
      page.drawLine({ start: { x: labelX, y }, end: { x: right, y }, thickness: 0.6, color: RULE });
      write(row.label, labelX, y - 16, { size: 11, bold: true });
      write(row.value, right, y - 17, { size: 14, bold: true, align: "right" });
      y -= 18;
    } else {
      write(row.label, labelX, y - 9, { color: MUTED });
      write(row.value, right, y - 9, { align: "right" });
      y -= 14;
    }
  }
  y -= 16;

  // Delivery, production time and notes, when there are any.
  const conditions: [string, string | null][] = [
    ["Entrega", document.delivery],
    ["Prazo de fabricação", document.production],
    ["Observações", document.notes],
  ];
  for (const [label, value] of conditions) {
    if (value === null) continue;
    paragraph(`${label}: ${value}`);
    y -= 3;
  }

  // Footer, once the number of pages is known.
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    page = sheet;
    rule(MARGIN + 14);
    write(`Valores válidos até ${document.validUntil}.`, MARGIN, MARGIN + 2, { size: 8, color: MUTED });
    write(`Página ${index + 1} de ${pages.length}`, right, MARGIN + 2, { size: 8, color: MUTED, align: "right" });
  });

  return pdf.save();
}

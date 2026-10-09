import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { drawable, wrap } from "@/lib/quote/pdf";

/** A4 upright, in points. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;
/** Nothing of the body is drawn below this line: the footer lives under it. */
const BODY_BOTTOM = MARGIN + 24;
const LOGO_BOX = { width: 170, height: 48 };

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const SHADE = rgb(0.95, 0.96, 0.97);

/** The contract in text, ready to be drawn. */
export type ContractDocument = {
  company: string;
  /** `Contrato de compra e venda`. */
  title: string;
  /** `261008-RUZL-1`. */
  number: string;
  /**
   * The text as the customer reads it, already with the values of the order.
   * A line that starts with `# ` is a heading, one with `- ` an item of a list,
   * an empty one separates paragraphs.
   */
  body: string;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

/** One sheet being written from the top down, opening the next when the text reaches the foot. */
function writer(pdf: PDFDocument, fonts: Fonts, first?: PDFPage) {
  let page = first ?? pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const state = {
    get page() {
      return page;
    },
    get y() {
      return y;
    },
    set y(value: number) {
      y = value;
    },
    newPage() {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    },
    /** Room for `height` more points on this sheet, or the next one. */
    need(height: number) {
      if (y - height < BODY_BOTTOM) state.newPage();
    },
    write(text: string, x: number, baseline: number, { size = 10, bold = false, color = INK, align = "left" as "left" | "right" } = {}) {
      const font = bold ? fonts.bold : fonts.regular;
      const shown = drawable(text, font);
      if (shown === "") return;
      page.drawText(shown, { x: align === "right" ? x - font.widthOfTextAtSize(shown, size) : x, y: baseline, size, font, color });
    },
    /** Wrapped text from `y` down. */
    paragraph(text: string, { size = 10, bold = false, color = INK, x = MARGIN, width = CONTENT_WIDTH, leading }: { size?: number; bold?: boolean; color?: typeof INK; x?: number; width?: number; leading?: number } = {}) {
      leading ??= size + 4;
      const font = bold ? fonts.bold : fonts.regular;
      for (const line of wrap(drawable(text, font), font, size, width)) {
        state.need(leading);
        state.write(line, x, y - size, { size, bold, color });
        y -= leading;
      }
    },
    rule() {
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.6, color: RULE });
    },
  };
  return state;
}

/** The foot of every sheet: whose contract it is and which sheet of how many. */
function footers(pdf: PDFDocument, fonts: Fonts, label: string, from = 0) {
  const pages = pdf.getPages().slice(from);
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE.width - MARGIN, y: MARGIN + 12 }, thickness: 0.6, color: RULE });
    page.drawText(drawable(label, fonts.regular), { x: MARGIN, y: MARGIN, size: 7.5, font: fonts.regular, color: MUTED });
    const count = `Página ${index + 1} de ${pages.length}`;
    page.drawText(count, { x: PAGE.width - MARGIN - fonts.regular.widthOfTextAtSize(count, 7.5), y: MARGIN, size: 7.5, font: fonts.regular, color: MUTED });
  });
}

/**
 * The contract as a PDF: the logo (or the company's name), the title with its
 * number and the text. This is the file whose fingerprint the signatures name;
 * it is drawn once, when the contract is sent, and kept.
 */
export async function renderContractPdf(document: ContractDocument, logo: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${document.title} nº ${document.number}`);
  pdf.setAuthor(document.company);
  // A fixed moment: the same contract drawn twice is the same file.
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const fonts: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const sheet = writer(pdf, fonts);

  if (logo) {
    const image = await pdf.embedPng(logo);
    const { width, height } = image.scaleToFit(LOGO_BOX.width, LOGO_BOX.height);
    sheet.page.drawImage(image, { x: MARGIN, y: sheet.y - height, width, height });
  } else {
    sheet.write(document.company, MARGIN, sheet.y - 18, { size: 16, bold: true });
  }
  sheet.write(`Nº ${document.number}`, PAGE.width - MARGIN, sheet.y - 16, { size: 10, color: MUTED, align: "right" });
  sheet.y -= LOGO_BOX.height + 14;
  sheet.rule();
  sheet.y -= 22;
  sheet.paragraph(document.title.toUpperCase(), { size: 14, bold: true, leading: 19 });
  sheet.y -= 8;

  for (const raw of document.body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      sheet.y -= 6;
    } else if (line.startsWith("# ")) {
      // A heading never stays alone at the foot of a sheet.
      sheet.need(46);
      sheet.y -= 6;
      sheet.paragraph(line.slice(2).toUpperCase(), { size: 10.5, bold: true, leading: 16 });
    } else if (line.startsWith("- ")) {
      sheet.need(14);
      sheet.write("•", MARGIN + 4, sheet.y - 10);
      sheet.paragraph(line.slice(2), { x: MARGIN + 16, width: CONTENT_WIDTH - 16 });
    } else {
      sheet.paragraph(line);
    }
  }

  footers(pdf, fonts, `${document.company} · ${document.title} nº ${document.number}`);
  return pdf.save({ useObjectStreams: false });
}

/** One person who signed, as the record prints it. */
export type EvidenceSigner = {
  /** `Comprador(a)` or the person's profile in the company. */
  party: string;
  name: string;
  /** CPF, with its punctuation; the company's people sign with their account and have none here. */
  document: string | null;
  email: string;
  /** `08/10/2026 15:21`, São Paulo. */
  at: string;
  ip: string | null;
  /** How the person proved who they are. */
  method: string;
};

export type ContractEvidence = {
  company: string;
  title: string;
  number: string;
  /** SHA-256 of the contract's PDF as sent. */
  sha256: string;
  /** `Assinado pelo cliente em 08/10/2026 15:21`, `Aguardando a assinatura do cliente`... */
  standing: string;
  signers: EvidenceSigner[];
  /** Everything that happened, the oldest first. */
  events: { at: string; text: string; ip: string | null }[];
};

/**
 * The contract followed by its record of signatures: who signed, when, from
 * which network address and how they proved who they are, plus the fingerprint
 * of the file they signed. The sheets of the contract are not touched.
 */
export async function withEvidence(contract: Uint8Array, evidence: ContractEvidence): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(contract);
  // The sheets of the contract already carry their own foot: only the record's are numbered here.
  const sheets = pdf.getPageCount();
  const fonts: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const sheet = writer(pdf, fonts, pdf.addPage([PAGE.width, PAGE.height]));
  const small = { size: 8.5, leading: 12 };

  sheet.paragraph("REGISTRO DE ASSINATURAS ELETRÔNICAS", { size: 13, bold: true, leading: 18 });
  sheet.y -= 4;
  sheet.paragraph(`${evidence.title} nº ${evidence.number} · ${evidence.company}`, { color: MUTED });
  sheet.y -= 6;
  sheet.rule();
  sheet.y -= 14;

  sheet.paragraph("Documento", { size: 9.5, bold: true });
  sheet.paragraph(`Situação: ${evidence.standing}`, small);
  sheet.paragraph("Impressão digital (SHA-256) do contrato assinado, sem esta folha de registro:", small);
  sheet.paragraph(evidence.sha256, { ...small, bold: true });
  sheet.y -= 12;

  sheet.paragraph("Assinaturas", { size: 9.5, bold: true });
  if (evidence.signers.length === 0) sheet.paragraph("Nenhuma assinatura registrada até agora.", { ...small, color: MUTED });
  for (const signer of evidence.signers) {
    const lines = [
      `${signer.name}${signer.document ? ` · CPF ${signer.document}` : ""}`,
      `E-mail: ${signer.email}`,
      `Assinou em ${signer.at} (horário de Brasília)${signer.ip ? ` · Endereço de rede (IP): ${signer.ip}` : ""}`,
      `Como se identificou: ${signer.method}`,
    ];
    const height = 18 + lines.length * small.leading + 10;
    sheet.need(height + 6);
    sheet.y -= 6;
    sheet.page.drawRectangle({ x: MARGIN, y: sheet.y - height, width: CONTENT_WIDTH, height, color: SHADE });
    sheet.y -= 8;
    sheet.paragraph(signer.party.toUpperCase(), { size: 7.5, bold: true, color: MUTED, x: MARGIN + 10, width: CONTENT_WIDTH - 20, leading: 12 });
    lines.forEach((line, index) => sheet.paragraph(line, { ...small, bold: index === 0, x: MARGIN + 10, width: CONTENT_WIDTH - 20 }));
    sheet.y -= 10;
  }
  sheet.y -= 12;

  sheet.need(40);
  sheet.paragraph("Histórico", { size: 9.5, bold: true });
  for (const event of evidence.events) {
    sheet.paragraph(`${event.at} · ${event.text}${event.ip ? ` · IP ${event.ip}` : ""}`, small);
  }
  sheet.y -= 12;
  sheet.paragraph(
    "Assinatura eletrônica nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. Os horários são os do servidor, no fuso de Brasília. Este registro é gerado pelo sistema da empresa vendedora a partir do que ficou gravado em cada passo.",
    { size: 7.5, color: MUTED, leading: 10.5 },
  );

  footers(pdf, fonts, `${evidence.company} · Registro de assinaturas do contrato nº ${evidence.number}`, sheets);
  return pdf.save({ useObjectStreams: false });
}

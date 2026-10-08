import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { formatCep, formatDocument, formatPhone } from "@/lib/customer";
import { code128cWidths } from "@/lib/fiscal/barcode";

/**
 * The DANFE: the printed companion of an NF-e. It is drawn from the XML of the
 * invoice itself, never from the order, so the paper always says what the file
 * says. Without a protocol (a conference, or an invoice not authorised yet) and
 * in homologation it is stamped as having no fiscal value.
 */

export type DanfeItem = {
  code: string; name: string; ncm: string; taxCode: string; cfop: string; unit: string;
  quantity: number; unitPrice: number; total: number; icmsBase: number; icms: number; ipi: number; icmsRate: number; ipiRate: number;
};
type Party = { name: string; document: string; registration: string; street: string; district: string; cep: string; city: string; uf: string; phone: string };
export type DanfeData = {
  key: string; number: string; series: string; issuedAt: string; nature: string; homologation: boolean;
  protocol: string | null; authorizedAt: string | null;
  issuer: Party; recipient: Party;
  items: DanfeItem[];
  totals: { icmsBase: number; icms: number; products: number; freight: number; discount: number; ipi: number; invoice: number; difal: number; fcp: number };
  freightMode: string; info: string;
};

const block = (xml: string, name: string) => new RegExp(`<${name}[ >][\\s\\S]*?</${name}>`).exec(xml)?.[0] ?? "";
const unescape = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const value = (xml: string, name: string) => unescape(new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? "");
const number = (xml: string, name: string) => Number(value(xml, name) || 0);

function party(xml: string, address: string): Party {
  const place = block(xml, address);
  return {
    name: value(xml, "xNome"),
    document: value(xml, "CNPJ") || value(xml, "CPF"),
    registration: value(xml.replace(place, ""), "IE"),
    street: [value(place, "xLgr"), value(place, "nro"), value(place, "xCpl")].filter(Boolean).join(", "),
    district: value(place, "xBairro"),
    cep: value(place, "CEP"),
    city: value(place, "xMun"),
    uf: value(place, "UF"),
    phone: value(place, "fone"),
  };
}

/** What the paper shows, read from the XML of the invoice (signed or not, with or without the protocol). */
export function danfeData(xml: string): DanfeData {
  const key = /Id="NFe(\d{44})"/.exec(xml)?.[1];
  if (!key) throw new Error("O XML não é de uma NF-e deste sistema.");
  const ide = block(xml, "ide");
  const totals = block(xml, "ICMSTot");
  const protocol = block(xml, "protNFe");
  const items = [...xml.matchAll(/<det nItem="\d+">[\s\S]*?<\/det>/g)].map(([item]) => {
    const icms = block(item, "ICMS");
    const ipi = block(item, "IPI");
    return {
      code: value(item, "cProd"), name: value(item, "xProd"), ncm: value(item, "NCM"),
      taxCode: `${value(icms, "orig")}${value(icms, "CST") || value(icms, "CSOSN")}`,
      cfop: value(item, "CFOP"), unit: value(item, "uCom"), quantity: number(item, "qCom"), unitPrice: number(item, "vUnCom"), total: number(item, "vProd"),
      icmsBase: number(icms, "vBC"), icms: number(icms, "vICMS"), icmsRate: number(icms, "pICMS"), ipi: number(ipi, "vIPI"), ipiRate: number(ipi, "pIPI"),
    };
  });
  return {
    key, number: value(ide, "nNF"), series: value(ide, "serie"), issuedAt: value(ide, "dhEmi"), nature: value(ide, "natOp"), homologation: value(ide, "tpAmb") === "2",
    protocol: value(protocol, "nProt") || null, authorizedAt: value(protocol, "dhRecbto") || null,
    issuer: party(block(xml, "emit"), "enderEmit"), recipient: party(block(xml, "dest"), "enderDest"),
    items,
    totals: {
      icmsBase: number(totals, "vBC"), icms: number(totals, "vICMS"), products: number(totals, "vProd"), freight: number(totals, "vFrete"), discount: number(totals, "vDesc"),
      ipi: number(totals, "vIPI"), invoice: number(totals, "vNF"), difal: number(totals, "vICMSUFDest"), fcp: number(totals, "vFCPUFDest"),
    },
    freightMode: value(block(xml, "transp"), "modFrete"), info: value(block(xml, "infAdic"), "infCpl"),
  };
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 22;
const WIDTH = PAGE.width - 2 * MARGIN;
const INK = rgb(0, 0, 0);
const GRAY = rgb(0.86, 0.86, 0.86);
const FREIGHT: Record<string, string> = { "0": "0 - Por conta do remetente", "1": "1 - Por conta do destinatário", "2": "2 - Por conta de terceiros", "9": "9 - Sem frete" };

const money = (amount: number) => amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 19)}` : "");
const formattedKey = (key: string) => key.match(/\d{4}/g)!.join(" ");

/** Rows of the table of items that fit on the first page and on the following ones. */
const ROW = 17;

export async function renderDanfe(data: DanfeData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`DANFE ${data.number}`);
  pdf.setCreator("ERP");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const known = new Set(regular.getCharacterSet());
  const clean = (text: string) => [...text.normalize("NFC").replace(/\s+/g, " ").trim()].map((char) => (known.has(char.codePointAt(0) ?? 0) ? char : "?")).join("");
  const fit = (text: string, font: PDFFont, size: number, width: number) => {
    let shown = clean(text);
    while (shown !== "" && font.widthOfTextAtSize(shown, size) > width) shown = shown.slice(0, -1);
    return shown;
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number, maxLines: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(text).split(" ").filter(Boolean)) {
      const joined = line === "" ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(joined, size) <= width) line = joined;
      else {
        if (line !== "") lines.push(line);
        line = fit(word, font, size, width);
      }
    }
    if (line !== "") lines.push(line);
    return lines.slice(0, maxLines);
  };

  let page!: PDFPage;
  const box = (x: number, top: number, width: number, height: number) => page.drawRectangle({ x, y: top - height, width, height, borderColor: INK, borderWidth: 0.5 });
  const text = (content: string, x: number, baseline: number, size: number, font = regular, align: "left" | "right" | "center" = "left", width = 0) => {
    const shown = width > 0 ? fit(content, font, size, width - 4) : clean(content);
    if (shown === "") return;
    const length = font.widthOfTextAtSize(shown, size);
    page.drawText(shown, { x: align === "right" ? x + width - 2 - length : align === "center" ? x + (width - length) / 2 : x, y: baseline, size, font, color: INK });
  };
  /** A cell of the form: tiny label on top, the value under it. */
  const field = (label: string, content: string, x: number, top: number, width: number, height = 22, align: "left" | "right" = "left") => {
    box(x, top, width, height);
    text(label, x + 2, top - 6.5, 5, regular);
    text(content, align === "right" ? x : x + 2, top - height + 5, 8.5, regular, align, align === "right" ? width : width - 2);
  };
  const heading = (label: string, top: number) => text(label, MARGIN, top - 7, 6, bold);
  /** One row of cells, each a fraction of the width. Returns the top of what comes next. */
  const row = (top: number, cells: [string, string, number, ("left" | "right")?][], height = 22) => {
    let x = MARGIN;
    for (const [label, content, share, align] of cells) {
      field(label, content, x, top, WIDTH * share, height, align ?? "left");
      x += WIDTH * share;
    }
    return top - height;
  };

  const COLUMNS: [string, number, "left" | "right"][] = [
    ["CÓDIGO", 0.08, "left"], ["DESCRIÇÃO DO PRODUTO", 0.255, "left"], ["NCM", 0.07, "left"], ["CST", 0.04, "left"], ["CFOP", 0.045, "left"], ["UN", 0.035, "left"],
    ["QTD", 0.055, "right"], ["V. UNIT.", 0.075, "right"], ["V. TOTAL", 0.08, "right"], ["BC ICMS", 0.075, "right"], ["V. ICMS", 0.06, "right"], ["V. IPI", 0.055, "right"],
    ["% ICMS", 0.04, "right"], ["% IPI", 0.035, "right"],
  ];

  const header = (pageNumber: number, pages: number) => {
    const top = PAGE.height - MARGIN;
    const height = 84;
    const left = WIDTH * 0.4;
    const middle = WIDTH * 0.16;
    box(MARGIN, top, left, height);
    wrap(data.issuer.name, bold, 10, left - 8, 2).forEach((line, index) => text(line, MARGIN + 4, top - 14 - index * 11, 10, bold));
    [data.issuer.street, [data.issuer.district, formatCep(data.issuer.cep)].filter(Boolean).join(" - "), `${data.issuer.city} - ${data.issuer.uf}`, data.issuer.phone ? `Fone: ${formatPhone(data.issuer.phone)}` : ""]
      .filter(Boolean)
      .forEach((line, index) => text(line, MARGIN + 4, top - 40 - index * 9, 7.5, regular, "left", left - 4));

    const mx = MARGIN + left;
    box(mx, top, middle, height);
    text("DANFE", mx, top - 14, 12, bold, "center", middle);
    text("Documento Auxiliar da", mx, top - 23, 6, regular, "center", middle);
    text("Nota Fiscal Eletrônica", mx, top - 30, 6, regular, "center", middle);
    text("0 - ENTRADA", mx + 6, top - 42, 6.5);
    text("1 - SAÍDA", mx + 6, top - 50, 6.5);
    box(mx + middle - 22, top - 36, 14, 16);
    text("1", mx + middle - 22, top - 48, 10, bold, "center", 14);
    text(`Nº ${data.number.padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.")}`, mx, top - 62, 8, bold, "center", middle);
    text(`SÉRIE ${data.series.padStart(3, "0")}`, mx, top - 71, 8, bold, "center", middle);
    text(`FOLHA ${pageNumber}/${pages}`, mx, top - 80, 7, regular, "center", middle);

    const rx = mx + middle;
    const right = WIDTH - left - middle;
    box(rx, top, right, height);
    // The barcode: bars drawn as rectangles, with the quiet zone the readers ask for.
    const widths = code128cWidths(data.key);
    const unit = (right - 24) / widths.reduce((sum, width) => sum + width, 0);
    let cursor = rx + 12;
    widths.forEach((width, index) => {
      if (index % 2 === 0) page.drawRectangle({ x: cursor, y: top - 36, width: width * unit, height: 30, color: INK });
      cursor += width * unit;
    });
    text("CHAVE DE ACESSO", rx + 3, top - 44, 5);
    text(formattedKey(data.key), rx, top - 54, 7.5, bold, "center", right);
    text("Consulta de autenticidade no portal nacional da NF-e", rx, top - 66, 6, regular, "center", right);
    text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", rx, top - 74, 6, regular, "center", right);

    let y = top - height;
    y = row(y, [["NATUREZA DA OPERAÇÃO", data.nature, 0.56], ["PROTOCOLO DE AUTORIZAÇÃO DE USO", data.protocol ? `${data.protocol} - ${dateTime(data.authorizedAt ?? "")}` : "SEM AUTORIZAÇÃO DE USO", 0.44]]);
    y = row(y, [["INSCRIÇÃO ESTADUAL", data.issuer.registration, 0.5], ["CNPJ", formatDocument(data.issuer.document), 0.5]]);
    return y;
  };

  const stamp = () => {
    if (data.protocol && !data.homologation) return;
    page.drawText("SEM VALOR FISCAL", { x: 92, y: 250, size: 58, font: bold, color: GRAY, rotate: degrees(45), opacity: 0.55 });
  };

  const tableHead = (top: number) => {
    heading("DADOS DOS PRODUTOS / SERVIÇOS", top);
    let x = MARGIN;
    const y = top - 9;
    for (const [label, share, align] of COLUMNS) {
      box(x, y, WIDTH * share, 12);
      text(label, x + (align === "right" ? 0 : 2), y - 8.5, 5, bold, align, align === "right" ? WIDTH * share : 0);
      x += WIDTH * share;
    }
    return y - 12;
  };

  // How many rows fit: the first page carries the customer, the taxes and the carrier above the table.
  const FOOT = 64;
  const firstRows = Math.max(1, Math.floor((PAGE.height - MARGIN - 84 - 44 - 9 - 66 - 9 - 44 - 9 - 22 - 21 - FOOT - 12 - MARGIN) / ROW));
  const otherRows = Math.floor((PAGE.height - MARGIN - 84 - 44 - 21 - FOOT - 12 - MARGIN) / ROW);
  const pages = Math.max(1, 1 + Math.ceil(Math.max(0, data.items.length - firstRows) / otherRows));

  let index = 0;
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    stamp();
    let y = header(pageNumber, pages);

    if (pageNumber === 1) {
      const to = data.recipient;
      heading("DESTINATÁRIO / REMETENTE", y);
      y -= 9;
      y = row(y, [["NOME / RAZÃO SOCIAL", to.name, 0.6], ["CNPJ / CPF", formatDocument(to.document), 0.22], ["DATA DA EMISSÃO", dateTime(data.issuedAt).slice(0, 10), 0.18]]);
      y = row(y, [["ENDEREÇO", to.street, 0.55], ["BAIRRO / DISTRITO", to.district, 0.3], ["CEP", formatCep(to.cep), 0.15]]);
      y = row(y, [["MUNICÍPIO", to.city, 0.45], ["UF", to.uf, 0.07], ["FONE", to.phone ? formatPhone(to.phone) : "", 0.2], ["INSCRIÇÃO ESTADUAL", to.registration, 0.28]]);

      heading("CÁLCULO DO IMPOSTO", y);
      y -= 9;
      const t = data.totals;
      y = row(y, [["BASE DE CÁLCULO DO ICMS", money(t.icmsBase), 0.2, "right"], ["VALOR DO ICMS", money(t.icms), 0.2, "right"], ["BASE DE CÁLC. ICMS S.T.", money(0), 0.2, "right"], ["VALOR DO ICMS SUBST.", money(0), 0.2, "right"], ["VALOR TOTAL DOS PRODUTOS", money(t.products), 0.2, "right"]]);
      y = row(y, [["VALOR DO FRETE", money(t.freight), 0.16, "right"], ["VALOR DO SEGURO", money(0), 0.16, "right"], ["DESCONTO", money(t.discount), 0.16, "right"], ["OUTRAS DESPESAS", money(0), 0.16, "right"], ["VALOR DO IPI", money(t.ipi), 0.16, "right"], ["VALOR TOTAL DA NOTA", money(t.invoice), 0.2, "right"]]);

      heading("TRANSPORTADOR / VOLUMES TRANSPORTADOS", y);
      y -= 9;
      y = row(y, [["FRETE POR CONTA", FREIGHT[data.freightMode] ?? data.freightMode, 1]]);
    }

    y = tableHead(y);
    const rows = pageNumber === 1 ? firstRows : otherRows;
    for (let drawn = 0; drawn < rows && index < data.items.length; drawn += 1, index += 1) {
      const item = data.items[index];
      const cells = [
        item.code, item.name, item.ncm, item.taxCode, item.cfop, item.unit, item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 }), money(item.unitPrice), money(item.total),
        money(item.icmsBase), money(item.icms), money(item.ipi), item.icmsRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 }), item.ipiRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      ];
      let x = MARGIN;
      COLUMNS.forEach(([, share, align], column) => {
        const width = WIDTH * share;
        box(x, y, width, ROW);
        if (column === 1) wrap(cells[column], regular, 6.5, width - 4, 2).forEach((line, at) => text(line, x + 2, y - 7 - at * 7, 6.5));
        else text(cells[column], align === "right" ? x : x + 2, y - 10.5, 6.5, regular, align, width);
        x += width;
      });
      y -= ROW;
    }

    const foot = MARGIN + FOOT;
    heading("DADOS ADICIONAIS", foot + 9);
    box(MARGIN, foot, WIDTH, FOOT);
    text("INFORMAÇÕES COMPLEMENTARES", MARGIN + 2, foot - 6.5, 5);
    const extra = [
      data.homologation ? "NF-e EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL." : "",
      data.totals.difal > 0 || data.totals.fcp > 0 ? `ICMS devido ao estado de destino (DIFAL): R$ ${money(data.totals.difal)}; Fundo de Combate à Pobreza: R$ ${money(data.totals.fcp)}.` : "",
      data.info,
    ].filter(Boolean).join(" ");
    wrap(extra, regular, 7, WIDTH - 8, 6).forEach((line, at) => text(line, MARGIN + 3, foot - 15 - at * 8, 7));
  }
  return pdf.save();
}

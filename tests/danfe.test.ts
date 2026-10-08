import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import type { NfeInput } from "@/lib/fiscal/nfe";
import { nfeProcXml } from "@/lib/fiscal/sefaz";
import { signingKeyOf, signNfeXml } from "@/lib/fiscal/sign";
import { testPfx } from "./fiscal-helpers.ts";

const item = (index: number) => ({ code: `LD-WH${String(index + 1).padStart(3, "0")}`, name: `Equipamento "${index + 1}" & acessórios`, ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 2, unitPrice: 1000.5, ipiRate: 0.1 });
const input = (count: number, environment: "homologacao" | "producao" = "producao"): NfeInput => ({
  environment, freightMode: "1", transport: { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null }, delivery: null, series: 1, number: 123, randomCode: "48291736", issuedAt: "2026-10-08T10:30:00-03:00",
  issuer: { cnpj: "12345678000195", legalName: "Ludus Equipamentos Ltda", stateRegistration: "110042490114", taxRegime: 3, street: "Rua das Máquinas", number: "100", district: "Distrito Industrial", cityCode: "3549805", city: "São José do Rio Preto", uf: "SP", cep: "15035000" },
  recipient: { kind: "PJ", document: "98765432000198", name: "Academia Força & Forma", stateRegistration: "123456789", taxpayer: true, street: "Av. Brasil", number: "500", complement: "Sala 2", district: "Centro", cityCode: "2111300", city: "São Luís", uf: "MA", cep: "65000000" },
  rules: { operationNature: "Venda de mercadoria", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108", icmsCode: "00", ipiCst: "50", ipiFrameCode: "999", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03, finalConsumer: true, ipiInIcmsBase: true, additionalInfo: "Pedido 261008-W9LG", ibsCbs: { cst: "000", classCode: "000001", ibsStateRate: 0.001, ibsCityRate: 0, cbsRate: 0.009 } },
  items: Array.from({ length: count }, (_, index) => item(index)),
  icmsRate: 0.07, destination: { internalIcms: 0.23, fcp: 0 }, payments: [{ code: "17", description: null, amount: count * 2201.1 }], software: "ERP Avila Ops",
});

test("DANFE: os dados vêm do XML da nota — chave, emitente, destinatário, itens, totais e protocolo", () => {
  const built = buildNfeXml(input(2));
  const signed = signNfeXml(built.xml, signingKeyOf(testPfx(), "senha-de-teste"));
  const proc = nfeProcXml(signed, `<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>T</verAplic><chNFe>${built.key}</chNFe><dhRecbto>2026-10-08T10:31:02-03:00</dhRecbto><nProt>135260000012345</nProt><digVal>x=</digVal><cStat>100</cStat><xMotivo>Autorizado</xMotivo></infProt></protNFe>`);
  const data = danfeData(proc);
  assert.deepEqual([data.key, data.number, data.series, data.protocol, data.homologation], [built.key, "123", "1", "135260000012345", false]);
  assert.deepEqual([data.issuer.name, data.issuer.document, data.issuer.registration, data.issuer.city], ["Ludus Equipamentos Ltda", "12345678000195", "110042490114", "São José do Rio Preto"]);
  assert.deepEqual([data.recipient.name, data.recipient.registration, data.recipient.street, data.recipient.uf], ["Academia Força & Forma", "123456789", "Av. Brasil, 500, Sala 2", "MA"]);
  assert.deepEqual(data.items[0], { code: "LD-WH001", name: 'Equipamento "1" & acessórios', ncm: "95069100", taxCode: "000", cfop: "6102", unit: "UN", quantity: 2, unitPrice: 1000.5, total: 2001, icmsBase: 2201.1, icms: 154.08, icmsRate: 7, ipi: 200.1, ipiRate: 10, ipiBase: 2001, reform: data.items[0].reform });
  // IBS e CBS do item e do total vêm do grupo próprio do XML, cada parcela à parte.
  assert.deepEqual(data.items[0].reform, { classCode: "000001", base: built.totals.reformBase / 2, ibsStateRate: 0.1, ibsState: data.items[0].reform!.ibsState, ibsCityRate: 0, ibsCity: 0, cbsRate: 0.9, cbs: data.items[0].reform!.cbs });
  assert.deepEqual(data.totals.reform, { ibsState: built.totals.ibsState, ibsCity: built.totals.ibsCity, cbs: built.totals.cbs });
  assert.equal(data.issuer.regime, "3");
  assert.deepEqual([data.totals.products, data.totals.ipi, data.totals.invoice], [built.totals.products, built.totals.ipi, built.totals.invoice]);
  assert.equal(data.info, "Pedido 261008-W9LG");
  assert.equal(data.delivery, null);
  const elsewhere = buildNfeXml({ ...input(1), delivery: { kind: "PJ", document: "98765432000198", name: "Filial Teresina", street: "Rua da Obra", number: "77", complement: "Galpão 2", district: "Centro", cityCode: "2211001", city: "Teresina", uf: "PI", cep: "64000000" } });
  assert.equal(danfeData(elsewhere.xml).delivery, "Filial Teresina - Rua da Obra, 77, Galpão 2 - Centro - Teresina/PI - CEP 64000-000");
  assert.throws(() => danfeData("<x/>"), /não é de uma NF-e/);
});

test("DANFE: sai em PDF, pagina quando há muitos itens e a conferência não tem protocolo", async () => {
  const one = await PDFDocument.load(await renderDanfe(danfeData(buildNfeXml(input(3)).xml)));
  assert.equal(one.getPageCount(), 1);
  assert.equal(one.getTitle(), "DANFE 123");
  const many = await PDFDocument.load(await renderDanfe(danfeData(buildNfeXml(input(90)).xml)));
  assert.ok(many.getPageCount() >= 3);
  const preview = danfeData(buildNfeXml(input(1, "homologacao")).xml);
  assert.deepEqual([preview.protocol, preview.homologation], [null, true]);
  assert.ok((await renderDanfe(preview)).length > 1000);
});

/** The words drawn on a page, in the order they were drawn: the tests read the paper, not only its size. */
async function pageTexts(bytes: Uint8Array): Promise<string[][]> {
  const { decodePDFRawStream, PDFArray, PDFRawStream } = await import("pdf-lib");
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((reference) => document.context.lookup(reference)) : [contents];
    const code = streams.map((stream) => (stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : "")).join("\n");
    return [...code.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"));
  });
}

test("DANFE da reforma (NT 2026.010): regime do emitente, bloco Total do IBS / CBS / IS e os tributos da reforma em cada item", async () => {
  const built = buildNfeXml(input(2));
  const data = danfeData(built.xml);
  const [words] = await pageTexts(await renderDanfe(data, { reform: true }));
  for (const label of ["CÓDIGO DO REGIME TRIBUTÁRIO", "3 - REGIME NORMAL", "TIPO DE REGIME DE APURAÇÃO DO IBS E DA CBS", "TOTAL DOS PRODUTOS E TOTAL DA NOTA", "TOTAL DO ICMS / IPI", "TOTAL DO IBS / CBS / IS", "VALOR DA CBS", "VALOR DO IBS UF", "VALOR DO IBS MUNICÍPIO", "VALOR DO IMPOSTO SELETIVO", "BASES DE CÁLCULO", "ALÍQUOTAS", "VALOR DOS TRIBUTOS"]) {
    assert.ok(words.includes(label), label);
  }
  const money = (amount: number) => amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Os totais da reforma, logo depois dos rótulos do bloco; o do imposto seletivo fica em branco: a nota não o traz.
  const at = words.indexOf("VALOR DA CBS");
  assert.deepEqual(words.slice(at, at + 7), ["VALOR DA CBS", money(built.totals.cbs), "VALOR DO IBS UF", money(built.totals.ibsState), "VALOR DO IBS MUNICÍPIO", money(built.totals.ibsCity), "VALOR DO IMPOSTO SELETIVO"]);
  // Por item: classificação tributária, base e cada tributo com o seu nome ao lado do valor.
  assert.ok(words.includes("[Cód. LD-WH001] [NCM 95069100] [cClassTrib 000001]"));
  const item = data.items[0].reform!;
  for (const pair of [["IBS / CBS", money(item.base)], ["CBS", "0,90%"], ["IBS UF", "0,10%"], ["IBS MUN", "0,00%"], ["CBS", money(item.cbs)], ["IBS UF", money(item.ibsState)]]) {
    assert.ok(words.some((word, index) => word === pair[0] && words[index + 1] === pair[1]), pair.join(" "));
  }
  // No leiaute novo o IBS e a CBS têm campo próprio: a frase dos dados adicionais sai.
  assert.ok(!words.some((word) => word.includes("Reforma tributária:")));

  // O leiaute atual segue igual, sem os blocos novos.
  const [old] = await pageTexts(await renderDanfe(data));
  assert.ok(old.includes("CÁLCULO DO IMPOSTO") && !old.includes("TOTAL DO IBS / CBS / IS") && !old.includes("CÓDIGO DO REGIME TRIBUTÁRIO"));

  // Nota sem o grupo (Simples até 2027): os campos existem e ficam em branco, nada é calculado no papel.
  const simples = danfeData(buildNfeXml({ ...input(1), issuer: { ...input(1).issuer, taxRegime: 1 }, rules: { ...input(1).rules, icmsCode: "102", ibsCbs: null } }).xml);
  assert.equal(simples.totals.reform, null);
  const [blank] = await pageTexts(await renderDanfe(simples, { reform: true }));
  const cbs = blank.indexOf("VALOR DA CBS");
  assert.deepEqual(blank.slice(cbs, cbs + 4), ["VALOR DA CBS", "VALOR DO IBS UF", "VALOR DO IBS MUNICÍPIO", "VALOR DO IMPOSTO SELETIVO"]);
  assert.ok(blank.includes("1 - SIMPLES NACIONAL") && blank.includes("[Cód. LD-WH001] [NCM 95069100]"));

  // Com DIFAL, o valor ganha o campo opcional do bloco do ICMS; e muitos itens continuam paginando.
  const difal = danfeData(buildNfeXml({ ...input(1), recipient: { ...input(1).recipient, taxpayer: false, stateRegistration: null } }).xml);
  assert.ok((await pageTexts(await renderDanfe(difal, { reform: true })))[0].includes("VALOR DO DIFAL NA UF DE DESTINO"));
  const many = await pageTexts(await renderDanfe(danfeData(buildNfeXml(input(40)).xml), { reform: true }));
  assert.ok(many.length >= 3);
  assert.equal(many.flat().filter((word) => /^\[Cód\. LD-WH\d+\]/.test(word)).length, 40);
});

test("DANFE da reforma: vale pela data de emissão da nota, contra a data que a empresa guarda", () => {
  assert.equal(usesReformLayout("2026-11-30T23:59:59-03:00", "2026-12-01"), false);
  assert.equal(usesReformLayout("2026-12-01T00:00:00-03:00", "2026-12-01"), true);
  assert.equal(usesReformLayout("2026-10-08T10:30:00-03:00", "2026-10-01"), true);
  assert.equal(usesReformLayout("2027-01-01T00:00:00-03:00", null), false);
});

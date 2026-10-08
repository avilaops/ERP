import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { danfeData, renderDanfe } from "@/lib/fiscal/danfe";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import type { NfeInput } from "@/lib/fiscal/nfe";
import { nfeProcXml } from "@/lib/fiscal/sefaz";
import { signingKeyOf, signNfeXml } from "@/lib/fiscal/sign";
import { testPfx } from "./fiscal-helpers.ts";

const item = (index: number) => ({ code: `LD-WH${String(index + 1).padStart(3, "0")}`, name: `Equipamento "${index + 1}" & acessórios`, ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 2, unitPrice: 1000.5, ipiRate: 0.1 });
const input = (count: number, environment: "homologacao" | "producao" = "producao"): NfeInput => ({
  environment, freightMode: "1", series: 1, number: 123, randomCode: "48291736", issuedAt: "2026-10-08T10:30:00-03:00",
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
  assert.deepEqual(data.items[0], { code: "LD-WH001", name: 'Equipamento "1" & acessórios', ncm: "95069100", taxCode: "000", cfop: "6102", unit: "UN", quantity: 2, unitPrice: 1000.5, total: 2001, icmsBase: 2201.1, icms: 154.08, icmsRate: 7, ipi: 200.1, ipiRate: 10 });
  assert.deepEqual([data.totals.products, data.totals.ipi, data.totals.invoice], [built.totals.products, built.totals.ipi, built.totals.invoice]);
  assert.equal(data.info, "Pedido 261008-W9LG");
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

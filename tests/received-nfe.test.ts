import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { parseReceivedNfe, ReceivedNfeError, validateReceivedNfe } from "@/lib/fiscal/received-nfe";
import { danfeData, renderDanfe } from "@/lib/fiscal/danfe";
import { confirmReceivedNfePurchase, getReceivedNfe, importReceivedNfe, linkReceivedNfeProduct, linkReceivedNfeSupplier, listReceivedNfes, receivedNfeXml } from "@/lib/db/received-nfes";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import type { NfeInput } from "@/lib/fiscal/nfe";
import { signingKeyOf, signNfeXml } from "@/lib/fiscal/sign";
import { testPfx } from "./fiscal-helpers.ts";
import { createProduct } from "@/lib/db/products";
import { getPurchase, receivePurchase } from "@/lib/db/purchases";
import { productStock } from "@/lib/db/stock";

const KEY = "35261060677380000106550010000001231000001230";
const SIGNED_INPUT: NfeInput = {
  environment: "producao", freightMode: "9", transport: { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null }, delivery: null,
  series: 1, number: 123, randomCode: "29364881", issuedAt: "2026-10-18T12:00:00-03:00",
  issuer: { cnpj: "60677380000106", legalName: "Fornecedor Teste Ltda", stateRegistration: "116810452119", taxRegime: 3, street: "Rua A", number: "1", district: "Centro", cityCode: "3550308", city: "São Paulo", uf: "SP", cep: "01001000" },
  recipient: { kind: "PJ", document: "48240052000161", name: "Comprador Teste Ltda", stateRegistration: null, taxpayer: false, street: "Rua B", number: "2", district: "Centro", cityCode: "3550308", city: "São Paulo", uf: "SP", cep: "01001000" },
  rules: { operationNature: "Venda de mercadoria", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108", icmsCode: "00", ipiCst: null, ipiFrameCode: "999", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03, finalConsumer: true, ipiInIcmsBase: true, icmsOutOfContributions: false, additionalInfo: null, ibsCbs: { cst: "000", classCode: "000001", ibsStateRate: 0.001, ibsCityRate: 0, cbsRate: 0.009 } },
  items: [{ code: "ABC-1", name: "Produto completo", ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 2, unitPrice: 50, ipiRate: 0 }],
  icmsRate: 0.18, destination: { internalIcms: 0.18, fcp: 0 }, payments: [{ code: "90", description: null, amount: 100 }], software: "ERP Avila Ops",
};
let db: TestDb;
before(async () => { if (!SKIP_WITHOUT_DB) db = await openTestDb("received_nfe"); });
after(async () => { if (!SKIP_WITHOUT_DB) await db.close(); });
const xml = (overrides = "") => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${KEY}" versao="4.00">
<ide><cUF>35</cUF><tpAmb>1</tpAmb><serie>1</serie><nNF>123</nNF><dhEmi>2026-10-18T12:00:00-03:00</dhEmi></ide>
<emit><CNPJ>60677380000106</CNPJ><xNome>Fornecedor Teste Ltda</xNome></emit><dest><CNPJ>60067738000106</CNPJ><xNome>Comprador Teste</xNome></dest>
<det nItem="1"><prod><cProd>ABC-1</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto completo</xProd><NCM>95069100</NCM><CEST>2109200</CEST><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.0000000000</vUnCom><vProd>100.00</vProd><vFrete>10.00</vFrete><vDesc>5.00</vDesc></prod></det>
<total><ICMSTot><vProd>100.00</vProd><vFrete>10.00</vFrete><vDesc>5.00</vDesc><vNF>105.00</vNF></ICMSTot></total>${overrides}</infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/></Signature></NFe>
<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${KEY}</chNFe><nProt>135260000000123</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;

test("extrai o XML completo autorizado com todos os campos operacionais", () => {
  const note = parseReceivedNfe(xml());
  assert.equal(note.accessKey, KEY);
  assert.equal(note.environment, "producao");
  assert.equal(note.issuerDocument, "60677380000106");
  assert.equal(note.totalInvoice, 105);
  assert.deepEqual(note.items[0], { lineNumber: 1, supplierCode: "ABC-1", ean: "SEM GTIN", description: "Produto completo", ncm: "95069100", cest: "2109200", cfop: "5102", commercialUnit: "UN", quantity: 2, unitValue: 50, productValue: 100, freightValue: 10, insuranceValue: 0, discountValue: 5, otherValue: 0, icmsValue: 0, icmsStValue: 0, ipiValue: 0, importTaxValue: 0, pisValue: 0, cofinsValue: 0 });
  assert.match(note.xmlSha256, /^[0-9a-f]{64}$/);
});

test("recusa resumo, DTD, documento sem assinatura, chave divergente e nota não autorizada", () => {
  const cases = [
    "<resNFe><chNFe>1</chNFe></resNFe>",
    `<!DOCTYPE nfeProc [<!ENTITY x SYSTEM "file:///etc/passwd">]>${xml()}`,
    xml().replace(/<Signature[\s\S]*?<\/Signature>/, ""),
    xml().replace(`<chNFe>${KEY}</chNFe>`, `<chNFe>${"1".repeat(44)}</chNFe>`),
    xml().replace("<tpAmb>1</tpAmb><chNFe>", "<tpAmb>2</tpAmb><chNFe>"),
    xml().replace("<cStat>100</cStat>", "<cStat>110</cStat>"),
  ];
  for (const sample of cases) assert.throws(() => parseReceivedNfe(sample), ReceivedNfeError);
});

test("aceita chave e emitente com CNPJ alfanumérico", () => {
  const alphaKey = `352610${"AB12CD34EF56"}${"55001000000123100000123000"}`;
  assert.equal(alphaKey.length, 44);
  const note = parseReceivedNfe(xml().replaceAll(KEY, alphaKey).replaceAll("60677380000106", "AB12CD34EF5600"));
  assert.deepEqual([note.accessKey, note.issuerDocument], [alphaKey, "AB12CD34EF5600"]);
});

test("o mesmo XML completo gera um DANFE em PDF com os itens recebidos", async () => {
  const data = danfeData(xml());
  assert.equal(data.key, KEY);
  assert.equal(data.protocol, "135260000000123");
  assert.deepEqual(data.items.map((item) => [item.code, item.name, item.quantity, item.total]), [["ABC-1", "Produto completo", 2, 100]]);
  const pdf = await renderDanfe(data);
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString("ascii"), "%PDF-");
});

test("a conferência do XML completo expõe partes, tributos, transporte, pagamento e informações adicionais", () => {
  const built = buildNfeXml({
    ...SIGNED_INPUT,
    transport: { carrier: { kind: "PJ", name: "Transportadora Teste", document: "11222333000181", stateRegistration: "110042490114", address: "Rodovia 1", city: "São Paulo", uf: "SP" }, volumes: 3, volumeKind: "Caixa", netWeight: 20, grossWeight: 22 },
    rules: { ...SIGNED_INPUT.rules, additionalInfo: "Pedido de compra 456" },
  });
  const data = danfeData(built.xml);
  assert.deepEqual([data.issuer.name, data.issuer.city, data.recipient.name, data.recipient.city], ["Fornecedor Teste Ltda", "São Paulo", "Comprador Teste Ltda", "São Paulo"]);
  assert.equal(data.items[0].icms, 18);
  assert.deepEqual(data.payments, [{ code: "90", description: "", amount: 100 }]);
  assert.deepEqual([data.carrier?.name, data.volumes.quantity, data.volumes.grossWeight], ["Transportadora Teste", "3", "22.000"]);
  assert.equal(data.info, "Pedido de compra 456");
});

test("a importação exige XSD e assinatura criptográfica além da aparência do XML", async () => {
  let layoutChecked = false;
  let signatureChecked = false;
  const note = await validateReceivedNfe(xml(), {
    layout: async () => { layoutChecked = true; },
    signature: () => { signatureChecked = true; },
  });
  assert.equal(note.accessKey, KEY);
  assert.deepEqual([layoutChecked, signatureChecked], [true, true]);
  await assert.rejects(() => validateReceivedNfe(xml(), { layout: async () => {} }), /assinatura|certificado/);
});

test("aceita um nfeProc real cujo XSD e assinatura conferem e recusa adulteração", async () => {
  const built = buildNfeXml(SIGNED_INPUT);
  const signed = signNfeXml(built.xml, signingKeyOf(testPfx(), "senha-de-teste")).replace(/^<\?xml[^>]+>/, "");
  const complete = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${signed}<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${built.key}</chNFe><dhRecbto>2026-10-18T12:01:00-03:00</dhRecbto><nProt>135260000000123</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
  assert.equal((await validateReceivedNfe(complete)).accessKey, built.key);
  await assert.rejects(() => validateReceivedNfe(complete.replace("<vProd>100.00</vProd>", "<vProd>101.00</vProd>")), /assinatura digital/);
});

test("banco preserva o XML e os itens uma vez, sem criar fornecedor, compra, custo ou estoque", { skip: SKIP_WITHOUT_DB }, async () => {
  const note = parseReceivedNfe(xml());
  const first = await importReceivedNfe(note, "diretoria@teste.local", db.pool);
  assert.equal(first.created, true);
  assert.deepEqual(await importReceivedNfe(note, "diretoria@teste.local", db.pool), { id: first.id, created: false });
  const detail = await getReceivedNfe(first.id, db.pool);
  assert.equal(detail?.items[0].description, "Produto completo");
  assert.equal(detail?.supplierId, null);
  assert.equal(detail?.purchaseId, null);
  assert.equal((await receivedNfeXml(first.id, db.pool))?.xml, note.xml);
  assert.deepEqual((await listReceivedNfes(db.pool)).map((item) => [item.id, item.itemCount, item.totalInvoice]), [[first.id, 1, 105]]);
  for (const table of ["suppliers", "purchases", "purchase_costs", "stock_moves"]) {
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count), 0);
  }
});

test("banco bloqueia a mesma chave com conteúdo diferente", { skip: SKIP_WITHOUT_DB }, async () => {
  const changed = { ...parseReceivedNfe(xml()), xmlSha256: "f".repeat(64) };
  await assert.rejects(() => importReceivedNfe(changed, "diretoria@teste.local", db.pool), /conteúdo diferente/);
});

test("importações concorrentes da mesma chave convergem para uma única NF-e", { skip: SKIP_WITHOUT_DB }, async () => {
  const note = parseReceivedNfe(xml().replaceAll(KEY, "35261060677380000106550010000001231000007777"));
  const results = await Promise.all([
    importReceivedNfe(note, "diretoria@teste.local", db.pool),
    importReceivedNfe(note, "diretoria@teste.local", db.pool),
  ]);
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
});

test("NF-e cancelada não aceita vínculo de fornecedor", { skip: SKIP_WITHOUT_DB }, async () => {
  const canceledKey = "35261070677380000106550010000001231000008888";
  const imported = await importReceivedNfe(parseReceivedNfe(xml().replaceAll(KEY, canceledKey).replaceAll("60677380000106", "70677380000106")), "diretoria@teste.local", db.pool);
  const supplier = Number((await db.pool.query("INSERT INTO suppliers (kind, document, name, updated_by) VALUES ('PJ','70677380000106','Fornecedor cancelado','teste') RETURNING id")).rows[0].id);
  await db.pool.query("UPDATE fiscal_received_nfes SET canceled_at = now() WHERE id = $1", [imported.id]);
  await assert.rejects(() => linkReceivedNfeSupplier(imported.id, supplier, "diretoria@teste.local", db.pool), /cancelada/);
});

test("conferência explícita cria fornecedor vinculado, compra e custo; estoque só muda no recebimento", { skip: SKIP_WITHOUT_DB }, async () => {
  const imported = await importReceivedNfe(parseReceivedNfe(xml()), "diretoria@teste.local", db.pool);
  const wrongSupplier = Number((await db.pool.query("INSERT INTO suppliers (kind, document, name, updated_by) VALUES ('PJ','48240052000161','Outro fornecedor','teste') RETURNING id")).rows[0].id);
  await assert.rejects(() => linkReceivedNfeSupplier(imported.id, wrongSupplier, "diretoria@teste.local", db.pool), /mesmo CNPJ/);
  const supplier = Number((await db.pool.query("INSERT INTO suppliers (kind, document, name, updated_by) VALUES ('PJ','60677380000106','Fornecedor Teste','teste') RETURNING id")).rows[0].id);
  const product = await createProduct({ name: "Produto do estoque", code: "EST-1" }, "diretoria@teste.local", db.pool);
  await linkReceivedNfeSupplier(imported.id, supplier, "diretoria@teste.local", db.pool);
  await assert.rejects(() => confirmReceivedNfePurchase(imported.id, "diretoria@teste.local", db.pool), /Vincule todos/);
  await linkReceivedNfeProduct(imported.id, 1, product.id, "diretoria@teste.local", db.pool);
  const confirmed = await confirmReceivedNfePurchase(imported.id, "diretoria@teste.local", db.pool);
  assert.equal(confirmed.created, true);
  assert.deepEqual(await confirmReceivedNfePurchase(imported.id, "diretoria@teste.local", db.pool), { purchaseId: confirmed.purchaseId, created: false });
  const purchase = await getPurchase(confirmed.purchaseId, db.pool);
  assert.deepEqual([purchase?.supplierId, purchase?.invoiceKey, purchase?.items[0].quantity, purchase?.items[0].landedUnit], [supplier, KEY, 2, 52.5]);
  assert.equal((await productStock(product.id, db.pool))?.physical, 0);
  const history = await db.pool.query("SELECT unit_cost, recorded_by FROM product_cost_history WHERE product_id = $1", [product.id]);
  assert.deepEqual(history.rows.map((row) => [Number(row.unit_cost), row.recorded_by]), [[52.5, "diretoria@teste.local"]]);
  await receivePurchase(confirmed.purchaseId, "2026-10-18", "diretoria@teste.local", db.pool);
  assert.equal((await productStock(product.id, db.pool))?.physical, 2);
});


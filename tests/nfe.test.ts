import assert from "node:assert/strict";
import { test } from "node:test";
import { NfeError, accessKey, accessKeyDigit, buildNfeXml, nfeProblems, nfeTotals } from "@/lib/fiscal/nfe";
import type { NfeInput } from "@/lib/fiscal/nfe";

const INPUT: NfeInput = {
  environment: "producao",
  freightMode: "1",
  series: 1,
  number: 123,
  randomCode: "48291736",
  issuedAt: "2026-10-08T10:30:00-03:00",
  issuer: {
    cnpj: "12345678000195", legalName: "Ludus Equipamentos Ltda", stateRegistration: "110042490114", taxRegime: 3,
    street: "Rua das Máquinas", number: "100", district: "Distrito Industrial", cityCode: "3549805", city: "São José do Rio Preto", uf: "SP", cep: "15035000",
  },
  recipient: {
    kind: "PJ", document: "98765432000198", name: "Academia Força & Forma <Matriz>", stateRegistration: null, taxpayer: false,
    street: "Av. Brasil", number: "500", complement: "Sala 2", district: "Centro", cityCode: "2111300", city: "São Luís", uf: "MA", cep: "65000000", email: "compras@academia.test",
  },
  rules: {
    operationNature: "Venda de mercadoria", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108",
    icmsCode: "00", ipiCst: null, ipiFrameCode: "999", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03,
    finalConsumer: true, ipiInIcmsBase: true, additionalInfo: "Pedido 261008-W9LG", ibsCbs: { cst: "000", classCode: "000001", ibsStateRate: 0.001, ibsCityRate: 0, cbsRate: 0.009 } },
  items: [
    { code: "LD-WH037", name: "Leg Press 45° Com Suporte Para Anilhas", ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 2, unitPrice: 10344.12, ipiRate: 0 },
    { code: "LD-WH011", name: "Banco Regulável de 0 a 90°", ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 1, unitPrice: 1798.98, ipiRate: 0 },
  ],
  icmsRate: 0.07,
  destination: { internalIcms: 0.23, fcp: 0 },
  payments: [{ code: "17", description: null, amount: 13492.33 }, { code: "15", description: null, amount: 8994.89 }],
  software: "ERP Avila Ops 1.0",
};

test("chave de acesso: dígito verificador pelo módulo 11, pesos de 2 a 9 a partir da direita", () => {
  const zeros = "0".repeat(43);
  assert.equal(accessKeyDigit(zeros), "0");
  assert.equal(accessKeyDigit(`${"0".repeat(42)}1`), "9");
  assert.equal(accessKeyDigit(`${"0".repeat(41)}10`), "8");
  // O nono a partir da direita volta ao peso 2.
  assert.equal(accessKeyDigit(`${"0".repeat(34)}1${"0".repeat(8)}`), "9");
  // Resto 0 ou 1 dá dígito 0.
  assert.equal(accessKeyDigit(`${"0".repeat(35)}10000001`), "0");
  assert.equal(accessKeyDigit(`${"0".repeat(35)}10000010`), "0");
  assert.equal(accessKeyDigit(`${"0".repeat(38)}10001`), "3");
  assert.throws(() => accessKeyDigit("123"), /43 dígitos/);
});

test("chave de acesso: estado, ano e mês, CNPJ, modelo 55, série, número, forma de emissão e código", () => {
  const key = accessKey(INPUT);
  assert.equal(key.length, 44);
  assert.equal(key.slice(0, 43), "35" + "2610" + "12345678000195" + "55" + "001" + "000000123" + "1" + "48291736");
  assert.equal(key[43], accessKeyDigit(key.slice(0, 43)));
});

test("venda para não contribuinte de outro estado: CFOP 6108, ICMS de saída e DIFAL para o destino", () => {
  const { xml, key, totals } = buildNfeXml(INPUT);
  assert.deepEqual(totals, { products: 22487.22, ipi: 0, icmsBase: 22487.22, icms: 1574.11, pis: 146.16, cofins: 674.62, difal: 3597.96, fcp: 0, invoice: 22487.22, reformBase: 16494.37, ibsState: 16.49, ibsCity: 0, cbs: 148.45 });
  assert.ok(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${key}">`));
  for (const piece of [
    "<idDest>2</idDest>", "<tpAmb>1</tpAmb>", "<indFinal>1</indFinal>", "<indPres>9</indPres><indIntermed>0</indIntermed>",
    "<CFOP>6108</CFOP>", "<indIEDest>9</indIEDest>", "<xNome>Academia Força &amp; Forma &lt;Matriz&gt;</xNome>",
    "<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>20688.24</vBC><pICMS>7.0000</pICMS><vICMS>1448.18</vICMS></ICMS00>",
    "<pICMSUFDest>23.0000</pICMSUFDest><pICMSInter>7.00</pICMSInter><pICMSInterPart>100.0000</pICMSInterPart>",
    "<vICMSUFDest>3310.12</vICMSUFDest>", "<vFCPUFDest>0.00</vFCPUFDest><vICMSUFDest>3597.96</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet>",
    "<qCom>2.0000</qCom><vUnCom>10344.1200000000</vUnCom><vProd>20688.24</vProd>",
    "<vNF>22487.22</vNF>", "<detPag><tPag>17</tPag><vPag>13492.33</vPag></detPag><detPag><tPag>15</tPag><vPag>8994.89</vPag></detPag>",
    "<infCpl>Pedido 261008-W9LG</infCpl>",
    // Reforma tributária (NT 2025.002): base sem os tributos embutidos, IBS de 0,1% e CBS de 0,9% em 2026, fora do total da nota.
    "<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>15174.82</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>15.17</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>15.17</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>136.57</vCBS></gCBS></gIBSCBS></IBSCBS>",
    "<IBSCBSTot><vBCIBSCBS>16494.37</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>16.49</vIBSUF></gIBSUF>",
    "<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>148.45</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot>",
  ]) {
    assert.ok(xml.includes(piece), piece);
  }
  assert.doesNotMatch(xml, /<IPI>|<CEST>|<IE>\D|undefined|null|NaN|<\w+><\/\w+>/);
  // A soma dos itens é o total: a SEFAZ rejeita nota em que não fecha.
  const sum = (name: string) => [...xml.matchAll(new RegExp(`<det .*?<${name}>([\\d.]+)</${name}>`, "g"))].reduce((total, [, value]) => total + Number(value), 0);
  assert.equal(Math.round(sum("vProd") * 100), 2248722);
});

test("dentro do estado e para contribuinte: CFOP da operação, sem DIFAL; com IPI, a base do ICMS do consumidor final leva o IPI", () => {
  const inside = buildNfeXml({ ...INPUT, recipient: { ...INPUT.recipient, uf: "SP", cityCode: "3550308", city: "São Paulo" }, icmsRate: 0.18 });
  assert.ok(inside.xml.includes("<idDest>1</idDest>") && inside.xml.includes("<CFOP>5102</CFOP>"));
  assert.doesNotMatch(inside.xml, /ICMSUFDest/);

  const taxpayer = buildNfeXml({ ...INPUT, recipient: { ...INPUT.recipient, taxpayer: true, stateRegistration: "123456789" } });
  assert.ok(taxpayer.xml.includes("<CFOP>6102</CFOP>") && taxpayer.xml.includes("<indIEDest>1</indIEDest><IE>123456789</IE>"));
  assert.doesNotMatch(taxpayer.xml, /ICMSUFDest/);

  const withIpi: NfeInput = {
    ...INPUT,
    rules: { ...INPUT.rules, ipiCst: "50" },
    items: [{ ...INPUT.items[0], quantity: 1, unitPrice: 1000, ipiRate: 0.13 }],
    payments: [{ code: "17", description: null, amount: 1130 }],
  };
  const taxed = buildNfeXml(withIpi);
  assert.deepEqual([taxed.totals.products, taxed.totals.ipi, taxed.totals.icmsBase, taxed.totals.invoice], [1000, 130, 1130, 1130]);
  assert.ok(taxed.xml.includes("<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>1000.00</vBC><pIPI>13.0000</pIPI><vIPI>130.00</vIPI></IPITrib></IPI>"));
  assert.equal(nfeTotals({ ...withIpi, rules: { ...withIpi.rules, ipiInIcmsBase: false } }).icmsBase, 1000);
});

test("Simples Nacional: CSOSN, sem base nem valor de ICMS; homologação troca o nome do cliente e do primeiro item", () => {
  const simples = buildNfeXml({ ...INPUT, environment: "homologacao", issuer: { ...INPUT.issuer, taxRegime: 1 }, rules: { ...INPUT.rules, icmsCode: "102", pisCst: "49", cofinsCst: "49", pisRate: 0, cofinsRate: 0, ibsCbs: null } });
  // O Simples só leva IBS/CBS a partir de 04/01/2027: sem as regras, a nota sai sem o grupo.
  assert.doesNotMatch(simples.xml, /IBSCBS/);
  assert.ok(nfeProblems({ ...INPUT, rules: { ...INPUT.rules, ibsCbs: null } }).some((problem) => problem.includes("IBS/CBS")));
  assert.ok(simples.xml.includes("<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>"));
  assert.ok(simples.xml.includes("<CRT>1</CRT>") && simples.xml.includes("<tpAmb>2</tpAmb>"));
  assert.ok(simples.xml.includes("<PISOutr><CST>49</CST><vBC>20688.24</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr>"));
  assert.deepEqual([simples.totals.icmsBase, simples.totals.icms, simples.totals.difal], [0, 0, 0]);
  assert.equal(simples.xml.split("NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL").length - 1, 2);
});

test("nota com falta não sai: cada problema diz onde se corrige, todos de uma vez", () => {
  const broken: NfeInput = {
    ...INPUT,
    issuer: { ...INPUT.issuer, cnpj: "", cityCode: "" },
    recipient: { ...INPUT.recipient, cityCode: "" },
    rules: { ...INPUT.rules, cfopInternal: "", icmsCode: "102" },
    items: [{ ...INPUT.items[0], ncm: "" }],
    payments: [{ code: "99", description: null, amount: 1 }],
  };
  const problems = nfeProblems(broken);
  for (const piece of ["Empresa: CNPJ", "Empresa: endereço", "Cliente: código do município", "CFOP de venda dentro do estado", "CST do ICMS", "NCM com oito dígitos", "as formas somam", 'forma "outros"']) {
    assert.ok(problems.some((problem) => problem.includes(piece)), piece);
  }
  assert.throws(() => buildNfeXml(broken), NfeError);
  assert.deepEqual(nfeProblems(INPUT), []);
});

test("esquema oficial da NF-e 4.00 (XSD): o XML passa inteiro; só falta a assinatura, que é a etapa seguinte", async () => {
  const { readFileSync } = await import("node:fs");
  const { validateXML } = await import("xmllint-wasm");
  const read = (name: string) => readFileSync(new URL(`./fixtures/nfe-xsd/${name}`, import.meta.url), "utf8");
  const preload = ["leiauteNFe_v4.00.xsd", "tiposBasico_v4.00.xsd", "DFeTiposBasicos_v1.00.xsd", "xmldsig-core-schema_v1.01.xsd"].map((fileName) => ({ fileName, contents: read(fileName) }));
  const cases: NfeInput[] = [
    INPUT,
    { ...INPUT, destination: { internalIcms: 0.2, fcp: 0.02 }, recipient: { ...INPUT.recipient, uf: "RJ", cityCode: "3304557", city: "Rio de Janeiro", phone: "(21) 3333-4444" }, icmsRate: 0.12 },
    { ...INPUT, rules: { ...INPUT.rules, ipiCst: "50" }, items: [{ ...INPUT.items[0], quantity: 1, unitPrice: 1000, ipiRate: 0.13, cest: "2806400" }], payments: [{ code: "99", description: "Cartão BNDES", amount: 1130 }] },
    { ...INPUT, environment: "homologacao", issuer: { ...INPUT.issuer, taxRegime: 1 }, rules: { ...INPUT.rules, icmsCode: "102", pisCst: "49", cofinsCst: "49", pisRate: 0, cofinsRate: 0 } },
    { ...INPUT, recipient: { ...INPUT.recipient, kind: "PF", document: "12345678909", uf: "SP", cityCode: "3550308", city: "São Paulo" }, icmsRate: 0.18, rules: { ...INPUT.rules, icmsCode: "40", pisCst: "06", cofinsCst: "06" } },
    { ...INPUT, recipient: { ...INPUT.recipient, taxpayer: true, stateRegistration: "123456789" } },
    // CNPJ alfanumérico do cliente (NT 2026.004), o exemplo da nota técnica; frete por conta do remetente.
    { ...INPUT, freightMode: "0", recipient: { ...INPUT.recipient, document: "12ABC34501DE35" } },
  ];
  for (const [index, input] of cases.entries()) {
    const result = await validateXML({
      xml: [{ fileName: `nota-${index}.xml`, contents: buildNfeXml(input).xml }],
      schema: [{ fileName: "nfe_v4.00.xsd", contents: read("nfe_v4.00.xsd") }],
      preload,
    });
    const errors = result.errors.map((error) => error.message);
    assert.equal(errors.length, 1, `nota ${index}: ${errors.join(" | ")}`);
    assert.match(errors[0], /Element '\{http:\/\/www\.portalfiscal\.inf\.br\/nfe\}NFe': Missing child element\(s\)\. Expected is one of .*Signature/);
  }
});

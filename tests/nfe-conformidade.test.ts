import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SignedXml } from "xml-crypto";
import { validateXML } from "xmllint-wasm";
import { code128cSymbols, code128Symbols, code128Widths } from "@/lib/fiscal/barcode";
import { danfeData, renderDanfe } from "@/lib/fiscal/danfe";
import { eventEnvelope, eventXml } from "@/lib/fiscal/events";
import { accessKey, accessKeyDigit, buildNfeXml, interstateRate, isAcceptableRandomCode, nfeProblems, nfeTotals } from "@/lib/fiscal/nfe";
import type { NfeInput } from "@/lib/fiscal/nfe";
import { consultEnvelope, consultEvents, nfeProcXml, parseAuthorization, voidXml } from "@/lib/fiscal/sefaz";
import { signEventXml, signingKeyOf, signNfeXml, signVoidXml } from "@/lib/fiscal/sign";
import { testPfx } from "./fiscal-helpers.ts";

/**
 * Conformidade da NF-e com as normas em vigor (docs/fiscal-conformidade-nfe.md):
 * cada teste cita a regra que confere. Os esquemas são os oficiais, guardados em
 * tests/fixtures/nfe-xsd (origem e data em ORIGEM.md).
 */

const fixture = (name: string) => readFileSync(new URL(`./fixtures/nfe-xsd/${name}`, import.meta.url), "utf8");
const signingKey = signingKeyOf(testPfx(), "senha-de-teste");

/** O CNPJ alfanumérico de exemplo da Receita Federal (IN RFB 2.229/2024), o mesmo da NT Conjunta 2025.001. */
const ALPHA_CNPJ = "12ABC34501DE35";

const BASE: NfeInput = {
  environment: "producao",
  freightMode: "1", transport: { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null }, delivery: null,
  series: 1, number: 123, randomCode: "48291736", issuedAt: "2026-10-08T10:30:00-03:00",
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
    finalConsumer: true, ipiInIcmsBase: true, additionalInfo: "Pedido 261008-W9LG", ibsCbs: { cst: "000", classCode: "000001", ibsStateRate: 0.001, ibsCityRate: 0, cbsRate: 0.009 },
  },
  items: [
    { code: "LD-WH037", name: "Leg Press 45° Com Suporte Para Anilhas", ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 2, unitPrice: 10344.12, ipiRate: 0 },
    { code: "LD-WH011", name: "Banco Regulável de 0 a 90°", ncm: "95069100", cest: null, origin: 0, unit: "UN", quantity: 3, unitPrice: 1798.983333, ipiRate: 0 },
  ],
  icmsRate: 0.07, destination: { internalIcms: 0.23, fcp: 0 },
  payments: [],
  software: "ERP Avila Ops 1.0",
};

/** The scenario with one payment of the whole invoice, unless it brings its own. */
const paid = (input: NfeInput): NfeInput => (input.payments.length > 0 ? input : { ...input, payments: [{ code: "17", description: null, amount: nfeTotals(input).invoice }] });

const INSIDE = { uf: "SP", cityCode: "3550308", city: "São Paulo", cep: "01001000" };
const TAXPAYER = { taxpayer: true, stateRegistration: "123456789" };
const CARRIER = { kind: "PJ" as const, document: "11222333000181", name: "Transportes Rápidos Ltda", stateRegistration: "110042490114", address: "Rod. BR-153, km 50", city: "São José do Rio Preto", uf: "SP" };

/** Every kind of sale this system issues. What it does not issue (frete, seguro, desconto e outras despesas destacados, devolução, contingência) is not here: see the document. */
const SCENARIOS: Record<string, NfeInput> = {
  "interna, contribuinte, para revenda": { ...BASE, icmsRate: 0.18, recipient: { ...BASE.recipient, ...INSIDE, ...TAXPAYER }, rules: { ...BASE.rules, finalConsumer: false } },
  "interna, consumidor final pessoa física, com IPI na base do ICMS": {
    ...BASE, icmsRate: 0.18, recipient: { ...BASE.recipient, ...INSIDE, kind: "PF", document: "52998224725" },
    rules: { ...BASE.rules, ipiCst: "50" }, items: BASE.items.map((item) => ({ ...item, ipiRate: 0.065 })),
  },
  "interestadual, contribuinte (12%)": { ...BASE, icmsRate: 0.12, recipient: { ...BASE.recipient, ...TAXPAYER, uf: "RJ", cityCode: "3304557", city: "Rio de Janeiro" }, rules: { ...BASE.rules, finalConsumer: false } },
  "interestadual, não contribuinte, DIFAL e FCP": { ...BASE, icmsRate: 0.12, destination: { internalIcms: 0.2, fcp: 0.02 }, recipient: { ...BASE.recipient, uf: "RJ", cityCode: "3304557", city: "Rio de Janeiro", phone: "(21) 3333-4444" } },
  "interestadual, não contribuinte, mercadoria importada (4%)": { ...BASE, icmsRate: 0.04, items: BASE.items.map((item) => ({ ...item, origin: 1 })) },
  "interestadual, contribuinte consumidor final (sem grupo de DIFAL)": { ...BASE, recipient: { ...BASE.recipient, ...TAXPAYER } },
  "Simples Nacional, CSOSN 102, sem IBS/CBS": { ...BASE, issuer: { ...BASE.issuer, taxRegime: 1 }, rules: { ...BASE.rules, icmsCode: "102", pisCst: "49", cofinsCst: "49", pisRate: 0, cofinsRate: 0, ibsCbs: null } },
  "Simples Nacional, CSOSN 400, em homologação": { ...BASE, environment: "homologacao", issuer: { ...BASE.issuer, taxRegime: 1 }, rules: { ...BASE.rules, icmsCode: "400", pisCst: "99", cofinsCst: "99", pisRate: 0, cofinsRate: 0, ibsCbs: null } },
  "Simples com excesso de sublimite (CRT 2), CST 00": { ...BASE, issuer: { ...BASE.issuer, taxRegime: 2 } },
  "IPI tributado (CST 50) com CEST e forma de pagamento 99": {
    ...BASE, rules: { ...BASE.rules, ipiCst: "50" }, items: [{ ...BASE.items[0], quantity: 1, unitPrice: 1000, ipiRate: 0.13, cest: "2806400" }],
    payments: [{ code: "99", description: "Cartão BNDES", amount: 1130 }],
  },
  "IPI sem imposto (CST 53)": { ...BASE, rules: { ...BASE.rules, ipiCst: "53" } },
  "ICMS isento (CST 40) e PIS/COFINS sem incidência (06), a pessoa física": {
    ...BASE, icmsRate: 0.18, recipient: { ...BASE.recipient, ...INSIDE, kind: "PF", document: "12345678909" }, rules: { ...BASE.rules, icmsCode: "40", pisCst: "06", cofinsCst: "06" },
  },
  "ICMS não tributado (CST 41), outro estado, não contribuinte (sem DIFAL)": { ...BASE, rules: { ...BASE.rules, icmsCode: "41" } },
  "ICMS com suspensão (CST 50), contribuinte": { ...BASE, recipient: { ...BASE.recipient, ...TAXPAYER }, rules: { ...BASE.rules, icmsCode: "50", finalConsumer: false } },
  "transportadora com inscrição, volumes e pesos, frete de terceiros": { ...BASE, freightMode: "2", transport: { carrier: CARRIER, volumes: 12, volumeKind: "Palete", netWeight: 1850.5, grossWeight: 1990 } },
  "transportador pessoa física, só quantidade de volumes, frete do remetente": { ...BASE, freightMode: "0", transport: { carrier: { kind: "PF", document: "52998224725", name: "João Carreteiro", stateRegistration: null, address: null, city: null, uf: null }, volumes: 3, volumeKind: null, netWeight: null, grossWeight: null } },
  "sem transporte (modFrete 9)": { ...BASE, freightMode: "9" },
  "entrega em outro estado, com quem recebe": {
    ...BASE, destination: { internalIcms: 0.225, fcp: 0 },
    delivery: { kind: "PJ", document: "98765432000198", name: "Filial Teresina", street: "Rua da Obra", number: "77", complement: "Galpão 2", district: "Centro", cityCode: "2211001", city: "Teresina", uf: "PI", cep: "64000000", phone: "(86) 3222-1000" },
  },
  "duas formas de pagamento": { ...BASE, payments: [{ code: "17", description: null, amount: 10000 }, { code: "15", description: null, amount: nfeTotals(BASE).invoice - 10000 }] },
  "CNPJ alfanumérico no emitente, no destinatário, na entrega e na transportadora (NT 2026.004)": {
    ...BASE, issuer: { ...BASE.issuer, cnpj: ALPHA_CNPJ }, recipient: { ...BASE.recipient, document: ALPHA_CNPJ }, freightMode: "2",
    transport: { ...BASE.transport, carrier: { ...CARRIER, document: ALPHA_CNPJ } },
    delivery: { kind: "PJ", document: ALPHA_CNPJ, name: null, street: "Rua A", number: "1", district: "Centro", cityCode: "2111300", city: "São Luís", uf: "MA", cep: "65000000" },
  },
};

const NFE_PRELOAD = ["leiauteNFe_v4.00.xsd", "tiposBasico_v4.00.xsd", "DFeTiposBasicos_v1.00.xsd", "xmldsig-core-schema_v1.01.xsd"];

async function schemaErrors(xml: string, schema: string, preload: string[], folder = ""): Promise<string[]> {
  const result = await validateXML({
    xml: [{ fileName: "documento.xml", contents: xml }],
    schema: [{ fileName: schema.split("/").at(-1)!, contents: fixture(schema) }],
    preload: preload.map((fileName) => ({ fileName, contents: fixture(`${folder}${fileName}`) })),
  });
  return result.errors.map((error) => error.message);
}

function verifies(signed: string): boolean {
  const signature = /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">[\s\S]*<\/Signature>/.exec(signed)?.[0];
  if (!signature) return false;
  const checker = new SignedXml({ publicCert: `-----BEGIN CERTIFICATE-----\n${signingKey.certificateBase64}\n-----END CERTIFICATE-----` });
  checker.loadSignature(signature);
  try {
    return checker.checkSignature(signed);
  } catch {
    return false;
  }
}

test("esquema PL_010f (NT 2025.002 v1.50): cada tipo de venda que o sistema emite sai assinado e válido, e o arquivo guardado (nfeProc) também", async () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const input = paid(scenario);
    assert.deepEqual(nfeProblems(input), [], name);
    const built = buildNfeXml(input);
    const signed = signNfeXml(built.xml, signingKey);
    assert.deepEqual(await schemaErrors(signed, "nfe_v4.00.xsd", NFE_PRELOAD), [], name);
    assert.equal(verifies(signed), true, name);
    const protocol = `<protNFe versao="4.00"><infProt><tpAmb>${input.environment === "producao" ? 1 : 2}</tpAmb><verAplic>SP_NFE_PL009_V4</verAplic><chNFe>${built.key}</chNFe><dhRecbto>2026-10-08T10:31:02-03:00</dhRecbto><nProt>135260000012345</nProt><digVal>${/<DigestValue>([^<]+)/.exec(signed)![1]}</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;
    assert.deepEqual(await schemaErrors(nfeProcXml(signed, protocol), "procNFe_v4.00.xsd", NFE_PRELOAD), [], name);
  }
});

test("fechamento dos totais (grupo W): cada total é a soma dos itens, e vNF = vProd + vIPI (regras W03-10 a W16-10; W35-10 a W56-10 da NT 2025.002)", () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const { xml } = buildNfeXml(paid(scenario));
    const items = [...xml.matchAll(/<det nItem="\d+">[\s\S]*?<\/det>/g)].map(([item]) => item);
    const total = /<total>[\s\S]*<\/total>/.exec(xml)![0];
    const cents = (text: string, tagName: string) => Math.round(Number(new RegExp(`<${tagName}>([\\d.]+)</${tagName}>`).exec(text)?.[1] ?? 0) * 100);
    const inItems = (group: string, tagName: string) => items.reduce((sum, item) => sum + cents(new RegExp(`<${group}[ >][\\s\\S]*?</${group}>`).exec(item)?.[0] ?? "", tagName), 0);
    const icmsTotal = /<ICMSTot>[\s\S]*<\/ICMSTot>/.exec(total)![0];
    for (const [group, itemTag, totalTag] of [["prod", "vProd", "vProd"], ["ICMS", "vBC", "vBC"], ["ICMS", "vICMS", "vICMS"], ["IPI", "vIPI", "vIPI"], ["PIS", "vPIS", "vPIS"], ["COFINS", "vCOFINS", "vCOFINS"], ["ICMSUFDest", "vICMSUFDest", "vICMSUFDest"], ["ICMSUFDest", "vFCPUFDest", "vFCPUFDest"]]) {
      assert.equal(cents(icmsTotal, totalTag), inItems(group, itemTag), `${name}: ${totalTag}`);
    }
    assert.equal(cents(icmsTotal, "vNF"), cents(icmsTotal, "vProd") + cents(icmsTotal, "vIPI"), `${name}: vNF`);
    assert.equal([...xml.matchAll(/<vPag>([\d.]+)<\/vPag>/g)].reduce((sum, [, value]) => sum + Math.round(Number(value) * 100), 0), cents(icmsTotal, "vNF"), `${name}: pagamentos`);

    const reform = /<IBSCBSTot>[\s\S]*<\/IBSCBSTot>/.exec(total)?.[0];
    if (!reform) {
      assert.doesNotMatch(xml, /<IBSCBS>/, name);
      continue;
    }
    for (const [group, itemTag, totalTag] of [["gIBSCBS", "vBC", "vBCIBSCBS"], ["gIBSUF", "vIBSUF", "vIBSUF"], ["gIBSMun", "vIBSMun", "vIBSMun"], ["gIBSCBS", "vIBS", "vIBS"], ["gCBS", "vCBS", "vCBS"]]) {
      assert.equal(cents(reform, totalTag), inItems(group, itemTag), `${name}: ${totalTag}`);
    }
    // Regras UB35-10, UB54-10 e UB67-10: o valor de cada item é a base vezes a alíquota, com um centavo de tolerância; UB18-10, UB37-10 e UB56-10: 0,1%, 0% e 0,9% em 2026.
    for (const item of items) {
      const base = cents(/<gIBSCBS>[\s\S]*<\/gIBSCBS>/.exec(item)![0], "vBC");
      assert.ok(Math.abs(cents(item, "vIBSUF") - base * 0.001) <= 1 && cents(item, "vIBSMun") === 0 && Math.abs(cents(item, "vCBS") - base * 0.009) <= 1, name);
      assert.ok(item.includes("<pIBSUF>0.1000</pIBSUF>") && item.includes("<pIBSMun>0.0000</pIBSMun>") && item.includes("<pCBS>0.9000</pCBS>"), name);
      // Regra UB16-10: a base é o produto menos PIS, COFINS, ICMS, DIFAL e FCP do destino (o IPI não entra).
      assert.equal(base, cents(item, "vProd") - cents(item, "vPIS") - cents(item, "vCOFINS") - cents(/<ICMS>[\s\S]*<\/ICMS>/.exec(item)![0], "vICMS") - cents(item, "vICMSUFDest") - cents(item, "vFCPUFDest"), name);
    }
  }
});

test("chave de acesso com CNPJ alfanumérico (NT Conjunta 2025.001, item 5): cada posição vale o código ASCII menos 48", () => {
  // Conferido à mão pelo algoritmo do Anexo II da nota técnica: os dois exemplos dão dígito 4.
  assert.equal(accessKeyDigit("3526101234567800019555001000000123148291736"), "4");
  assert.equal(accessKeyDigit("35261012ABC34501DE3555001000000123148291736"), "4");
  // Uma letra no CNPJ muda o dígito: "A" vale 17, não zero.
  assert.notEqual(accessKeyDigit(`352610${"0".repeat(11)}A00${"0".repeat(23)}`), accessKeyDigit(`352610${"0".repeat(11)}000${"0".repeat(23)}`));
  // Letra fora do CNPJ, minúscula ou tamanho errado não é chave.
  for (const wrong of ["A".repeat(43), `35261012abc34501de35${"0".repeat(23)}`, `3526101234567800019555001000000123148291A36`, "123"]) assert.throws(() => accessKeyDigit(wrong), /43 posições/);

  const key = accessKey({ ...BASE, issuer: { ...BASE.issuer, cnpj: ALPHA_CNPJ } });
  assert.equal(key, "35261012ABC34501DE35550010000001231482917364");
  const { xml } = buildNfeXml(paid({ ...BASE, issuer: { ...BASE.issuer, cnpj: ALPHA_CNPJ } }));
  assert.ok(xml.includes(`Id="NFe${key}"`) && xml.includes(`<emit><CNPJ>${ALPHA_CNPJ}</CNPJ>`) && xml.includes("<cDV>4</cDV>"));
});

test("cNF (regra B03-10, rejeição 897): nunca o número da nota, nem dígitos repetidos ou em sequência", () => {
  for (const weak of ["00000000", "11111111", "99999999", "12345678", "23456789", "34567890", "45678901", "56789012", "67890123", "78901234", "89012345", "90123456", "01234567"]) {
    assert.equal(isAcceptableRandomCode(weak, 123), false, weak);
  }
  assert.equal(isAcceptableRandomCode("00000123", 123), false);
  assert.equal(isAcceptableRandomCode("1234567", 123), false);
  assert.equal(isAcceptableRandomCode("48291736", 123), true);
  assert.throws(() => buildNfeXml(paid({ ...BASE, randomCode: "12345678" })), /código aleatório/);
  assert.throws(() => buildNfeXml(paid({ ...BASE, randomCode: "00000123" })), /código aleatório/);
});

test("regras de negócio conferidas antes de escrever o XML: cada uma evita uma rejeição da SEFAZ", () => {
  const has = (input: NfeInput, piece: string) => nfeProblems(paid(input)).some((problem) => problem.includes(piece));
  // E16a-40 (696): não contribuinte fora de operação com consumidor final.
  assert.ok(has({ ...BASE, rules: { ...BASE.rules, finalConsumer: false } }, "venda a não contribuinte do ICMS tem de ser a consumidor final"));
  // N12-70 (508): CST 50 com não contribuinte.
  assert.ok(has({ ...BASE, rules: { ...BASE.rules, icmsCode: "50" } }, "CST 50 (suspensão)"));
  // Esquema: CST do PIS/COFINS e do IPI fora dos grupos que o sistema escreve.
  assert.ok(has({ ...BASE, rules: { ...BASE.rules, pisCst: "03" } }, "CST do PIS e da COFINS"));
  assert.ok(has({ ...BASE, rules: { ...BASE.rules, cofinsCst: "10" } }, "CST do PIS e da COFINS"));
  assert.ok(has({ ...BASE, rules: { ...BASE.rules, ipiCst: "60" } }, "CST do IPI da tabela"));
  // C10-20 (273): município do emitente de outro estado.
  assert.ok(has({ ...BASE, issuer: { ...BASE.issuer, cityCode: "2111300" } }, "não é do estado informado"));
  // NA09-10, NA09-20 e NA09-30 (697 e 698): alíquota interestadual pela origem e pelos dois estados, quando a nota leva o DIFAL.
  assert.ok(has({ ...BASE, items: BASE.items.map((item) => ({ ...item, origin: 2 })) }, "pede ICMS interestadual de 4%"));
  assert.ok(has({ ...BASE, icmsRate: 0.04 }, "pede ICMS interestadual de 7%"));
  assert.ok(has({ ...BASE, icmsRate: 0.07, recipient: { ...BASE.recipient, uf: "RJ", cityCode: "3304557", city: "Rio de Janeiro" } }, "pede ICMS interestadual de 12%"));
  assert.ok(has({ ...BASE, destination: { internalIcms: 0, fcp: 0 } }, "falta a alíquota interna do ICMS de MA"));
  // Para contribuinte a nota não leva o grupo do DIFAL, e essas regras da SEFAZ não se aplicam.
  assert.deepEqual(nfeProblems(paid({ ...BASE, icmsRate: 0.04, recipient: { ...BASE.recipient, ...TAXPAYER } })), []);

  assert.deepEqual([interstateRate(0, "SP", "MA"), interstateRate(0, "SP", "ES"), interstateRate(0, "SP", "RJ"), interstateRate(5, "BA", "SP"), interstateRate(0, "ES", "BA")], [0.07, 0.07, 0.12, 0.12, 0.12]);
  for (const origin of [1, 2, 3, 8]) assert.equal(interstateRate(origin, "SP", "MA"), 0.04);
  for (const origin of [0, 4, 5, 6, 7]) assert.equal(interstateRate(origin, "SP", "MA"), 0.07);

  // E-mail que não cabe em 60 letras fica de fora: cortado, seria outro endereço.
  const long = `${"a".repeat(55)}@cliente.test`;
  assert.doesNotMatch(buildNfeXml(paid({ ...BASE, recipient: { ...BASE.recipient, email: long } })).xml, /<email>/);
  assert.ok(buildNfeXml(paid(BASE)).xml.includes("<email>compras@academia.test</email>"));
});

test("resposta da SEFAZ: autorizada com alerta (120, NT 2026.002) vale como autorizada; consumo indevido (656) não é veredito sobre a nota", () => {
  const key = accessKey(BASE);
  const batch = (inner: string, code = "104") => `<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cStat>${code}</cStat><xMotivo>Rejeição: Consumo Indevido</xMotivo>${inner}</retEnviNFe>`;
  const alert = parseAuthorization(batch(`<protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><nProt>135260000012345</nProt><cStat>120</cStat><xMotivo>Autorizado o uso da NF-e, com alerta</xMotivo><cMsg>172</cMsg><xMsg>Alerta</xMsg></infProt></protNFe>`), key);
  assert.deepEqual([alert.status, alert.code], ["autorizada", "120"]);
  assert.deepEqual(parseAuthorization(batch("", "656"), key), { status: "sem-resposta", code: "656", reason: "Rejeição: Consumo Indevido" });
  assert.equal(parseAuthorization(batch("", "225"), key).status, "rejeitada");
});

test("consulta da nota: traz os eventos que a SEFAZ registrou (cancelamento e cartas), cada um com o seu protocolo", () => {
  const key = accessKey(BASE);
  const event = (type: string, sequence: number, detail: string, code: string, protocol: string, about = key) =>
    `<procEventoNFe versao="1.00"><evento versao="1.00"><infEvento Id="ID${type}${about}0${sequence}"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>12345678000195</CNPJ><chNFe>${about}</chNFe><dhEvento>2026-10-08T11:00:00-03:00</dhEvento><tpEvento>${type}</tpEvento><nSeqEvento>${sequence}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">${detail}</detEvento></infEvento></evento>` +
    `<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>${code}</cStat><xMotivo>Evento registrado</xMotivo><chNFe>${about}</chNFe><tpEvento>${type}</tpEvento><nSeqEvento>${sequence}</nSeqEvento><nProt>${protocol}</nProt></infEvento></retEvento></procEventoNFe>`;
  const answer =
    `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>101</cStat><xMotivo>Cancelamento de NF-e homologado</xMotivo><chNFe>${key}</chNFe>` +
    event("110110", 1, "<descEvento>Carta de Correção</descEvento><xCorrecao>Onde se lê Rua A &amp; B, leia-se Rua C.</xCorrecao>", "135", "135260000000011") +
    event("110111", 1, "<descEvento>Cancelamento</descEvento><nProt>135260000012345</nProt><xJust>Cliente desistiu da compra.</xJust>", "155", "135260000000012") +
    event("110110", 2, "<descEvento>Carta de Correção</descEvento><xCorrecao>Evento que a SEFAZ recusou.</xCorrecao>", "573", "135260000000013") +
    event("110111", 1, "<descEvento>Cancelamento</descEvento><xJust>De outra nota, não desta.</xJust>", "135", "135260000000014", "9".repeat(44)) +
    `</retConsSitNFe>`;
  const events = consultEvents(answer, key);
  assert.deepEqual(events.map(({ kind, sequence, protocol, code, text }) => [kind, sequence, protocol, code, text]), [
    ["correcao", 1, "135260000000011", "135", "Onde se lê Rua A & B, leia-se Rua C."],
    ["cancelamento", 1, "135260000000012", "155", "Cliente desistiu da compra."],
  ]);
  assert.ok(events[1].xml.startsWith("<procEventoNFe") && events[1].xml.includes("<nProt>135260000000012</nProt>"));
  assert.deepEqual(consultEvents("<retConsSitNFe><cStat>100</cStat></retConsSitNFe>", key), []);
});

test("CNPJ alfanumérico nos outros pedidos (PL_010d v1.03, NT 2026.004): evento, consulta e inutilização passam no esquema e a assinatura confere", async () => {
  const key = accessKey({ ...BASE, issuer: { ...BASE.issuer, cnpj: ALPHA_CNPJ } });
  const EVENT_PRELOAD = ["leiauteEvento_v1.00.xsd", "tiposBasico_v1.03.xsd", "xmldsig-core-schema_v1.01.xsd"];
  for (const [kind, text] of [["cancelamento", "Pedido cancelado pelo cliente antes da saída."], ["correcao", "Onde se lê Rua A, 10, leia-se Rua B, 20."]] as const) {
    const event = eventXml({ kind, environment: "producao", accessKey: key, cnpj: key.slice(6, 20), at: "2026-10-08T11:00:00-03:00", sequence: 1, protocol: "135260000012345", text });
    assert.equal(event.id, `ID${kind === "cancelamento" ? "110111" : "110110"}${key}01`);
    const signed = signEventXml(event.xml, signingKey);
    assert.equal(verifies(signed), true);
    const envelope = /<envEvento[\s\S]*<\/envEvento>/.exec(eventEnvelope(signed, "1"))![0];
    assert.deepEqual(await schemaErrors(envelope, "PL_010d_v1.03/Evento/envEvento_v1.00.xsd", EVENT_PRELOAD, "PL_010d_v1.03/Evento/"), [], kind);
  }

  const consult = /<consSitNFe[\s\S]*<\/consSitNFe>/.exec(consultEnvelope(key, "producao"))![0];
  assert.deepEqual(await schemaErrors(consult, "PL_010d_v1.03/NFe/consSitNFe_v4.00.xsd", ["leiauteConsSitNFe_v4.00.xsd", "tiposBasico_v4.00.xsd", "xmldsig-core-schema_v1.01.xsd"], "PL_010d_v1.03/NFe/"), []);

  const request = voidXml({ environment: "producao", stateCode: "35", year: "26", cnpj: ALPHA_CNPJ, series: 1, first: 44, last: 46, reason: "Numeração pulada por falha de sistema." });
  assert.equal(request.id, `ID3526${ALPHA_CNPJ}55001000000044000000046`);
  const signedRequest = signVoidXml(request.xml, signingKey);
  assert.equal(verifies(signedRequest), true);
  // O pacote 010d traz o leiaute da inutilização; o elemento raiz é o do arquivo inutNFe_v4.00.xsd de sempre.
  const voidErrors = await validateXML({
    xml: [{ fileName: "inutilizacao.xml", contents: signedRequest }],
    schema: [{ fileName: "inutNFe_v4.00.xsd", contents: fixture("inutNFe_v4.00.xsd") }],
    preload: ["leiauteInutNFe_v4.00.xsd", "tiposBasico_v4.00.xsd", "xmldsig-core-schema_v1.01.xsd"].map((fileName) => ({ fileName, contents: fixture(`PL_010d_v1.03/NFe/${fileName}`) })),
  });
  assert.deepEqual(voidErrors.errors.map((error) => error.message), []);
});

test("código de barras com letras (NT Conjunta 2025.001, item 6): conjunto C, troca para o A nas letras e volta ao C; só dígitos, igual ao 128C", () => {
  // O exemplo da nota técnica: 5225AB83.
  assert.deepEqual(code128Symbols("5225AB83"), [105, 52, 25, 101, 33, 34, 99, 83, 30, 106]);
  // "123A": 12 no conjunto C, e o 3 já no conjunto A, antes da letra.
  assert.deepEqual(code128Symbols("123A").slice(0, 5), [105, 12, 101, 19, 33]);
  // Número ímpar de dígitos depois das letras: o primeiro fica no A, os outros voltam em pares ao C.
  assert.deepEqual(code128Symbols("12AB12345").slice(1, 9), [12, 101, 33, 34, 17, 99, 23, 45]);
  for (const key of ["35261012345678000195550010000001231482917360", "00000000000000000000000000000000000000000000"]) assert.deepEqual(code128Symbols(key), code128cSymbols(key));

  const key = "35261012ABC34501DE35550010000001231482917364";
  const symbols = code128Symbols(key);
  // 35 26 10 12 | A: A B C 3 | C: 45 01 | A: D E | C: 35 55 … (os 26 dígitos do fim em 13 pares).
  assert.deepEqual(symbols.slice(0, 16), [105, 35, 26, 10, 12, 101, 33, 34, 35, 19, 99, 45, 1, 101, 36, 37]);
  assert.deepEqual(symbols.slice(16, 18), [99, 35]);
  assert.equal(symbols.at(-1), 106);
  // Cada símbolo tem 11 módulos; a parada, 13.
  assert.equal(code128Widths(key).reduce((sum, width) => sum + width, 0), (symbols.length - 1) * 11 + 13);
  assert.throws(() => code128Symbols("ab12"), /dígitos e letras maiúsculas/);
});

/** The words drawn on the first page, in the order they were drawn. */
async function firstPageTexts(bytes: Uint8Array): Promise<string[]> {
  const { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } = await import("pdf-lib");
  const document = await PDFDocument.load(bytes);
  const contents = document.getPages()[0].node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((reference) => document.context.lookup(reference)) : [contents];
  const code = streams.map((stream) => (stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : "")).join("\n");
  return [...code.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"));
}

test("DANFE (MOC 7.0, Anexo II, item 3.8): todos os campos do modelo estão no papel, nos dois leiautes; os que a nota não traz ficam em branco", async () => {
  const { xml } = buildNfeXml(paid({ ...BASE, freightMode: "2", transport: { carrier: CARRIER, volumes: 12, volumeKind: "Palete", netWeight: 1850.5, grossWeight: 1990 } }));
  const data = danfeData(xml);
  assert.deepEqual(data.model, { direction: "1", substituteRegistration: "", leftAt: "", vehicle: { antt: "", plate: "", uf: "" }, volumeBrand: "", volumeNumbering: "", taxAuthorityInfo: "" });
  const MODEL = [
    "INSCRIÇÃO ESTADUAL", "INSCRIÇÃO ESTADUAL DO SUBSTITUTO TRIBUTÁRIO", "DATA DA EMISSÃO", "DATA DA SAÍDA / ENTRADA", "HORA DA SAÍDA / ENTRADA", "FONE / FAX",
    "FRETE POR CONTA", "CÓDIGO ANTT", "PLACA DO VEÍCULO", "QUANTIDADE", "ESPÉCIE", "MARCA", "NUMERAÇÃO", "PESO BRUTO (kg)", "PESO LÍQUIDO (kg)",
    "INFORMAÇÕES COMPLEMENTARES", "RESERVADO AO FISCO", "2 - Terceiros", "CHAVE DE ACESSO", "PROTOCOLO DE AUTORIZAÇÃO DE USO", "SEM VALOR FISCAL",
  ];
  for (const reform of [false, true]) {
    const words = await firstPageTexts(await renderDanfe(data, { reform }));
    for (const label of MODEL) assert.ok(words.includes(label), `${reform ? "reforma" : "atual"}: ${label}`);
  }
  // O que o XML traz nesses campos é impresso: nada é inventado, nada é escondido.
  const filled = danfeData(
    xml
      .replace("<tpNF>1</tpNF>", "<dhSaiEnt>2026-10-09T08:15:00-03:00</dhSaiEnt><tpNF>1</tpNF>")
      .replace("</transporta>", "</transporta><veicTransp><placa>ABC1D23</placa><UF>SP</UF><RNTC>12345678</RNTC></veicTransp>")
      .replace("<esp>Palete</esp>", "<esp>Palete</esp><marca>Ludus</marca><nVol>1 a 12</nVol>")
      .replace("<infAdic>", "<infAdic><infAdFisco>Regime especial 123</infAdFisco>"),
  );
  const words = await firstPageTexts(await renderDanfe(filled));
  for (const value of ["09/10/2026", "08:15:00", "ABC1D23", "12345678", "Ludus", "1 a 12", "Regime especial 123"]) assert.ok(words.includes(value), value);
});

test("DANFE de nota com CNPJ alfanumérico: a chave sai em onze blocos e o papel é desenhado", async () => {
  const { xml, key } = buildNfeXml(paid({ ...BASE, issuer: { ...BASE.issuer, cnpj: ALPHA_CNPJ } }));
  const data = danfeData(xml);
  assert.deepEqual([data.key, data.issuer.document, data.model.direction], [key, ALPHA_CNPJ, "1"]);
  for (const reform of [false, true]) {
    const words = await firstPageTexts(await renderDanfe(data, { reform }));
    assert.ok(words.includes("3526 1012 ABC3 4501 DE35 5500 1000 0001 2314 8291 7364"));
  }
});

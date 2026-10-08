import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_FISCAL_RULES } from "@/lib/db/fiscal-rules";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import { orderNfe } from "@/lib/fiscal/order-nfe";
import type { OrderNfeSource } from "@/lib/fiscal/order-nfe";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

const RULES: FiscalRules = {
  ...EMPTY_FISCAL_RULES, operationNature: "Venda de mercadoria", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108",
  icmsCode: "00", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03, additionalInfo: "Texto fixo", ibsCbsCst: "000", ibsCbsClass: "000001",
};
const params = { ...DEFAULT_PARAMS, ipi: 0, stateRates: { ...DEFAULT_PARAMS.stateRates, MA: { ...DEFAULT_PARAMS.stateRates.MA, outboundIcms: 0.07 } } };

const SOURCE: OrderNfeSource = {
  settings: {
    legalName: "Ludus Equipamentos Ltda", cnpj: "12345678000195", stateRegistration: "110042490114", taxRegime: 3, street: "Rua das Máquinas", streetNumber: "100",
    district: "Distrito Industrial", city: "São José do Rio Preto", cityCode: null, uf: "SP", cep: "15035000", series: 1, nextNumber: 7, environment: "homologacao",
  },
  rules: RULES,
  order: {
    number: "261008-W9LG", discount: 0.37, taxpayer: false, deliveryUf: "MA", freight: 0,
    customer: {
      id: 1, kind: "PJ", document: "98765432000198", name: "Academia Teste Ltda", tradeName: null, contactName: "Ana", stateRegistration: "ISENTO", rg: null,
      phone: "98999990000", email: "ana@academia.test", cep: "65000000", street: "Av. Brasil", streetNumber: "500", complement: null, district: "Centro", city: "sao luis", uf: "MA",
    },
    items: [{ productId: 11, quantity: 4 }, { productId: 27, quantity: 1 }],
  },
  products: new Map([[11, { name: "Banco Regulável de 0 a 90°", code: "LD-WH011", table: 2998.3 }], [27, { name: "Desenvolvimento de Ombros Articulado", code: "LD-WH027", table: 10119.25 }]]),
  fiscal: new Map([[11, { ncm: "95069100", origin: 0, cest: null, unit: "UN" }], [27, { ncm: "95069100", origin: 0, cest: null, unit: "UN" }]]),
  params,
  receipts: [{ method: "PIX", amount: 8400 }, { method: "Boleto", amount: 5530.85 }],
  paymentCodes: new Map([["PIX", "17"], ["Boleto", "15"]]),
  freightMode: null,
  transport: { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null },
  delivery: null,
  number: 7,
  randomCode: "12345678",
  issuedAt: "2026-10-08T10:00:00-03:00",
  software: "ERP Avila Ops",
};

test("pedido fechado vira nota: preço com o desconto do pedido, ICMS de saída do destino, DIFAL, código do município pelo nome", () => {
  const { input, problems, totals } = orderNfe(SOURCE);
  assert.deepEqual(problems, []);
  assert.deepEqual([input.issuer.cityCode, input.recipient.cityCode], ["3549805", "2111300"]);
  assert.deepEqual([input.icmsRate, input.destination.internalIcms], [0.07, 0.23]);
  assert.equal(input.recipient.stateRegistration, null);
  // 4 × 1.888,93 + 6.375,13 (os valores do print do protótipo), e o pagamento fecha com a nota.
  assert.deepEqual([totals.products, totals.invoice], [13930.85, 13930.85]);
  assert.equal(input.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2), "13930.85");
  assert.equal(input.rules.additionalInfo, "Texto fixo - Pedido 261008-W9LG");
  const { xml } = buildNfeXml(input);
  assert.ok(xml.includes("<CFOP>6108</CFOP>") && xml.includes("<nNF>7</nNF>") && xml.includes("<tpAmb>2</tpAmb>"));
  // Frete: sem escolha, vale a sugestão (FOB sem frete por nossa conta, CIF com); a escolha do pedido manda.
  assert.ok(xml.includes("<modFrete>1</modFrete>"));
  assert.equal(orderNfe({ ...SOURCE, order: { ...SOURCE.order, freight: 350 } }).input.freightMode, "0");
  assert.equal(orderNfe({ ...SOURCE, freightMode: "9" }).input.freightMode, "9");
});

test("o que falta nos cadastros aparece como pendência, com o lugar onde se corrige; nada é inventado", () => {
  const { problems } = orderNfe({
    ...SOURCE,
    settings: { ...SOURCE.settings, cnpj: null, taxRegime: null },
    rules: EMPTY_FISCAL_RULES,
    fiscal: new Map(),
    paymentCodes: new Map([["PIX", "17"]]),
    order: { ...SOURCE.order, customer: { ...SOURCE.order.customer!, city: "Cidade Inventada" } },
  });
  for (const piece of ["Empresa: regime tributário", "Empresa: CNPJ", "Cliente: código do município", "natureza da operação", "CFOP de venda dentro do estado", "NCM com oito dígitos", "origem da mercadoria", "sem o código da nota"]) {
    assert.ok(problems.some((problem) => problem.includes(piece)), piece);
  }
  assert.ok(orderNfe({ ...SOURCE, order: { ...SOURCE.order, customer: null } }).problems.includes("Pedido sem cliente."));
  assert.ok(orderNfe({ ...SOURCE, order: { ...SOURCE.order, deliveryUf: "PI" } }).problems.some((problem) => problem.includes("informe o local de entrega")));
});

test("entrega em outro endereço: a nota leva o grupo de entrega, e o estado da entrega é o que define operação, alíquota e DIFAL", () => {
  const place = { name: null, document: null, cep: "64000000", street: "Rua da Obra", number: "77", complement: null, district: "Centro", city: "Teresina", uf: "PI", phone: null };
  // Cliente do Maranhão, pedido fechado para o Piauí: sem o local de entrega a nota não sai; com ele, sai para o Piauí.
  const order = { ...SOURCE.order, deliveryUf: "PI" as const };
  const { input, problems } = orderNfe({ ...SOURCE, order, delivery: place });
  assert.deepEqual(problems, []);
  assert.equal(input.delivery?.cityCode, "2211001");
  assert.equal(input.delivery?.document, SOURCE.order.customer!.document);
  assert.equal(input.icmsRate, SOURCE.params.stateRates.PI.outboundIcms ?? SOURCE.params.icmsInterstate);
  assert.deepEqual(input.destination, { internalIcms: SOURCE.params.stateRates.PI.internalIcms, fcp: SOURCE.params.stateRates.PI.fcp });
  // Local de entrega em estado diferente do que formou o preço do pedido é barrado.
  assert.ok(orderNfe({ ...SOURCE, delivery: place }).problems.some((problem) => problem.includes("corrija o local de entrega")));
  // Cliente de fora com entrega dentro do estado do emitente: operação interna, ICMS interno.
  const inside = orderNfe({ ...SOURCE, order: { ...SOURCE.order, deliveryUf: "SP" }, delivery: { ...place, city: "Campinas", uf: "SP", cep: "13010000" } });
  assert.deepEqual(inside.problems, []);
  assert.equal(inside.input.icmsRate, SOURCE.params.icmsSp);
  assert.equal(inside.totals.difal, 0);
});

test("dentro do estado usa o ICMS interno; centavos de diferença entre pagamento e nota vão para a última forma", () => {
  const inside = orderNfe({
    ...SOURCE,
    order: { ...SOURCE.order, deliveryUf: "SP", customer: { ...SOURCE.order.customer!, uf: "SP", city: "São Paulo" } },
    receipts: [{ method: "PIX", amount: 8400 }, { method: "Boleto", amount: 5530.86 }],
  });
  assert.equal(inside.input.icmsRate, params.icmsSp);
  assert.deepEqual(inside.problems, []);
  assert.equal(inside.input.payments.at(-1)?.amount, 5530.85);
  assert.equal(inside.totals.difal, 0);
});

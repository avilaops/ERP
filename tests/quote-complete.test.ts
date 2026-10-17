import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { addressLine } from "@/lib/contract/text";
import { normalizedAddress } from "@/lib/address";
import { completeQuote } from "@/lib/quote/complete";
import type { QuoteContext } from "@/lib/quote/complete";
import type { QuoteDocument } from "@/lib/quote/document";
import { renderQuotePdf } from "@/lib/quote/pdf";
import { checkedProposalDetails } from "@/lib/quote/settings";
import { pdfImages, pdfPieces, pdfText } from "./pdf-helpers.ts";

const document: QuoteDocument = {
  company: "Ludus Equipamentos", title: "Pedido #261016-HXKP", issuedOn: "16/10/2026", validUntil: null,
  seller: { name: "Vera Vendedora", email: "vera@example.com" }, manager: "DANILO RODRIGUES", place: null, signedAt: "16 de outubro de 2026",
  payment: ["Entrada de R$ 20.000 (46,7%) via PIX", "Saldo de R$ 22.824,48 em 3 parcelas via PIX:"], customer: null,
  delivery: "São Paulo", production: "30 dias corridos, contados do pagamento da entrada", notes: "Entregar em horário comercial.",
  items: [{ productId: 1, code: "LD-A001", name: "Equipamento", description: "Peso: 156 kg", quantity: 2, unitPrice: "R$ 10.000", unitDiscount: null, unitIpi: "R$ 1.300", unitWithIpi: "R$ 11.300", totalWithIpi: "R$ 22.600" }],
  hasDiscount: false, hasIpi: true, totals: [{ label: "Total da nota", value: "R$ 42.824,48", strong: true }], units: 3,
};
const address = { street: "Rua A, 81", streetNumber: "81", complement: null, district: "Jardim Vitória régia", city: "São José do rio preto", uf: "SP", cep: "15075170" };
const order = { number: "261016-HXKP", status: "fechado" as const, customer: null, items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], downPayment: 20000, customInstallments: [], installmentIntervalDays: 30 };
const context: QuoteContext = {
  issuer: { legalName: "Ludus Equipamentos Ltda", cnpj: "66058955000108", stateRegistration: "718319130117", street: "Rua Copacabana", streetNumber: "4108", district: "Parque Santa Felicia", city: "Votuporanga", cityCode: "3557105", uf: "SP", cep: "15505058", taxRegime: 3, series: 1, nextNumber: 1, environment: "homologacao" },
  companyDetails: { phone: "17997218555", email: "comercial@example.com", website: "https://example.com", warranty: "12 meses para defeitos de fabricação (dado fictício de teste).", installation: "Contratada separadamente." },
  orderDetails: { freightMode: "FOB", freightAmount: "1.200,50", deliveryEstimate: "5 dias úteis após a coleta (dado fictício de teste)." },
  delivery: { ...address, name: null, document: null, number: "81", phone: null },
  transport: { carrier: null, volumes: 4, volumeKind: "caixas", netWeight: 455, grossWeight: 480 },
  pix: { key: "66058955000108", name: "LUDUS EQUIPAMENTOS", city: "VOTUPORANGA" }, downPaymentOpen: 20000, downPaymentIsPix: true, acceptance: null,
};
const products = new Map([[1, { weightKg: 156, ncm: "95069100" }], [2, { weightKg: 143, ncm: "95069100" }]]);

test("proposta completa: cadastro, endereço, NCM, peso por quantidade, frete separado e periodicidade", () => {
  const complete = completeQuote(document, order, context, products);
  assert.match(complete.issuerLines!.join(" "), /66\.058\.955\/0001-08/);
  assert.match(complete.sections![0].lines.join(" "), /455 kg/);
  assert.match(complete.sections![0].lines.join(" "), /R\$ 1\.200,50; não integra/);
  assert.match(complete.sections![0].lines.join(" "), /São José do Rio Preto/);
  assert.match(complete.sections![0].lines.join(" "), /Volumes: 4/);
  assert.doesNotMatch(complete.sections![0].lines.join(" "), /81, 81/);
  assert.match(complete.items[0].description!, /NCM: 95069100/);
  assert.match(complete.payment.join(" "), /a cada 30 dias/);
  assert.equal(complete.manager, "Danilo Rodrigues");
  assert.equal(complete.status, "Pedido fechado · aguardando entrada");
  assert.deepEqual(complete.totals, document.totals);
});

test("PIX só para entrada via PIX pendente; valor parcial usa o saldo real e cancelado não cobra", () => {
  assert.equal(completeQuote(document, order, { ...context, downPaymentOpen: 10000 }, products).pix?.amount, "R$ 10.000");
  assert.match(completeQuote(document, order, context, products).pix!.code, /540820000\.00/);
  for (const patch of [{ pix: null }, { downPaymentIsPix: false }, { downPaymentOpen: 0 }]) assert.equal(completeQuote(document, order, { ...context, ...patch }, products).pix, undefined);
  assert.equal(completeQuote(document, { ...order, status: "cancelado" }, context, products).pix, undefined);
  assert.doesNotMatch(completeQuote(document, order, { ...context, downPaymentOpen: 0 }, products).status!, /aguardando entrada/);
});

test("ausências são explícitas; peso incompleto não vira peso total e parcelas personalizadas não ganham intervalo falso", () => {
  const complete = completeQuote(document, { ...order, customInstallments: [{ number: 1, dueDate: "2026-11-15", amount: 100, method: "PIX" }] }, { ...context, orderDetails: {}, companyDetails: {} }, new Map([[1, products.get(1)!]]));
  assert.match(complete.sections!.flatMap((s) => s.lines).join(" "), /prazo e cobertura a definir/);
  assert.match(complete.sections![0].lines.join(" "), /Peso total: completar/);
  assert.doesNotMatch(complete.payment.join(" "), /a cada/);
});

test("normalização remove número repetido, preserva complementos e números legítimos e usa município oficial", () => {
  assert.match(addressLine(address), /Rua A, 81 - Jardim Vitória Régia, São José do Rio Preto\/SP/);
  assert.equal(normalizedAddress({ ...address, street: "Avenida 81", streetNumber: "10", complement: "sala 81" }).street, "Avenida 81");
  assert.equal(normalizedAddress({ ...address, street: "Rua A, 81", streetNumber: "82" }).street, "Rua A, 81");
  assert.equal(normalizedAddress({ ...address, complement: "81" }).complement, "81");
});

test("campos comerciais recusam URLs perigosas, e-mail errado, frete inválido e textos sem limite", () => {
  for (const input of [{ website: "javascript:alert(1)" }, { email: "incorreto" }, { freightMode: "barco" }, { freightAmount: "-1" }, { freightMode: "CIF", freightAmount: "100,00" }, { warranty: "x".repeat(1001) }]) assert.throws(() => checkedProposalDetails(input));
  assert.deepEqual(checkedProposalDetails({ email: "  teste@example.com ", warranty: "  Texto   aprovado. " }), { email: "teste@example.com", warranty: "Texto aprovado." });
});

test("PDF completo pagina condições longas, imprime QR e preserva margens em todas as páginas", async () => {
  const full = completeQuote(document, order, { ...context, orderDetails: { ...context.orderDetails, warranty: "Cobertura e exclusões aprovadas. ".repeat(30), cancellation: "Condição de cancelamento aprovada. ".repeat(25) } }, products);
  const bytes = await renderQuotePdf(full, { logo: null, photos: new Map() });
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  assert.ok(pages > 1);
  const text = pdfText(bytes);
  for (const label of ["PIX DA ENTRADA", "66.058.955/0001-08", "455 kg", "GARANTIA E SERVIÇOS", "a cada 30 dias"]) assert.ok(text.includes(label), label);
  assert.equal(pdfImages(bytes), 1);
  for (const piece of pdfPieces(bytes)) assert.ok(piece.x >= 39 && piece.y >= 40 && piece.y <= 802, `${piece.text} fora da margem`);
  for (let page = 1; page <= pages; page++) assert.ok(text.includes(`Página ${page} de ${pages}`));
});

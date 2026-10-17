import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupCnpj } from "@/lib/cnpj";
import { completeFiscalCompany, saleOperationCodes, standardPaymentCode, suggestedTaxRegime } from "@/lib/fiscal/setup";
import type { FiscalSettings } from "@/lib/db/fiscal";

const CURRENT: FiscalSettings = {
  legalName: "Nome conferido", cnpj: "66058955000108", stateRegistration: "718319130117", taxRegime: null,
  street: "Rua conferida", streetNumber: "4108", district: null, city: "Votuporanga", cityCode: null, uf: "SP", cep: null,
  series: 2, nextNumber: 18, environment: "homologacao",
};

test("cadastro fiscal: completa vazios, preserva dados e numeração; regime ausente e MEI não viram regime normal", async () => {
  const company = await lookupCnpj(CURRENT.cnpj!, async () => ({ status: 200, json: async () => ({
    razao_social: "Nome da base pública", descricao_situacao_cadastral: "ATIVA", logradouro: "Rua da base", bairro: "Centro", municipio: "VOTUPORANGA", uf: "SP", cep: "15505058",
    opcao_pelo_simples: false, opcao_pelo_mei: false,
  }) }));
  const filled = completeFiscalCompany(CURRENT, company, true);
  assert.deepEqual([filled.legalName, filled.street, filled.stateRegistration, filled.series, filled.nextNumber, filled.environment], ["Nome conferido", "Rua conferida", "718319130117", 2, 18, "homologacao"]);
  assert.deepEqual([filled.district, filled.cep, filled.cityCode, filled.taxRegime], ["Centro", "15505058", "3557105", 3]);
  assert.equal(completeFiscalCompany(CURRENT, company, false).taxRegime, null);
  assert.equal(completeFiscalCompany({ ...CURRENT, taxRegime: 2 }, company, true).taxRegime, 2);
  assert.equal(suggestedTaxRegime({ ...company, fiscal: undefined }), null);
  assert.equal(suggestedTaxRegime({ ...company, fiscal: { ...company.fiscal!, mei: true } }), null);
  assert.equal(suggestedTaxRegime({ ...company, fiscal: { ...company.fiscal!, simples: true } }), 1);
  assert.throws(() => completeFiscalCompany(CURRENT, { ...company, cnpj: "48240052000161" }, true), /não é o da empresa/);
  assert.throws(() => completeFiscalCompany(CURRENT, { ...company, status: "BAIXADA" }, true), /empresa ativa/);
});

test("preparação fiscal: códigos conhecidos são exatos; prazo ou nome desconhecido não inventa meio de pagamento", () => {
  assert.equal(standardPaymentCode("Cartão de crédito (presencial)"), "03");
  assert.equal(standardPaymentCode("Link de pagamento - cartão de crédito"), "03");
  assert.equal(standardPaymentCode("Link de pagamento - PIX"), "17");
  assert.equal(standardPaymentCode("Link de pagamento"), null);
  assert.equal(standardPaymentCode(" PIX "), "17");
  assert.equal(standardPaymentCode("Cartão de crédito"), "03");
  for (const label of ["Na entrega", "Financiamento", "PIX ou cartão", "Outra forma"]) assert.equal(standardPaymentCode(label), null);
  assert.deepEqual(saleOperationCodes("revenda"), { operationNature: "Venda de mercadoria adquirida ou recebida de terceiros", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108" });
  assert.deepEqual(saleOperationCodes("producao"), { operationNature: "Venda de produção do estabelecimento", cfopInternal: "5101", cfopInterstate: "6101", cfopInterstateNonTaxpayer: "6107" });
});

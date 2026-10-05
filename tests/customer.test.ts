import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completenessText,
  customersCounter,
  formatCep,
  formatDocument,
  formatPhone,
  isComplete,
  isRequired,
  isValidCnpj,
  isValidCpf,
  matchesCustomer,
  missingFields,
  normalizeDocument,
  normalizeRegistration,
  taxpayerFromRegistration,
} from "@/lib/customer";
import type { CustomerInput } from "@/lib/customer";

/** The customer of the print (pedido-cliente.jpg): a complete company, ISENTO, in MA. */
const PRINT: CustomerInput = {
  kind: "PJ",
  document: "48240052000161",
  name: "TESTE",
  tradeName: "TESTE",
  contactName: "TESTE",
  stateRegistration: "ISENTO",
  rg: null,
  phone: "99999999999",
  email: "TESTE@TESTE.COM.BR",
  cep: "99999999",
  street: "TESTE",
  streetNumber: "123",
  complement: null,
  district: "TESTE",
  city: "TESTE",
  uf: "MA",
};

const PERSON: CustomerInput = {
  ...PRINT,
  kind: "PF",
  document: "52998224725",
  name: "Maria da Silva",
  tradeName: null,
  contactName: null,
  stateRegistration: null,
};

test("documento: a pontuação sai e as letras ficam maiúsculas", () => {
  assert.equal(normalizeDocument("48.240.052/0001-61"), "48240052000161");
  assert.equal(normalizeDocument(" 12.abc.345/01de-35 "), "12ABC34501DE35");
  assert.equal(normalizeDocument("529.982.247-25"), "52998224725");
  assert.equal(normalizeDocument(""), "");
});

test("CNPJ: o do print e um com letras fecham no módulo 11; dígito trocado não", () => {
  assert.equal(isValidCnpj("48240052000161"), true);
  assert.equal(isValidCnpj("12ABC34501DE35"), true);
  assert.equal(isValidCnpj("11222333000181"), true);
  for (const bad of [
    "48240052000162",
    "48240052000171",
    "48240053000161",
    "12ABC34501DE36",
    "12ABD34501DE35",
    "4824005200016",
    "482400520001611",
    "48.240.052/0001-61",
    "12abc34501de35",
    "48240052000A61",
    "00000000000000",
    "",
  ]) {
    assert.equal(isValidCnpj(bad), false, bad);
  }
});

test("CPF: onze dígitos com os dois verificadores; todos iguais não vale", () => {
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("11144477735"), true);
  for (const bad of ["52998224726", "52998224735", "62998224725", "11111111111", "00000000000", "5299822472", "529.982.247-25", ""]) {
    assert.equal(isValidCpf(bad), false, bad);
  }
});

test("formatos de tela: CNPJ, CPF, celular e CEP", () => {
  assert.equal(formatDocument("48240052000161"), "48.240.052/0001-61");
  assert.equal(formatDocument("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(formatDocument("52998224725"), "529.982.247-25");
  assert.equal(formatDocument("123"), "123");
  assert.equal(formatPhone("99999999999"), "(99) 99999-9999");
  assert.equal(formatPhone("1733334444"), "(17) 3333-4444");
  assert.equal(formatCep("99999999"), "99999-999");
});

test("inscrição estadual: ISENTO em qualquer caixa, número sem pontuação, vazio é nulo", () => {
  assert.equal(normalizeRegistration("isento"), "ISENTO");
  assert.equal(normalizeRegistration(" Isento "), "ISENTO");
  assert.equal(normalizeRegistration("123.456.789.110"), "123456789110");
  assert.equal(normalizeRegistration(""), null);
  assert.equal(normalizeRegistration("   "), null);
});

test("contribuinte do ICMS: só empresa com inscrição em número", () => {
  assert.equal(taxpayerFromRegistration("PJ", "123456789110"), true);
  assert.equal(taxpayerFromRegistration("PJ", "ISENTO"), false);
  assert.equal(taxpayerFromRegistration("PJ", null), false);
  assert.equal(taxpayerFromRegistration("PF", null), false);
  assert.equal(taxpayerFromRegistration("PF", "123456789110"), false);
});

test("cadastro completo: o cliente do print não tem campo faltando; fantasia e complemento não contam", () => {
  assert.deepEqual(missingFields(PRINT), []);
  assert.equal(isComplete(PRINT), true);
  assert.equal(completenessText(PRINT), "Cadastro completo");
  assert.deepEqual(missingFields({ ...PRINT, tradeName: null, complement: null }), []);

  assert.deepEqual(missingFields({ ...PRINT, email: null }), ["E-mail"]);
  assert.equal(completenessText({ ...PRINT, email: null }), "Falta 1 campo");
  assert.deepEqual(missingFields({ ...PRINT, email: "  ", uf: null, stateRegistration: null }), [
    "Inscrição estadual",
    "E-mail",
    "UF",
  ]);
  assert.equal(completenessText({ ...PRINT, email: null, uf: null }), "Faltam 2 campos");
});

test("cadastro completo de pessoa física: RG não é exigido, inscrição e responsável não se aplicam", () => {
  assert.deepEqual(missingFields(PERSON), []);
  assert.deepEqual(missingFields({ ...PERSON, rg: null, phone: null, cep: null }), ["Celular", "CEP"]);
  assert.equal(isRequired("PF", "rg"), false);
  assert.equal(isRequired("PF", "stateRegistration"), false);
  assert.equal(isRequired("PJ", "stateRegistration"), true);
  assert.equal(isRequired("PJ", "tradeName"), false);
  assert.equal(isRequired("PJ", "complement"), false);

  const minimal: CustomerInput = { ...PERSON, phone: null, email: null, cep: null, street: null, streetNumber: null, district: null, city: null, uf: null };
  assert.deepEqual(missingFields(minimal), ["Celular", "E-mail", "CEP", "Endereço", "Número", "Bairro", "Cidade", "UF"]);
});

test("busca: nome e fantasia sem acento, documento com ou sem pontuação", () => {
  const customer = { name: "Academia Força Total Ltda", tradeName: "Força Total", document: "48240052000161" };
  for (const search of ["", "  ", "academia", "forca", "FORÇA TOTAL", "48.240.052/0001-61", "48240052", "0001-61", "052/0001"]) {
    assert.equal(matchesCustomer(customer, search), true, search);
  }
  for (const search of ["ludus", "99999999", "48.240.053"]) assert.equal(matchesCustomer(customer, search), false, search);
  assert.equal(matchesCustomer({ ...customer, tradeName: null }, "total ltda"), true);
});

test("contador da lista: singular e plural", () => {
  assert.equal(customersCounter(1), "1 cliente");
  assert.equal(customersCounter(0), "0 clientes");
  assert.equal(customersCounter(12), "12 clientes");
});

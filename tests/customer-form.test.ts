import assert from "node:assert/strict";
import { test } from "node:test";
import { CUSTOMER_FIELDS, customerToForm, parseCustomerForm, rawCustomerValues } from "@/lib/customer-form";
import type { CustomerFieldKey, CustomerFormValues } from "@/lib/customer-form";

const reader = (values: CustomerFormValues) => (key: CustomerFieldKey) => values[key] ?? null;

/** The record of the print, as it is typed. */
const PRINT: CustomerFormValues = {
  document: "48.240.052/0001-61",
  stateRegistration: "isento",
  name: " TESTE ",
  tradeName: "TESTE",
  contactName: "TESTE",
  phone: "(99) 99999-9999",
  email: "TESTE@TESTE.COM.BR",
  cep: "99999-999",
  street: "TESTE",
  streetNumber: "123",
  complement: "",
  district: "TESTE",
  city: "TESTE",
  uf: "MA",
};

const PRINT_INPUT = {
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

test("empresa: a ficha do print é lida sem pontuação, e a UF escolhida vale mais que a do CEP", () => {
  assert.deepEqual(parseCustomerForm("PJ", reader(PRINT)), { ok: true, input: PRINT_INPUT });
});

test("o que foi gravado vai para os campos com pontuação e volta igual", () => {
  const parsed = parseCustomerForm("PJ", reader(PRINT));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const values = customerToForm(parsed.input);
  assert.equal(values.document, "48.240.052/0001-61");
  assert.equal(values.phone, "(99) 99999-9999");
  assert.equal(values.cep, "99999-999");
  assert.equal(values.stateRegistration, "ISENTO");
  assert.equal(values.complement, "");
  assert.equal("rg" in values, false);
  assert.deepEqual(parseCustomerForm("PJ", reader(values)), parsed);
});

test("para gravar bastam o documento e o nome; UF em branco com CEP válido recebe o estado do CEP", () => {
  const minimal = parseCustomerForm("PJ", reader({ document: "12.ABC.345/01DE-35", name: "Academia" }));
  assert.ok(minimal.ok);
  if (minimal.ok) {
    assert.equal(minimal.input.document, "12ABC34501DE35");
    assert.equal(minimal.input.uf, null);
    assert.equal(minimal.input.stateRegistration, null);
    assert.equal(minimal.input.phone, null);
  }

  const byCep = parseCustomerForm("PJ", reader({ document: "48240052000161", name: "Academia", cep: "99999999" }));
  assert.ok(byCep.ok && byCep.input.uf === "RS" && byCep.input.cep === "99999999");
  const lower = parseCustomerForm("PJ", reader({ document: "48240052000161", name: "Academia", uf: "ma" }));
  assert.ok(lower.ok && lower.input.uf === "MA");
});

test("pessoa física: sem inscrição, fantasia nem responsável, mesmo que o formulário mande", () => {
  const parsed = parseCustomerForm(
    "PF",
    reader({ document: "529.982.247-25", name: "Maria da Silva", rg: "12.345.678-9", stateRegistration: "123456", tradeName: "X", contactName: "Y" }),
  );
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(
    [parsed.input.kind, parsed.input.document, parsed.input.rg, parsed.input.stateRegistration, parsed.input.tradeName, parsed.input.contactName],
    ["PF", "52998224725", "12.345.678-9", null, null, null],
  );
  // E o RG não existe na ficha da empresa.
  const company = parseCustomerForm("PJ", reader({ ...PRINT, rg: "123" }));
  assert.ok(company.ok && company.input.rg === null);
});

test("cada campo inválido vira um erro com o rótulo dele, todos de uma vez", () => {
  const parsed = parseCustomerForm(
    "PJ",
    reader({ ...PRINT, document: "48.240.052/0001-62", name: "  ", stateRegistration: "ABC123", phone: "99999", email: "sem-arroba", cep: "9999", uf: "XX" }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.invalid, ["document", "name", "stateRegistration", "phone", "email", "cep", "uf"]);
  assert.deepEqual(parsed.errors, [
    '"CNPJ": número inválido, confira os dígitos.',
    '"Razão social": informe a razão social.',
    '"Inscrição estadual": informe o número (2 a 14 dígitos) ou ISENTO.',
    '"Celular": informe o DDD e o número (10 ou 11 dígitos).',
    '"E-mail": informe um e-mail com @.',
    '"CEP": informe os 8 dígitos.',
    '"UF": escolha um estado da lista.',
  ]);

  const person = parseCustomerForm("PF", reader({ document: "111.111.111-11", name: "" }));
  assert.ok(!person.ok);
  if (!person.ok) assert.deepEqual(person.errors, ['"CPF": número inválido, confira os dígitos.', '"Nome completo": informe o nome completo.']);
  // CNPJ na ficha de pessoa física, e o contrário, não valem.
  assert.equal(parseCustomerForm("PF", reader({ document: "48240052000161", name: "X" })).ok, false);
  assert.equal(parseCustomerForm("PJ", reader({ document: "52998224725", name: "X" })).ok, false);
  assert.equal(parseCustomerForm("PJ", () => null).ok, false);
});

test("inscrição estadual em número é aceita com pontuação", () => {
  const parsed = parseCustomerForm("PJ", reader({ ...PRINT, stateRegistration: "123.456.789.110" }));
  assert.ok(parsed.ok && parsed.input.stateRegistration === "123456789110");
  assert.equal(parseCustomerForm("PJ", reader({ ...PRINT, stateRegistration: "1" })).ok, false);
});

test("as fichas têm os campos do manual, e o texto digitado volta como veio", () => {
  assert.deepEqual(CUSTOMER_FIELDS.PJ.main.map((field) => field.label), [
    "CNPJ",
    "Inscrição estadual",
    "Razão social",
    "Nome fantasia",
    "Nome do responsável",
    "Celular",
    "E-mail",
  ]);
  assert.deepEqual(CUSTOMER_FIELDS.PF.main.map((field) => field.label), ["Nome completo", "CPF", "RG", "Celular", "E-mail"]);
  assert.deepEqual(CUSTOMER_FIELDS.PF.address.map((field) => field.label), ["CEP", "Endereço", "Número", "Complemento", "Bairro", "Cidade", "UF"]);
  assert.equal(CUSTOMER_FIELDS.PJ.address, CUSTOMER_FIELDS.PF.address);

  const raw = rawCustomerValues("PF", reader({ document: " abc ", name: "Maria" }));
  assert.equal(raw.document, " abc ");
  assert.equal(raw.name, "Maria");
  assert.equal(raw.city, "");
  assert.equal("stateRegistration" in raw, false);
});

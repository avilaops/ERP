import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatMoney,
  formatPercent,
  parseDays,
  parseMoney,
  parsePercent,
  showMoney,
  showMultiplier,
  showPercent,
} from "@/lib/format";
import { PARAM_FIELDS, paramsToForm, parseParamsForm, rawFormValues } from "@/lib/params-form";
import type { ParamKey, ParamsFormValues } from "@/lib/params-form";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

const reader = (values: Partial<ParamsFormValues>) => (key: ParamKey) => values[key] ?? null;

test("percentual: vírgula decimal vira fração exata", () => {
  assert.equal(parsePercent("9,25"), 0.0925);
  assert.equal(parsePercent("0,5"), 0.005);
  assert.equal(parsePercent("15"), 0.15);
  assert.equal(parsePercent(" 34 "), 0.34);
  assert.equal(parsePercent("0"), 0);
  assert.equal(parsePercent("9.25"), 0.0925);
  assert.equal(parsePercent("99,99"), 0.9999);
  assert.equal(parsePercent("28,11565"), 0.2811565);
  assert.equal(parsePercent("007"), 0.07);
});

test("percentual: vazio, texto, negativo e 100 ou mais não são aceitos", () => {
  for (const text of ["", "  ", "abc", "-1", "100", "150", "1,2,3", "1e2", "12%", ",5", "5,"]) {
    assert.equal(parsePercent(text), null, JSON.stringify(text));
  }
});

test("percentual: formatar não deixa zeros nem ruído de ponto flutuante", () => {
  assert.equal(formatPercent(0.0925), "9,25");
  assert.equal(formatPercent(0.005), "0,5");
  assert.equal(formatPercent(0.15), "15");
  assert.equal(formatPercent(0), "0");
  assert.equal(formatPercent(0.07), "7");
  assert.equal(formatPercent(0.2811565), "28,11565");
  assert.equal(showPercent(0.3725), "37,3%");
  assert.equal(showPercent(0.65, 0), "65%");
  assert.equal(showMultiplier(3.12266), "3,123");
});

test("reais: milhar com ponto e centavos com vírgula", () => {
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("1234,56"), 1234.56);
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney("50.000"), 50000);
  assert.equal(parseMoney("R$ 1.000,5"), 1000.5);
  for (const text of ["", "abc", "-1", "1,234.56", "12,345", "1.23", "1.2345,00"]) {
    assert.equal(parseMoney(text), null, JSON.stringify(text));
  }
  assert.equal(formatMoney(1234.5), "1.234,50");
  assert.equal(formatMoney(0), "0,00");
  assert.equal(showMoney(0), "R$ 0");
  assert.equal(showMoney(220000), "R$ 220.000");
  assert.equal(showMoney(1234.5), "R$ 1.234,50");
});

test("dias: só inteiro maior que zero", () => {
  assert.equal(parseDays("7"), 7);
  assert.equal(parseDays(" 30 "), 30);
  for (const text of ["", "0", "7,5", "7.5", "-7", "sete"]) assert.equal(parseDays(text), null, JSON.stringify(text));
});

test("formulário: formatar e reler os 15 parâmetros atuais devolve os mesmos valores", () => {
  assert.equal(PARAM_FIELDS.length, 15);
  assert.deepEqual(PARAM_FIELDS.map((field) => field.key).sort(), Object.keys(DEFAULT_PARAMS).sort());

  const form = paramsToForm(DEFAULT_PARAMS);
  assert.equal(form.pisCofins, "9,25");
  assert.equal(form.ads, "0,5");
  assert.equal(form.proposalValidityDays, "7");
  assert.equal(form.fixedMonthlyExpenses, "0,00");

  const parsed = parseParamsForm(reader(form));
  assert.deepEqual(parsed, { ok: true, params: DEFAULT_PARAMS });
});

test("formulário: outros valores também vão e voltam iguais", () => {
  const params = { ...DEFAULT_PARAMS, targetNetProfit: 0.125, ads: 0.00125, fixedMonthlyExpenses: 48750.5, gateway: 0.0349 };
  assert.deepEqual(parseParamsForm(reader(paramsToForm(params))), { ok: true, params });
});

test("formulário: cada campo inválido vira um erro com o rótulo dele, todos de uma vez", () => {
  const form = { ...paramsToForm(DEFAULT_PARAMS), ipi: "abc", commission: "100", proposalValidityDays: "7,5", ads: "" };
  const parsed = parseParamsForm(reader(form));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.invalid.sort(), ["ads", "commission", "ipi", "proposalValidityDays"]);
  assert.equal(parsed.errors.length, 4);
  assert.ok(parsed.errors.some((error) => error.startsWith('"IPI destacado na nota": informe um percentual')));
  assert.ok(parsed.errors.some((error) => error.startsWith('"Comissão": informe um percentual')));
  assert.ok(parsed.errors.some((error) => error.startsWith('"Validade da proposta": informe um número inteiro de dias')));
  assert.ok(parsed.errors.some((error) => error.startsWith('"Anúncios / Ads"')));
});

test("formulário: campo ausente, negativo ou dias zerados dão erro", () => {
  const base = paramsToForm(DEFAULT_PARAMS);
  for (const change of [{ freeDiscount: "-1" }, { proposalValidityDays: "0" }, { fixedMonthlyExpenses: "-10" }]) {
    assert.equal(parseParamsForm(reader({ ...base, ...change })).ok, false, JSON.stringify(change));
  }
  const missing = parseParamsForm(() => null);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errors.length, 15);
});

test("formulário: o texto digitado é devolvido como veio, para a tela repetir", () => {
  const typed = { ...paramsToForm(DEFAULT_PARAMS), ipi: "abc" };
  assert.equal(rawFormValues(reader(typed)).ipi, "abc");
  assert.equal(rawFormValues(() => null).ipi, "");
});

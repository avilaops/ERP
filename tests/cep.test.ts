import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCep, ufFromCep } from "@/lib/cep";
import { UFS } from "@/lib/pricing/states";

test("CEP: oito dígitos, com ou sem hífen", () => {
  assert.equal(normalizeCep("99999-999"), "99999999");
  assert.equal(normalizeCep(" 01310100 "), "01310100");
  for (const bad of ["", "9999-999", "999999999", "99.999-999", "abcde-fgh", "99999 999", "99999-99a"]) {
    assert.equal(normalizeCep(bad), null, bad);
  }
});

test("UF pelo CEP: o do print cai no RS", () => {
  assert.equal(ufFromCep("99999-999"), "RS");
  assert.equal(ufFromCep("01310-100"), "SP");
  assert.equal(ufFromCep("65000-000"), "MA");
  assert.equal(ufFromCep("20040002"), "RJ");
});

test("UF pelo CEP: uma amostra de cada uma das 27 UFs, e as faixas que dividem estado", () => {
  const samples: [string, string][] = [
    ["01000-000", "SP"], ["19999-999", "SP"], ["20000-000", "RJ"], ["28999-999", "RJ"], ["29100-000", "ES"],
    ["30130-000", "MG"], ["39999-999", "MG"], ["40000-000", "BA"], ["48999-999", "BA"], ["49000-000", "SE"],
    ["50000-000", "PE"], ["56999-999", "PE"], ["57000-000", "AL"], ["58000-000", "PB"], ["59000-000", "RN"],
    ["60000-000", "CE"], ["63999-999", "CE"], ["64000-000", "PI"], ["65999-999", "MA"], ["66000-000", "PA"],
    ["68899-999", "PA"], ["68900-000", "AP"], ["68999-999", "AP"], ["69000-000", "AM"], ["69299-999", "AM"],
    ["69300-000", "RR"], ["69399-999", "RR"], ["69400-000", "AM"], ["69899-999", "AM"], ["69900-000", "AC"],
    ["70000-000", "DF"], ["72799-999", "DF"], ["72800-000", "GO"], ["72999-999", "GO"], ["73000-000", "DF"],
    ["73699-999", "DF"], ["73700-000", "GO"], ["76799-999", "GO"], ["76800-000", "RO"], ["77000-000", "TO"],
    ["78000-000", "MT"], ["78899-999", "MT"], ["79000-000", "MS"], ["80000-000", "PR"], ["87999-999", "PR"],
    ["88000-000", "SC"], ["89999-999", "SC"], ["90000-000", "RS"],
  ];
  for (const [cep, uf] of samples) assert.equal(ufFromCep(cep), uf, cep);
  assert.deepEqual([...new Set(samples.map(([, uf]) => uf))].sort(), [...UFS].sort());
});

test("UF pelo CEP: fora das faixas ou malformado não tem estado", () => {
  for (const cep of ["00999-999", "00000-000", "78900-000", "78999-999", "", "abc", "9999-999", "999999999"]) {
    assert.equal(ufFromCep(cep), null, cep);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { cityCode, findCity } from "@/lib/fiscal/cities";

test("código do município no IBGE: achado pelo nome e pelo estado, sem ligar para acento, caixa ou hífen", () => {
  assert.equal(cityCode("São José do Rio Preto", "SP"), "3549805");
  assert.equal(cityCode("  sao jose do rio preto ", "SP"), "3549805");
  assert.equal(cityCode("SÃO LUÍS", "MA"), "2111300");
  assert.equal(cityCode("Alta Floresta D'Oeste", "RO"), "1100015");
  assert.equal(cityCode("alta floresta d oeste", "RO"), "1100015");
  assert.deepEqual(findCity("rio de janeiro", "RJ"), { name: "Rio de Janeiro", code: "3304557" });
});

test("código do município: nome que não existe, estado errado ou em branco dá nulo, nunca palpite", () => {
  assert.equal(cityCode("São Luís", "SP"), null);
  assert.equal(cityCode("Sao Jose", "SP"), null);
  assert.equal(cityCode("Cidade Inventada", "MA"), null);
  assert.equal(cityCode(null, "SP"), null);
  assert.equal(cityCode("São Paulo", null), null);
  assert.equal(cityCode("São Paulo", "XX"), null);
});

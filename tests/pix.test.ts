import assert from "node:assert/strict";
import { test } from "node:test";
import { crc16, pixCode, pixKey, pixText } from "@/lib/pix";

test("PIX copia e cola: o exemplo do manual do Banco Central sai igual, com o mesmo CRC", () => {
  const code = pixCode({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA", amount: null, identifier: null });
  assert.equal(code, "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D");
  assert.equal(crc16("123456789"), "29B1");
});

test("PIX copia e cola: valor com centavos, identificador só com letras e números, nome e cidade sem acento e no tamanho", () => {
  const code = pixCode({ key: "66058955000108", name: "Ludus Equipamentos para Musculação Ltda", city: "Votuporanga", amount: 11334.57, identifier: "261008-RUZL/1" });
  assert.ok(code.includes("540811334.57"));
  assert.ok(code.includes("5925Ludus Equipamentos para M"));
  assert.ok(code.includes("6011Votuporanga"));
  assert.ok(code.includes("62150511261008RUZL1"));
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
  assert.equal(pixText("São José do Rio Preto", 15), "Sao Jose do Rio");
  // Sem valor, quem paga digita; valor zero é o mesmo que sem valor.
  assert.ok(!pixCode({ key: "a@b.co", name: "A", city: "B", amount: 0, identifier: null }).includes("5303986540"));
});

test("chave PIX: os cinco tipos, como o banco espera, e o que não é chave", () => {
  assert.deepEqual(pixKey(" 66.058.955/0001-08 "), { kind: "cnpj", key: "66058955000108" });
  assert.deepEqual(pixKey("529.982.247-25"), { kind: "cpf", key: "52998224725" });
  assert.deepEqual(pixKey("Financeiro@Empresa.com.br"), { kind: "email", key: "financeiro@empresa.com.br" });
  assert.deepEqual(pixKey("(17) 99777-5154"), { kind: "telefone", key: "+5517997775154" });
  assert.deepEqual(pixKey("+55 17 99777-5154"), { kind: "telefone", key: "+5517997775154" });
  assert.deepEqual(pixKey("123E4567-E12B-12D1-A456-426655440000"), { kind: "aleatoria", key: "123e4567-e12b-12d1-a456-426655440000" });
  for (const bad of ["", "abc", "111.111.111-11", "66.058.955/0001-09", "12345"]) assert.equal(pixKey(bad), null, bad);
});

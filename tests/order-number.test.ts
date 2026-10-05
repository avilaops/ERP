import assert from "node:assert/strict";
import { test } from "node:test";
import { ORDER_NUMBER, ORDER_NUMBER_ALPHABET, orderNumber } from "@/lib/order-number";

test("número do pedido: AAMMDD e quatro caracteres do alfabeto sem I, O, 0 e 1", () => {
  assert.equal(ORDER_NUMBER_ALPHABET.length, 32);
  for (const confusing of ["I", "O", "0", "1"]) assert.ok(!ORDER_NUMBER_ALPHABET.includes(confusing), confusing);

  let next = 0;
  const number = orderNumber("2026-09-30", (max) => {
    assert.equal(max, 32);
    return next++;
  });
  assert.equal(number, "260930-ABCD");
  assert.equal(orderNumber("2026-09-30", () => 31), "260930-9999");
  assert.equal(orderNumber("2027-01-05", () => 0), "270105-AAAA");

  for (let seed = 0; seed < 32; seed += 1) {
    const drawn = orderNumber("2026-09-30", (max) => (seed * 7 + 3) % max);
    assert.match(drawn, /^260930-[A-HJ-NP-Z2-9]{4}$/);
    assert.match(drawn, ORDER_NUMBER);
  }
  // Os números dos prints cabem no alfabeto.
  for (const suffix of ["BBMN", "536F", "K62T"]) {
    assert.ok([...suffix].every((character) => ORDER_NUMBER_ALPHABET.includes(character)), suffix);
  }
});

test("número do pedido: data ou sorteio fora do esperado dão erro", () => {
  for (const date of ["30/09/2026", "2026-9-30", "", "260930"]) assert.throws(() => orderNumber(date, () => 0), /Data inválida/, date);
  assert.throws(() => orderNumber("2026-09-30", () => 32), /fora do alfabeto/);
  assert.throws(() => orderNumber("2026-09-30", () => -1), /fora do alfabeto/);
});

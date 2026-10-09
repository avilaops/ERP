import assert from "node:assert/strict";
import { test } from "node:test";
import { completionDate, productionText } from "@/lib/order-quote";
import { addBusinessDays } from "@/lib/pricing/payment";

test("dias úteis: de segunda a sexta, atravessando fins de semana; contar a partir do fim de semana começa na segunda", () => {
  // 09/10/2026 é sexta-feira.
  assert.equal(addBusinessDays("2026-10-09", 0), "2026-10-09");
  assert.equal(addBusinessDays("2026-10-09", 1), "2026-10-12");
  assert.equal(addBusinessDays("2026-10-09", 5), "2026-10-16");
  assert.equal(addBusinessDays("2026-10-07", 3), "2026-10-12");
  assert.equal(addBusinessDays("2026-10-05", 45), "2026-12-07");
  // Sábado e domingo: o primeiro dia útil é a segunda.
  assert.equal(addBusinessDays("2026-10-10", 1), "2026-10-12");
  assert.equal(addBusinessDays("2026-10-11", 5), "2026-10-16");
  // Confere com a contagem dia a dia, para vários começos e prazos.
  for (const start of ["2026-10-05", "2026-10-08", "2026-10-09", "2026-12-28"]) {
    for (const days of [2, 4, 7, 10, 13, 23, 60]) {
      let ms = Date.parse(`${start}T00:00:00Z`);
      for (let left = days; left > 0; ) {
        ms += 86_400_000;
        const weekday = new Date(ms).getUTCDay();
        if (weekday !== 0 && weekday !== 6) left -= 1;
      }
      assert.equal(addBusinessDays(start, days), new Date(ms).toISOString().slice(0, 10), `${start} + ${days}`);
    }
  }
  assert.throws(() => addBusinessDays("2026-10-09", -1), /zero ou mais/);
  assert.throws(() => addBusinessDays("2026-10-09", 1.5), /inteiro/);
});

test("conclusão do pedido: em dias corridos ou úteis, conforme combinado; o texto diz qual", () => {
  assert.equal(completionDate("2026-10-09", 90, "corridos"), "2027-01-07");
  assert.equal(completionDate("2026-10-09", 90, undefined), "2027-01-07");
  assert.equal(completionDate("2026-10-09", 45, "uteis"), "2026-12-11");
  assert.equal(completionDate("2026-10-09", null, "uteis"), null);
  assert.deepEqual([productionText(90, "corridos"), productionText(45, "uteis"), productionText(1, "uteis"), productionText(1, undefined)], ["90 dias corridos", "45 dias úteis", "1 dia útil", "1 dia corrido"]);
});

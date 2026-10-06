import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { listGoals, listSellers, saveGoal } from "@/lib/db/goals";
import { createUser } from "@/lib/db/users";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const BOSS = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("goals");
});
after(async () => {
  if (!skip) await db.close();
});

test("metas: uma da equipe e uma por vendedor em cada mês; gravar de novo altera, não duplica", { skip }, async () => {
  assert.deepEqual(await listGoals("2026-10", db.pool), []);
  await saveGoal(null, "2026-10", 150000, BOSS, db.pool);
  await saveGoal(" Ana@Teste.Local ", "2026-10", 50000, BOSS, db.pool);
  await saveGoal(null, "2026-10", 180000.5, BOSS, db.pool);
  await saveGoal("ana@teste.local", "2026-10", 60000, BOSS, db.pool);
  await saveGoal(null, "2026-11", 200000, BOSS, db.pool);
  assert.deepEqual(await listGoals("2026-10", db.pool), [
    { sellerEmail: null, amount: 180000.5 },
    { sellerEmail: "ana@teste.local", amount: 60000 },
  ]);
  assert.deepEqual(await listGoals("2026-11", db.pool), [{ sellerEmail: null, amount: 200000 }]);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM sales_goals")).rows[0].count), 3);

  await assert.rejects(() => saveGoal(null, "2026-10", -1, BOSS, db.pool), /zero ou mais/);
  await assert.rejects(() => saveGoal(" ", "2026-10", 10, BOSS, db.pool), /Escolha o vendedor/);
  await assert.rejects(() => saveGoal(null, "10/2026", 10, BOSS, db.pool), /Mês inválido/);
});

test("quem vende: usuários ativos de vendedor e gerente; diretoria e financeiro ficam de fora", { skip }, async () => {
  await createUser({ email: "ana@teste.local", name: "Ana", role: "VENDEDOR" }, BOSS, db.pool);
  await createUser({ email: "gil@teste.local", name: "Gil", role: "GERENTE_COMERCIAL" }, BOSS, db.pool);
  await createUser({ email: "fin@teste.local", name: "Fin", role: "FINANCEIRO" }, BOSS, db.pool);
  await createUser({ email: BOSS, name: "Diretora", role: "DIRETORIA" }, BOSS, db.pool);
  assert.deepEqual(await listSellers(db.pool), [
    { email: "ana@teste.local", name: "Ana" },
    { email: "gil@teste.local", name: "Gil" },
  ]);
});

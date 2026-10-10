import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { decideAccess, sessionFrom } from "@/lib/auth/access";
import type { DirectoryUser } from "@/lib/auth/directory";
import { menuOf } from "@/lib/auth/permissions";
import { modulesOff, productionEnabled, setProductionEnabled } from "@/lib/db/modules";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("modules");
});
after(async () => {
  if (!skip) await db.close();
});

test("produção: nasce desligada, a empresa liga e desliga, e quem altera fica registrado", { skip }, async () => {
  assert.equal(await productionEnabled(db.pool), false);
  assert.deepEqual(await modulesOff(db.pool), ["producao"]);
  await setProductionEnabled(true, "diretoria@teste.local", db.pool);
  assert.equal(await productionEnabled(db.pool), true);
  assert.deepEqual(await modulesOff(db.pool), []);
  await assert.rejects(() => setProductionEnabled(false, " ", db.pool), /quem está alterando/);
  await setProductionEnabled(false, "diretoria@teste.local", db.pool);
  assert.deepEqual(await modulesOff(db.pool), ["producao"]);
});

test("módulo desligado some do menu e das telas de todos, sem dar tela que o perfil não tem", () => {
  const tenant = { slug: "ludus", name: "Ludus Equipamentos" };
  const boss: DirectoryUser = { email: "dono@empresa.test", name: "Dono", role: "DIRETORIA", tenant };
  // Ligado: a diretoria tem a tela, como sempre.
  assert.equal(decideAccess({ authenticated: true, user: { ...boss, off: [] } }, "producao").kind, "allow");
  assert.equal(sessionFrom({ authenticated: true, user: { ...boss, off: [] } })!.items, null);

  const off = { ...boss, off: ["producao"] };
  const session = sessionFrom({ authenticated: true, user: off })!;
  assert.equal(decideAccess({ authenticated: true, user: off }, "producao").kind, "no-access");
  assert.equal(decideAccess({ authenticated: true, user: off }, "pedidos").kind, "allow");
  assert.ok(!menuOf(session).some((item) => item.key === "producao") && menuOf(session).some((item) => item.key === "parametros"));

  // Quem já tinha as telas reduzidas perde só a do módulo; o vendedor não ganha nada.
  const narrowed = sessionFrom({ authenticated: true, user: { ...off, items: ["pedidos", "producao"] } })!;
  assert.deepEqual(narrowed.items, ["pedidos"]);
  const seller = sessionFrom({ authenticated: true, user: { ...off, role: "VENDEDOR" } })!;
  assert.equal(decideAccess({ authenticated: true, user: { ...off, role: "VENDEDOR" } }, "parametros").kind, "no-access");
  assert.ok(!seller.items!.includes("producao"));
});

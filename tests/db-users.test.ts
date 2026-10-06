import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createUser, findActiveUser, listUsers, updateUser } from "@/lib/db/users";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const BOSS = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("users");
});
after(async () => {
  if (!skip) await db.close();
});

test("usuários: a diretoria cadastra, o e-mail fica em minúsculas e o login acha só quem está ativo", { skip }, async () => {
  assert.deepEqual(await listUsers(db.pool), []);
  const boss = await createUser({ email: BOSS, name: "Diretora", role: "DIRETORIA" }, BOSS, db.pool);
  const seller = await createUser({ email: "  Ana@Teste.Local ", name: " Ana ", role: "VENDEDOR" }, BOSS, db.pool);
  assert.deepEqual([seller.email, seller.name, seller.role, seller.active], ["ana@teste.local", "Ana", "VENDEDOR", true]);
  assert.deepEqual((await findActiveUser("ANA@teste.local", db.pool))?.role, "VENDEDOR");
  assert.equal(await findActiveUser("ninguem@teste.local", db.pool), null);

  await assert.rejects(() => createUser({ email: "ana@teste.local", name: "Outra", role: "FINANCEIRO" }, BOSS, db.pool), /Já existe usuário com este e-mail/);
  for (const email of ["", "ana", "ana@", "a b@c.d", "ana@teste"]) {
    await assert.rejects(() => createUser({ email, name: "X", role: "VENDEDOR" }, BOSS, db.pool), /e-mail válido/, email);
  }
  await assert.rejects(() => createUser({ email: "x@y.z", name: " ", role: "VENDEDOR" }, BOSS, db.pool), /Informe o nome/);
  await assert.rejects(() => createUser({ email: "x@y.z", name: "X", role: "DONO" as never }, BOSS, db.pool), /perfil da lista/);

  // Mudar o perfil e desativar: quem está desativado não entra mais, e continua na lista.
  const promoted = await updateUser(seller.id, { name: "Ana Souza", role: "GERENTE_COMERCIAL", active: true }, BOSS, db.pool);
  assert.deepEqual([promoted.name, promoted.role, promoted.email], ["Ana Souza", "GERENTE_COMERCIAL", "ana@teste.local"]);
  await updateUser(seller.id, { name: "Ana Souza", role: "GERENTE_COMERCIAL", active: false }, BOSS, db.pool);
  assert.equal(await findActiveUser("ana@teste.local", db.pool), null);
  assert.deepEqual((await listUsers(db.pool)).map((user) => [user.email, user.active]), [[BOSS, true], ["ana@teste.local", false]]);
  await assert.rejects(() => updateUser(999999, { name: "X", role: "VENDEDOR", active: true }, BOSS, db.pool), /Usuário não encontrado/);

  // Ninguém tira o próprio acesso; o próprio nome pode mudar.
  const own = /não pode mudar o próprio perfil nem desativar o próprio acesso/;
  await assert.rejects(() => updateUser(boss.id, { name: "Diretora", role: "VENDEDOR", active: true }, BOSS, db.pool), own);
  await assert.rejects(() => updateUser(boss.id, { name: "Diretora", role: "DIRETORIA", active: false }, " Diretoria@Teste.Local ", db.pool), own);
  assert.equal((await updateUser(boss.id, { name: "Diretora Geral", role: "DIRETORIA", active: true }, BOSS, db.pool)).name, "Diretora Geral");
  assert.deepEqual((await findActiveUser(BOSS, db.pool))?.role, "DIRETORIA");
});

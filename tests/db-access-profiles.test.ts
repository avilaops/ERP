import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { allows, approvesAtLoss, managesCommissions, menuFor, powersOf, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import { cleanProfile, createProfile, deleteProfile, listProfiles, ProfileError, updateProfile } from "@/lib/db/access-profiles";
import { createUser, findActiveUser, listUsers, updateUser, UserError } from "@/lib/db/users";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const BOSS = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("profiles");
});
after(async () => {
  if (!skip) await db.close();
});

test("poderes: cada um é de alguns tipos; um perfil só abre mão, nunca ganha", () => {
  assert.deepEqual(powersOf("DIRETORIA").map((power) => power.key), ["custos", "pedidos-da-equipe", "aprova-prejuizo", "metas", "comissoes", "estornos"]);
  assert.deepEqual(powersOf("VENDEDOR"), []);
  assert.deepEqual(powersOf("FINANCEIRO").map((power) => power.key), ["comissoes"]);
  // O tipo sozinho vale como sempre valeu.
  assert.deepEqual([seesCosts("DIRETORIA"), seesCosts("GERENTE_COMERCIAL"), seesAllOrders("GERENTE_COMERCIAL"), seesAllOrders("VENDEDOR")], [true, false, true, false]);
  // Sessão com perfil que abriu mão do poder: o tipo de origem não devolve.
  assert.equal(seesCosts({ role: "DIRETORIA", denied: ["custos"] }), false);
  assert.equal(approvesAtLoss({ role: "DIRETORIA", denied: ["custos"] }), true);
  assert.equal(managesCommissions({ role: "FINANCEIRO", denied: ["comissoes"] }), false);
  // Negar o que o tipo não tem não muda nada, e nada vira permissão.
  assert.equal(seesCosts({ role: "VENDEDOR", denied: [] }), false);
  assert.equal(seesAllOrders({ role: "VENDEDOR", denied: null }), false);
});

test("perfil: telas e poderes são só os do tipo de origem; tela que mostra custo exige o poder de ver custo", () => {
  const clean = cleanProfile({ name: "  Fiscal  da   casa ", baseRole: "FINANCEIRO", items: ["recebimentos", "produtos", "parametros", "inventada"], denied: ["comissoes", "custos", "x"] });
  // Produtos e Parâmetros não são do Financeiro, e "custos" não é poder dele: ficam de fora.
  assert.deepEqual(clean, { name: "Fiscal da casa", baseRole: "FINANCEIRO", items: ["recebimentos"], denied: ["comissoes"] });
  assert.throws(() => cleanProfile({ name: "X", baseRole: "VENDEDOR", items: ["pedidos"], denied: [] }), /de 2 a 40 letras/);
  assert.throws(() => cleanProfile({ name: "Vazio", baseRole: "VENDEDOR", items: ["produtos"], denied: [] }), /pelo menos uma tela/);
  assert.throws(() => cleanProfile({ name: "Sem custo", baseRole: "DIRETORIA", items: ["pedidos", "produtos", "parametros"], denied: ["custos"] }), (error: unknown) => error instanceof ProfileError && /Produtos e custos e Parâmetros mostram custo/.test(error.message));
  assert.deepEqual(cleanProfile({ name: "Sem custo", baseRole: "DIRETORIA", items: ["pedidos", "aprovacoes"], denied: ["custos"] }).denied, ["custos"]);
});

test("perfil no banco: criar, alterar e remover; a pessoa recebe as telas e os poderes do perfil, e a mudança vale para quem o tem", { skip }, async () => {
  assert.deepEqual(await listProfiles(db.pool), []);
  const fiscal = await createProfile({ name: "Comercial sem custo", baseRole: "DIRETORIA", items: ["pedidos", "clientes", "aprovacoes", "dashboard"], denied: ["custos", "metas"] }, BOSS, db.pool);
  assert.deepEqual([fiscal.baseRole, fiscal.items, fiscal.denied], ["DIRETORIA", ["dashboard", "aprovacoes", "pedidos", "clientes"], ["custos", "metas"]]);
  await assert.rejects(() => createProfile({ name: "comercial SEM custo", baseRole: "VENDEDOR", items: ["pedidos"], denied: [] }, BOSS, db.pool), /Já existe um perfil/);

  // Convidar com o perfil: o tipo gravado é o de origem, as telas vêm do perfil, e o que foi marcado na pessoa não conta.
  const ana = await createUser({ email: "Ana@Empresa.test", name: "Ana", role: "VENDEDOR", items: ["produtos"], profileId: fiscal.id }, BOSS, db.pool);
  assert.deepEqual([ana.role, ana.items, ana.profileId, ana.profileName, ana.denied], ["DIRETORIA", ["dashboard", "aprovacoes", "pedidos", "clientes"], fiscal.id, "Comercial sem custo", ["custos", "metas"]]);
  const session = (await findActiveUser("ana@empresa.test", db.pool))!;
  assert.deepEqual([allows(session, "pedidos"), allows(session, "produtos"), allows(session, "equipe"), seesCosts(session), seesAllOrders(session), approvesAtLoss(session)], [true, false, false, false, true, true]);
  await assert.rejects(() => createUser({ email: "x@empresa.test", name: "X", role: "VENDEDOR", profileId: 999 }, BOSS, db.pool), (error: unknown) => error instanceof UserError && /Perfil não encontrado/.test(error.message));

  // Mudou o perfil, mudou para quem o tem; o tipo de origem não muda.
  const changed = await updateProfile(fiscal.id, { name: "Comercial", items: ["pedidos"], denied: ["custos", "metas", "pedidos-da-equipe"] }, BOSS, db.pool);
  assert.deepEqual([changed.name, changed.baseRole, changed.items], ["Comercial", "DIRETORIA", ["pedidos"]]);
  const after = (await findActiveUser("ana@empresa.test", db.pool))!;
  assert.deepEqual([after.items, after.profileName, seesAllOrders(after), allows(after, "clientes")], [["pedidos"], "Comercial", false, false]);
  assert.equal((await listProfiles(db.pool))[0].people, 1);
  // Ninguém muda o perfil que tem: é assim que a diretoria se tranca do lado de fora.
  await assert.rejects(() => updateProfile(fiscal.id, { name: "Comercial", items: ["pedidos", "clientes"], denied: [] }, "ana@empresa.test", db.pool), /seu próprio perfil/);
  await assert.rejects(() => updateProfile(999, { name: "Nada", items: ["pedidos"], denied: [] }, BOSS, db.pool), /não encontrado/);

  // Com gente dentro o perfil não sai; a pessoa volta a um dos quatro tipos e aí ele sai.
  await assert.rejects(() => deleteProfile(fiscal.id, db.pool), /Há pessoas com este perfil/);
  const back = await updateUser(ana.id, { name: "Ana", role: "VENDEDOR", active: true, items: null, profileId: null }, BOSS, db.pool);
  assert.deepEqual([back.role, back.items, back.profileId, back.denied], ["VENDEDOR", null, null, []]);
  assert.equal(menuFor("VENDEDOR").every((item) => allows(back, item.key)), true);
  assert.deepEqual(await deleteProfile(fiscal.id, db.pool), { name: "Comercial" });
  assert.deepEqual(await listProfiles(db.pool), []);
  assert.equal((await listUsers(db.pool)).length, 1);
});

test("login: quem tem perfil da empresa entra com o tipo de origem, as telas e os poderes do perfil, e o nome dele no menu", async () => {
  const { sessionFrom, decideAccess } = await import("@/lib/auth/access");
  const { createCombinedDirectory, createEnvDirectory } = await import("@/lib/auth/directory");
  const tenants = [{ slug: "ludus", name: "Ludus Equipamentos" }];
  const directory = createCombinedDirectory(createEnvDirectory("dono@empresa.test:DIRETORIA", tenants), tenants, async (_tenant, email) =>
    email === "ana@empresa.test" ? { name: "Ana", role: "DIRETORIA", items: ["pedidos", "aprovacoes"], denied: ["custos"], profileName: "Comercial sem custo" } : null,
  );
  const [ana] = await directory.findMemberships("Ana@Empresa.test");
  const session = sessionFrom({ authenticated: true, user: ana })!;
  assert.deepEqual([session.role, session.items, session.denied, session.profile], ["DIRETORIA", ["pedidos", "aprovacoes"], ["custos"], "Comercial sem custo"]);
  assert.equal(seesCosts(session), false);
  assert.equal(decideAccess({ authenticated: true, user: ana }, "pedidos").kind, "allow");
  // Tela do tipo de origem que o perfil não tem: sem acesso, mesmo sendo Diretoria por baixo.
  assert.equal(decideAccess({ authenticated: true, user: ana }, "produtos").kind, "no-access");
  assert.equal(decideAccess({ authenticated: true, user: ana }, "equipe").kind, "no-access");
  // Quem vem da configuração do servidor segue com o tipo inteiro.
  const [owner] = await directory.findMemberships("dono@empresa.test");
  const full = sessionFrom({ authenticated: true, user: owner })!;
  assert.deepEqual([full.denied, full.profile, seesCosts(full)], [[], null, true]);
});

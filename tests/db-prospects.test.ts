import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CnpjError } from "@/lib/cnpj";
import type { CompanyRecord } from "@/lib/cnpj";
import { createCustomer } from "@/lib/db/customers";
import { deleteOpportunity, getOpportunity } from "@/lib/db/funnel";
import { convertProspect, deleteProspect, IMPORT_LIMIT, importProspects, listProspects, ProspectError, prospectTotals, setProspectDiscarded } from "@/lib/db/prospects";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("prospeccao");
});
after(async () => {
  if (!skip) await db.close();
});

const record = (cnpj: string, over: Partial<CompanyRecord> = {}): CompanyRecord => ({
  cnpj, legalName: "FIT CLUB ACADEMIA LTDA", tradeName: "Fit Club", status: "ATIVA", activity: "Atividades de condicionamento físico", size: "MICRO EMPRESA", openedOn: "2019-03-11",
  street: "Rua A", number: "10", complement: null, district: "Centro", city: "VOTUPORANGA", uf: "SP", cep: "15500000", phone: "17999990000", email: "contato@fitclub.test", ...over,
});

test("prospecção: empresas entram pelo CNPJ, são filtradas, viram oportunidade uma vez só e voltam à lista se a oportunidade sai", { skip }, async () => {
  const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
  const asked: string[] = [];
  const registry: Record<string, CompanyRecord | string> = {
    "11222333000181": record("11222333000181"),
    "48240052000161": record("48240052000161", { legalName: "IRON BOX CROSSFIT LTDA", tradeName: null, city: "SAO PAULO", activity: "Ensino de esportes", phone: null, email: null }),
    "11444777000161": record("11444777000161", { legalName: "CLUBE NAUTICO", tradeName: "Náutico", status: "BAIXADA", city: "RIO DE JANEIRO", uf: "RJ" }),
    "06990590000123": "CNPJ não encontrado na Receita.",
  };
  const lookup = async (cnpj: string) => {
    asked.push(cnpj);
    const found = registry[cnpj];
    if (typeof found === "string" || !found) throw new CnpjError(String(found ?? "sem resposta"));
    return found;
  };

  await assert.rejects(() => importProspects("  \n ", SELLER.email, lookup, db.pool), /ao menos um CNPJ/);
  await assert.rejects(() => importProspects(Array.from({ length: IMPORT_LIMIT + 1 }, (_value, index) => String(index).padStart(14, "0")).join("\n"), SELLER.email, lookup, db.pool), (error: unknown) => error instanceof ProspectError && /No máximo 20/.test(error.message));
  assert.equal(asked.length, 0);
  // Com pontuação, repetido, inválido e desconhecido: cada um tem o seu resultado, e os bons entram.
  const results = await importProspects("11.222.333/0001-81\n48240052000161; 11222333000181, 11.111.111/1111-11\n06.990.590/0001-23 11444777000161", SELLER.email, lookup, db.pool);
  assert.deepEqual(results.map((result) => [result.cnpj, result.outcome]), [["11222333000181", "novo"], ["48240052000161", "novo"], ["11111111111111", "recusado"], ["06990590000123", "recusado"], ["11444777000161", "novo"]]);
  // O inválido nem é perguntado à Receita.
  assert.deepEqual(asked, ["11222333000181", "48240052000161", "06990590000123", "11444777000161"]);
  // De novo: atualiza os dados e mantém o estado de trabalho.
  await setProspectDiscarded("11444777000161", true, SELLER.email, db.pool);
  registry["11444777000161"] = record("11444777000161", { legalName: "CLUBE NAUTICO", tradeName: "Náutico Novo", status: "BAIXADA", city: "RIO DE JANEIRO", uf: "RJ" });
  assert.deepEqual((await importProspects("11444777000161", SELLER.email, lookup, db.pool)).map((result) => [result.outcome, result.detail]), [["atualizado", "Náutico Novo"]]);
  assert.deepEqual(await prospectTotals(db.pool), { novo: 2, descartado: 1, virou: 0, ufs: ["RJ", "SP"] });

  const all = { status: "novo" as const, search: "", uf: null, city: "" };
  assert.deepEqual((await listProspects(all, db.pool)).map((prospect) => prospect.cnpj).sort(), ["11222333000181", "48240052000161"]);
  assert.deepEqual((await listProspects({ ...all, search: "crossfit" }, db.pool)).map((prospect) => prospect.legalName), ["IRON BOX CROSSFIT LTDA"]);
  assert.deepEqual((await listProspects({ ...all, search: "condicionamento" }, db.pool)).map((prospect) => prospect.tradeName), ["Fit Club"]);
  assert.deepEqual((await listProspects({ ...all, search: "4824" }, db.pool)).length, 1);
  assert.deepEqual((await listProspects({ ...all, city: "votu" }, db.pool)).map((prospect) => prospect.city), ["VOTUPORANGA"]);
  assert.deepEqual(await listProspects({ ...all, uf: "RJ" }, db.pool), []);
  // O que foi digitado no filtro é texto, não padrão de busca.
  assert.equal((await listProspects({ ...all, search: "%" }, db.pool)).length, 2);
  assert.deepEqual((await listProspects({ ...all, status: "descartado" }, db.pool)).map((prospect) => [prospect.tradeName, prospect.registryStatus]), [["Náutico Novo", "BAIXADA"]]);

  // Virar oportunidade: de quem pediu, na primeira etapa, com o que a Receita disse; uma vez só.
  const id = await convertProspect("11222333000181", SELLER, db.pool);
  const made = (await getOpportunity(id, { ownerEmail: SELLER.email }, db.pool))!;
  assert.deepEqual([made.title, made.company, made.phone, made.email, made.source, made.stageKind, made.customerId], ["Prospecção: Fit Club", "Fit Club", "17999990000", "contato@fitclub.test", "Prospecção", "aberta", null]);
  assert.equal(made.notes, "CNPJ 11.222.333/0001-81 · FIT CLUB ACADEMIA LTDA\nSituação na Receita: ATIVA\nAtividades de condicionamento físico\nVOTUPORANGA/SP");
  await assert.rejects(() => convertProspect("11222333000181", SELLER, db.pool), /já virou oportunidade/);
  await assert.rejects(() => convertProspect("00000000000191", SELLER, db.pool), /não encontrada na lista/);
  await assert.rejects(() => setProspectDiscarded("11222333000181", true, SELLER.email, db.pool), /não encontrada/);
  assert.deepEqual((await listProspects({ ...all, status: "virou" }, db.pool)).map((prospect) => [prospect.cnpj, prospect.opportunityId]), [["11222333000181", id]]);
  // Empresa que já é cliente entra como o cliente do cadastro.
  const customer = await createCustomer({ kind: "PJ", document: "48240052000161", name: "Iron Box Crossfit Ltda", tradeName: null, contactName: null, stateRegistration: null, rg: null, phone: null, email: null, cep: null, street: null, streetNumber: null, complement: null, district: null, city: null, uf: null }, SELLER.email, db.pool);
  assert.equal((await listProspects(all, db.pool))[0].isCustomer, true);
  const second = await convertProspect("48240052000161", SELLER, db.pool);
  assert.equal((await getOpportunity(second, { ownerEmail: null }, db.pool))!.customerId, customer.id);

  // A oportunidade foi excluída: a empresa volta para a lista. Remover tira de vez.
  await deleteOpportunity(id, { ownerEmail: null }, db.pool);
  assert.deepEqual((await listProspects(all, db.pool)).map((prospect) => [prospect.cnpj, prospect.status, prospect.opportunityId]), [["11222333000181", "novo", null]]);
  await setProspectDiscarded("11444777000161", false, SELLER.email, db.pool);
  await deleteProspect("11444777000161", db.pool);
  await assert.rejects(() => deleteProspect("11444777000161", db.pool), /não encontrada/);
  await deleteProspect("48240052000161", db.pool);
  assert.ok(await getOpportunity(second, { ownerEmail: null }, db.pool));
  assert.deepEqual(await prospectTotals(db.pool), { novo: 1, descartado: 0, virou: 0, ufs: ["SP"] });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMembership, parseTenants } from "@/lib/auth/tenants";
import { tenantSchema } from "@/lib/db/config";

const TENANTS = parseTenants("ludus:Ludus Equipamentos;acme:Acme Fitness");
const [LUDUS, ACME] = TENANTS;

test("empresas: identificador e nome", () => {
  assert.deepEqual(TENANTS, [
    { slug: "ludus", name: "Ludus Equipamentos" },
    { slug: "acme", name: "Acme Fitness" },
  ]);
  assert.deepEqual(parseTenants(undefined), []);
  assert.deepEqual(parseTenants(" ; "), []);
  assert.deepEqual(parseTenants(" ludus : Ludus "), [{ slug: "ludus", name: "Ludus" }]);
  assert.throws(() => parseTenants("ludus"), /entrada inválida/);
  assert.throws(() => parseTenants("ludus:Ludus:sobrando"), /entrada inválida/);
  assert.throws(() => parseTenants("ludus:A;ludus:B"), /empresa repetida ludus/);
});

test("empresas: identificador que não serve para nome de esquema é recusado", () => {
  for (const slug of ["Ludus", "1ludus", "ludus-eq", "lu dus", "l", "", 'ludus"', "a".repeat(40)]) {
    assert.throws(() => parseTenants(`${slug}:Nome`), /ERP_TENANTS/, slug);
  }
  assert.equal(tenantSchema("ludus"), "tenant_ludus");
  assert.equal(tenantSchema("acme_2"), "tenant_acme_2");
  // A camada de banco confere de novo, venha de onde vier.
  for (const slug of ["Ludus", "ludus; DROP SCHEMA public", "ludus.orders", ""]) {
    assert.throws(() => tenantSchema(slug), /Identificador de empresa inválido/, slug);
  }
});

test("qual empresa a requisição usa: a escolhida entre as da pessoa, ou a primeira", () => {
  const both = [{ tenant: LUDUS, role: "DIRETORIA" }, { tenant: ACME, role: "VENDEDOR" }];
  const onlyAcme = [{ tenant: ACME, role: "VENDEDOR" }];

  assert.equal(chooseMembership(both)?.tenant, LUDUS);
  assert.equal(chooseMembership(both, "acme")?.tenant, ACME);
  assert.equal(chooseMembership(both, "outra")?.tenant, LUDUS);
  // A preferência nunca dá acesso a empresa que não é da pessoa.
  assert.equal(chooseMembership(onlyAcme, "ludus")?.tenant, ACME);
  assert.equal(chooseMembership([], "ludus"), null);
});

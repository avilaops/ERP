import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMembership, normalizeHost, parseTenants, tenantForHost } from "@/lib/auth/tenants";
import { tenantSchema } from "@/lib/db/config";

const TENANTS = parseTenants("ludus:Ludus Equipamentos:ludusequipamentos.com.br,ludusequipamentos.com;acme:Acme Fitness");
const [LUDUS, ACME] = TENANTS;

test("empresas: identificador, nome e domínios próprios", () => {
  assert.deepEqual(TENANTS, [
    { slug: "ludus", name: "Ludus Equipamentos", hosts: ["ludusequipamentos.com.br", "ludusequipamentos.com"] },
    { slug: "acme", name: "Acme Fitness", hosts: [] },
  ]);
  assert.deepEqual(parseTenants(undefined), []);
  assert.deepEqual(parseTenants(" ; "), []);
  assert.deepEqual(parseTenants(" ludus : Ludus ").map((tenant) => [tenant.slug, tenant.name]), [["ludus", "Ludus"]]);
});

test("empresas: identificador que não serve para nome de esquema é recusado", () => {
  for (const slug of ["Ludus", "1ludus", "ludus-eq", "lu dus", "l", "", "ludus;drop", 'ludus"', "a".repeat(40)]) {
    assert.throws(() => parseTenants(`${slug}:Nome`), /ERP_TENANTS/, slug);
  }
  assert.equal(tenantSchema("ludus"), "tenant_ludus");
  assert.equal(tenantSchema("acme_2"), "tenant_acme_2");
  // A camada de banco confere de novo, venha de onde vier.
  for (const slug of ["Ludus", "ludus; DROP SCHEMA public", "ludus.orders", "", "public"]) {
    if (slug === "public") continue;
    assert.throws(() => tenantSchema(slug), /Identificador de empresa inválido/, slug);
  }
});

test("domínio: o próprio da empresa leva a ela; o compartilhado, a nenhuma", () => {
  assert.equal(tenantForHost(TENANTS, "ludusequipamentos.com.br"), LUDUS);
  assert.equal(tenantForHost(TENANTS, "LudusEquipamentos.com:443"), LUDUS);
  assert.equal(tenantForHost(TENANTS, "erp.avilaops.com"), null);
  assert.equal(tenantForHost(TENANTS, "www.ludusequipamentos.com.br"), null);
  assert.equal(tenantForHost(TENANTS, null), null);
  assert.equal(tenantForHost(TENANTS, ""), null);
  assert.equal(normalizeHost(" Erp.Exemplo.com.br:3020 "), "erp.exemplo.com.br");
});

test("qual empresa a requisição usa: o domínio manda; sem ele, a escolhida entre as da pessoa, ou a primeira", () => {
  const both = [{ tenant: LUDUS, role: "DIRETORIA" }, { tenant: ACME, role: "VENDEDOR" }];
  const onlyAcme = [{ tenant: ACME, role: "VENDEDOR" }];

  assert.equal(chooseMembership(both, { hostTenant: null })?.tenant, LUDUS);
  assert.equal(chooseMembership(both, { hostTenant: null, preferred: "acme" })?.tenant, ACME);
  assert.equal(chooseMembership(both, { hostTenant: null, preferred: "outra" })?.tenant, LUDUS);
  // A preferência nunca dá acesso a empresa que não é da pessoa.
  assert.equal(chooseMembership(onlyAcme, { hostTenant: null, preferred: "ludus" })?.tenant, ACME);
  assert.equal(chooseMembership([], { hostTenant: null, preferred: "ludus" }), null);

  // No domínio da Ludus: só a Ludus, mesmo pedindo outra.
  assert.equal(chooseMembership(both, { hostTenant: LUDUS, preferred: "acme" })?.tenant, LUDUS);
  assert.equal(chooseMembership(onlyAcme, { hostTenant: LUDUS }), null);
  assert.equal(chooseMembership(onlyAcme, { hostTenant: LUDUS, preferred: "acme" }), null);
});

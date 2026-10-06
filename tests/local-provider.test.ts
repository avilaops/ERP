import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/dev/login/enter/route.ts";
import { getSession, requirePermission } from "@/lib/auth/index";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";
import { ROLES } from "@/lib/auth/roles";
import { APP_URL, redirectOf, SECRET, setCookies, withEnv } from "./helpers.ts";

const PRODUCTION = {
  NODE_ENV: "production",
  ERP_LOCAL_LOGIN: "1",
  SSO_JWT_SECRET: SECRET,
  APP_URL,
  ERP_TENANTS: "ludus:Ludus Equipamentos",
  ERP_USERS: "dir@teste.local:DIRETORIA",
};

const enter = (role: string) =>
  POST(
    new Request("http://localhost:3020/dev/login/enter", {
      method: "POST",
      body: new URLSearchParams({ role }),
    }),
  );

test("em development e test, com ERP_LOCAL_LOGIN=1, o provedor local tem um usuário por perfil", () => {
  for (const NODE_ENV of ["development", "test"]) {
    const provider = localProvider({ NODE_ENV, ERP_LOCAL_LOGIN: "1", ERP_TENANTS: "ludus:Ludus Equipamentos" });
    assert.ok(provider.available);
    assert.deepEqual(provider.users.map((user) => user.role), [...ROLES]);
    assert.ok(provider.users.every((user) => user.email.endsWith("@teste.local")));
    assert.equal(provider.userFromCookie("VENDEDOR")?.role, "VENDEDOR");
    assert.equal(provider.userFromCookie("ADMIN"), null);
    assert.equal(provider.userFromCookie(undefined), null);
  }
});

test("em produção, ou com NODE_ENV ausente ou desconhecido, o provedor local é indisponível", () => {
  assert.deepEqual(localProvider({ NODE_ENV: "production", ERP_LOCAL_LOGIN: "1" }), { available: false });
  assert.deepEqual(localProvider({ ERP_LOCAL_LOGIN: "1" }), { available: false });
  assert.deepEqual(localProvider({ NODE_ENV: "staging", ERP_LOCAL_LOGIN: "1" }), { available: false });
});

test("sem ERP_LOCAL_LOGIN=1 o provedor local é indisponível mesmo em development e test", () => {
  for (const NODE_ENV of ["development", "test"]) {
    for (const ERP_LOCAL_LOGIN of [undefined, "", "0", "true", " 1"]) {
      assert.deepEqual(localProvider({ NODE_ENV, ERP_LOCAL_LOGIN }), { available: false }, `${NODE_ENV}/${ERP_LOCAL_LOGIN}`);
    }
  }
});

test("em development sem ERP_LOCAL_LOGIN a rota responde 404 e o cookie local é ignorado", async () => {
  await withEnv(
    { NODE_ENV: "development", ERP_LOCAL_LOGIN: undefined, SSO_JWT_SECRET: undefined, APP_URL: undefined, ERP_USERS: undefined },
    async () => {
      setCookies({});
      assert.equal((await enter("DIRETORIA")).status, 404);
      assert.equal(globalThis.__TEST_COOKIES__?.has(LOCAL_COOKIE), false);

      for (const role of ROLES) {
        setCookies({ [LOCAL_COOKIE]: role });
        assert.equal(await getSession(), null, role);
        assert.match(
          (await redirectOf(() => requirePermission("dashboard"))) ?? "",
          /^https:\/\/auth\.avilaops\.com\/login\?/,
        );
      }
    },
  );
});

test("sem sessão, o login local ligado recebe quem chega; desligado ou em produção vale o Auth central", async () => {
  const base = { SSO_JWT_SECRET: undefined, APP_URL: undefined, ERP_USERS: undefined };
  setCookies({});

  await withEnv({ ...base, NODE_ENV: "development", ERP_LOCAL_LOGIN: "1" }, async () => {
    assert.equal(await redirectOf(() => requirePermission("dashboard")), "/dev/login");
    assert.equal(await redirectOf(() => requirePermission("pedidos", "/pedidos/novo")), "/dev/login");
  });
  await withEnv({ ...base, NODE_ENV: "development", ERP_LOCAL_LOGIN: undefined }, async () => {
    assert.match((await redirectOf(() => requirePermission("dashboard"))) ?? "", /^https:\/\/auth\.avilaops\.com\/login\?/);
  });
  // Em produção a variável é ignorada: ninguém é mandado para uma rota que responde 404.
  await withEnv({ ...PRODUCTION, ERP_LOCAL_LOGIN: "1" }, async () => {
    assert.match((await redirectOf(() => requirePermission("dashboard"))) ?? "", /^https:\/\/auth\.avilaops\.com\/login\?/);
  });
});

test("em produção a rota do login local responde 404 e não grava cookie", async () => {
  await withEnv(PRODUCTION, async () => {
    setCookies({});
    const response = await enter("DIRETORIA");
    assert.equal(response.status, 404);
    assert.equal(globalThis.__TEST_COOKIES__?.has(LOCAL_COOKIE), false);
  });
});

test("em produção getSession não aceita o cookie do provedor local", async () => {
  await withEnv(PRODUCTION, async () => {
    for (const role of ROLES) {
      setCookies({ [LOCAL_COOKIE]: role });
      assert.equal(await getSession(), null, role);
      assert.match(
        (await redirectOf(() => requirePermission("dashboard"))) ?? "",
        /^https:\/\/auth\.avilaops\.com\/login\?/,
      );
    }
  });
});

test("em development com ERP_LOCAL_LOGIN=1 a rota grava o cookie e cada perfil entra", async () => {
  await withEnv({ NODE_ENV: "development", ERP_LOCAL_LOGIN: "1", ERP_TENANTS: "ludus:Ludus Equipamentos", SSO_JWT_SECRET: undefined, APP_URL: undefined, ERP_USERS: undefined }, async () => {
    for (const role of ROLES) {
      setCookies({});
      const response = await enter(role);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("Location"), "/");
      // O cookie leva o perfil e a empresa.
      assert.equal(globalThis.__TEST_COOKIES__?.get(LOCAL_COOKIE), `${role}@ludus`);
      assert.equal((await getSession())?.tenant.slug, "ludus");
      assert.equal((await getSession())?.role, role);
    }

    setCookies({});
    assert.equal((await enter("ADMIN")).status, 400);
    assert.equal(globalThis.__TEST_COOKIES__?.has(LOCAL_COOKIE), false);

    setCookies({ [LOCAL_COOKIE]: "ADMIN" });
    assert.equal(await getSession(), null);
  });
});

test("o Auth central é o padrão: o login local só liga por escolha, e o dev só atende em 127.0.0.1", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const root = new URL("../", import.meta.url);
  // Nenhum arquivo versionado liga o login local sozinho.
  assert.equal(existsSync(new URL(".env.development", root)), false);
  const example = readFileSync(new URL(".env.example", root), "utf8");
  assert.doesNotMatch(example, /^ERP_LOCAL_LOGIN=/m);

  const dev = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).scripts.dev;
  // O cookie do login local não é assinado: o que protege é o servidor não escutar para fora.
  assert.match(dev, /-H 127\.0\.0\.1\b/);
});

test("login local com várias empresas: entra na escolhida, e empresa que não existe é recusada", async () => {
  const env = { NODE_ENV: "development", ERP_LOCAL_LOGIN: "1", ERP_TENANTS: "ludus:Ludus Equipamentos;acme:Acme Fitness:erp.acme.example" };
  const provider = localProvider(env);
  assert.ok(provider.available);
  if (!provider.available) return;
  assert.deepEqual(provider.tenants.map((tenant) => tenant.slug), ["ludus", "acme"]);
  assert.equal(provider.userFromCookie("VENDEDOR")?.tenant.slug, "ludus");
  assert.equal(provider.userFromCookie("VENDEDOR@acme")?.tenant.slug, "acme");
  assert.equal(provider.userFromCookie("VENDEDOR@fantasma"), null);
  assert.equal(provider.userFromCookie("VENDEDOR@acme@ludus"), null);
  // No domínio próprio de uma empresa, o cookie de outra não vale.
  const [ludus, acme] = provider.tenants;
  assert.equal(provider.userFromCookie("VENDEDOR@ludus", acme), null);
  assert.equal(provider.userFromCookie("VENDEDOR", acme)?.tenant.slug, "acme");
  assert.equal(provider.userFromCookie("VENDEDOR@ludus", ludus)?.tenant.slug, "ludus");

  await withEnv({ ...env, SSO_JWT_SECRET: undefined, APP_URL: undefined, ERP_USERS: undefined }, async () => {
    setCookies({});
    const response = await POST(
      new Request("http://localhost:3020/dev/login/enter", { method: "POST", body: new URLSearchParams({ role: "DIRETORIA", tenant: "acme" }) }),
    );
    assert.equal(response.status, 303);
    assert.equal(globalThis.__TEST_COOKIES__?.get(LOCAL_COOKIE), "DIRETORIA@acme");
    const session = await getSession();
    assert.deepEqual([session?.tenant.slug, session?.tenant.name, session?.companies], ["acme", "Acme Fitness", 2]);

    // No domínio próprio da Acme, entrar é entrar na Acme, e pedir outra empresa é recusado.
    setCookies({});
    const onHost = (tenant?: string) =>
      POST(
        new Request("http://erp.acme.example/dev/login/enter", {
          method: "POST",
          headers: { host: "erp.acme.example" },
          body: new URLSearchParams(tenant ? { role: "VENDEDOR", tenant } : { role: "VENDEDOR" }),
        }),
      );
    assert.equal((await onHost()).status, 303);
    assert.equal(globalThis.__TEST_COOKIES__?.get(LOCAL_COOKIE), "VENDEDOR@acme");
    setCookies({});
    assert.equal((await onHost("ludus")).status, 400);

    setCookies({});
    const refused = await POST(
      new Request("http://localhost:3020/dev/login/enter", { method: "POST", body: new URLSearchParams({ role: "DIRETORIA", tenant: "fantasma" }) }),
    );
    assert.equal(refused.status, 400);
  });
});

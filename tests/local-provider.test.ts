import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/dev/login/enter/route.ts";
import { getSession, requirePermission } from "@/lib/auth/index";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";
import { ROLES } from "@/lib/auth/roles";
import { APP_URL, redirectOf, SECRET, setCookies, withEnv } from "./helpers.ts";

const PRODUCTION = {
  NODE_ENV: "production",
  SSO_JWT_SECRET: SECRET,
  APP_URL,
  ERP_USERS: "dir@teste.local:DIRETORIA",
};

const enter = (role: string) =>
  POST(
    new Request("http://localhost:3020/dev/login/enter", {
      method: "POST",
      body: new URLSearchParams({ role }),
    }),
  );

test("em development e test o provedor local tem um usuário por perfil", () => {
  for (const NODE_ENV of ["development", "test"]) {
    const provider = localProvider({ NODE_ENV });
    assert.ok(provider.available);
    assert.deepEqual(provider.users.map((user) => user.role), [...ROLES]);
    assert.ok(provider.users.every((user) => user.email.endsWith("@teste.local")));
    assert.equal(provider.userFromCookie("VENDEDOR")?.role, "VENDEDOR");
    assert.equal(provider.userFromCookie("ADMIN"), null);
    assert.equal(provider.userFromCookie(undefined), null);
  }
});

test("em produção, ou com NODE_ENV ausente ou desconhecido, o provedor local é indisponível", () => {
  assert.deepEqual(localProvider({ NODE_ENV: "production" }), { available: false });
  assert.deepEqual(localProvider({}), { available: false });
  assert.deepEqual(localProvider({ NODE_ENV: "staging" }), { available: false });
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

test("em development a rota grava o cookie e cada perfil entra", async () => {
  await withEnv({ NODE_ENV: "development", SSO_JWT_SECRET: undefined, APP_URL: undefined, ERP_USERS: undefined }, async () => {
    for (const role of ROLES) {
      setCookies({});
      const response = await enter(role);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("Location"), "/");
      assert.equal(globalThis.__TEST_COOKIES__?.get(LOCAL_COOKIE), role);
      assert.equal((await getSession())?.role, role);
    }

    setCookies({});
    assert.equal((await enter("ADMIN")).status, 400);
    assert.equal(globalThis.__TEST_COOKIES__?.has(LOCAL_COOKIE), false);

    setCookies({ [LOCAL_COOKIE]: "ADMIN" });
    assert.equal(await getSession(), null);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess } from "@/lib/auth/access";
import { getSession, requirePermission } from "@/lib/auth/index";
import { MENU_ITEMS } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { APP_URL, redirectOf, SECRET, setCookies, ssoToken, withEnv } from "./helpers.ts";

const EMAILS: Record<Role, string> = {
  DIRETORIA: "dir@teste.local",
  GERENTE_COMERCIAL: "ger@teste.local",
  VENDEDOR: "ven@teste.local",
  FINANCEIRO: "fin@teste.local",
};

const PRODUCTION = {
  NODE_ENV: "production",
  SSO_JWT_SECRET: SECRET,
  APP_URL,
  ERP_USERS: ROLES.map((role) => `${EMAILS[role]}:${role}`).join(","),
};

const user = (role: Role) => ({ email: EMAILS[role], name: EMAILS[role], role });

test("decisão: sem sessão do SSO vai para o login, qualquer que seja o item", () => {
  for (const item of MENU_ITEMS) {
    assert.deepEqual(decideAccess({ authenticated: false, user: null }, item.key), { kind: "login" });
  }
});

test("decisão: com sessão do SSO e e-mail fora do diretório fica sem acesso", () => {
  for (const item of MENU_ITEMS) {
    assert.deepEqual(decideAccess({ authenticated: true, user: null }, item.key), { kind: "no-access" });
  }
});

test("decisão: cada um dos quatro perfis em cada um dos 14 itens", () => {
  for (const role of ROLES) {
    for (const item of MENU_ITEMS) {
      const decision = decideAccess({ authenticated: true, user: user(role), displayName: "Nome" }, item.key);
      if (item.roles.includes(role)) {
        assert.deepEqual(decision, {
          kind: "allow",
          session: { email: EMAILS[role], name: "Nome", role },
        });
      } else {
        assert.deepEqual(decision, { kind: "no-access" }, `${role} em ${item.key}`);
      }
    }
  }
});

test("decisão: exemplos da matriz por perfil", () => {
  const kind = (role: Role, item: Parameters<typeof decideAccess>[1]) =>
    decideAccess({ authenticated: true, user: user(role) }, item).kind;

  assert.equal(kind("DIRETORIA", "equipe"), "allow");
  assert.equal(kind("GERENTE_COMERCIAL", "aprovacoes"), "allow");
  assert.equal(kind("GERENTE_COMERCIAL", "comissoes"), "no-access");
  assert.equal(kind("VENDEDOR", "pedidos"), "allow");
  assert.equal(kind("VENDEDOR", "dashboard"), "no-access");
  assert.equal(kind("FINANCEIRO", "recebimentos"), "allow");
  assert.equal(kind("FINANCEIRO", "pedidos"), "no-access");
});

test("getSession: token válido e e-mail no diretório devolve email, nome e perfil do ERP", async () => {
  await withEnv(PRODUCTION, async () => {
    for (const role of ROLES) {
      // papel ADMIN no SSO não muda o perfil do ERP.
      setCookies({ avila_sso: ssoToken({ email: EMAILS[role].toUpperCase(), nome: "Fulano", papel: "ADMIN" }) });
      assert.deepEqual(await getSession(), { email: EMAILS[role], name: "Fulano", role });
    }
  });
});

test("getSession: sem cookie, token inválido ou e-mail fora do diretório devolve null", async () => {
  await withEnv(PRODUCTION, async () => {
    setCookies({});
    assert.equal(await getSession(), null);

    setCookies({ avila_sso: ssoToken({}, { secret: "outro-segredo" }) });
    assert.equal(await getSession(), null);

    setCookies({ avila_sso: ssoToken({ email: "intruso@teste.local" }) });
    assert.equal(await getSession(), null);
  });
});

test("requirePermission: sem sessão redireciona para o Auth central com returnTo", async () => {
  await withEnv(PRODUCTION, async () => {
    setCookies({});
    assert.equal(
      await redirectOf(() => requirePermission("parametros")),
      `https://auth.avilaops.com/login?app=erp&returnTo=${encodeURIComponent(`${APP_URL}/parametros`)}`,
    );
    assert.equal(
      await redirectOf(() => requirePermission("pedidos", "/pedidos/novo")),
      `https://auth.avilaops.com/login?app=erp&returnTo=${encodeURIComponent(`${APP_URL}/pedidos/novo`)}`,
    );
  });
});

test("requirePermission: e-mail fora do diretório vai para /sem-acesso", async () => {
  await withEnv(PRODUCTION, async () => {
    setCookies({ avila_sso: ssoToken({ email: "intruso@teste.local" }) });
    assert.equal(await redirectOf(() => requirePermission("pedidos")), "/sem-acesso");
  });
});

test("requirePermission: os quatro perfis, permitido devolve a sessão e negado vai para /sem-acesso", async () => {
  await withEnv(PRODUCTION, async () => {
    for (const role of ROLES) {
      setCookies({ avila_sso: ssoToken({ email: EMAILS[role], nome: "Fulano" }) });
      for (const item of MENU_ITEMS) {
        const target = await redirectOf(() => requirePermission(item.key));
        assert.equal(target, item.roles.includes(role) ? null : "/sem-acesso", `${role} em ${item.key}`);
      }
    }
    setCookies({ avila_sso: ssoToken({ email: EMAILS.VENDEDOR, nome: "Vera" }) });
    assert.deepEqual(await requirePermission("pedidos"), {
      email: EMAILS.VENDEDOR,
      name: "Vera",
      role: "VENDEDOR",
    });
  });
});

test("produção com configuração inválida não atende requisição (falha fechada)", async () => {
  setCookies({ avila_sso: ssoToken() });
  await withEnv({ ...PRODUCTION, ERP_USERS: undefined }, async () => {
    await assert.rejects(() => getSession(), /ERP_USERS ausente/);
    await assert.rejects(() => requirePermission("dashboard"), /ERP_USERS ausente/);
  });
  await withEnv({ ...PRODUCTION, SSO_JWT_SECRET: undefined }, async () => {
    await assert.rejects(() => getSession(), /SSO_JWT_SECRET ausente/);
  });
  await withEnv({ ...PRODUCTION, SSO_JWT_SECRET: "segredo-curto" }, async () => {
    await assert.rejects(() => getSession(), /SSO_JWT_SECRET curto/);
  });
  await withEnv({ ...PRODUCTION, APP_URL: "http://erp.teste.local" }, async () => {
    await assert.rejects(() => requirePermission("dashboard"), /APP_URL sem https/);
  });
});

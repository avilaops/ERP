import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess } from "@/lib/auth/access";
import { getSession, requirePermission } from "@/lib/auth/index";
import { MENU_ITEMS } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { APP_URL, LUDUS, redirectOf, SECRET, setCookies, setHeaders, ssoToken, TENANTS, withEnv } from "./helpers.ts";

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
  ERP_TENANTS: TENANTS,
  ERP_USERS: ROLES.map((role) => `${EMAILS[role]}:${role}`).join(","),
};

const user = (role: Role) => ({ email: EMAILS[role], name: EMAILS[role], role, tenant: LUDUS });
const COMPANY = { tenant: { slug: "ludus", name: "Ludus Equipamentos" }, companies: 1 };

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
          session: { email: EMAILS[role], name: "Nome", role, ...COMPANY },
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
      assert.deepEqual(await getSession(), { email: EMAILS[role], name: "Fulano", role, ...COMPANY });
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
      ...COMPANY,
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

const TWO_COMPANIES = {
  ...PRODUCTION,
  ERP_TENANTS: "ludus:Ludus Equipamentos:erp.ludus.example;acme:Acme Fitness:erp.acme.example",
  ERP_USERS: "dir@teste.local:DIRETORIA@ludus,dir@teste.local:VENDEDOR@acme,ven@teste.local:VENDEDOR@acme",
};
const company = async () => {
  const session = await getSession();
  return session && [session.tenant.slug, session.role, session.companies];
};

test("empresa da sessão: no endereço compartilhado vale a primeira do e-mail, ou a escolhida entre as dele", async () => {
  await withEnv(TWO_COMPANIES, async () => {
    setHeaders({ host: "erp.avilaops.com" });
    setCookies({ avila_sso: ssoToken({ email: "dir@teste.local" }) });
    assert.deepEqual(await company(), ["ludus", "DIRETORIA", 2]);

    setCookies({ avila_sso: ssoToken({ email: "dir@teste.local" }), erp_tenant: "acme" });
    assert.deepEqual(await company(), ["acme", "VENDEDOR", 2]);

    // O cookie só escolhe entre as empresas da pessoa: uma que não é dela não abre nada.
    setCookies({ avila_sso: ssoToken({ email: "ven@teste.local" }), erp_tenant: "ludus" });
    assert.deepEqual(await company(), ["acme", "VENDEDOR", 1]);
    setCookies({ avila_sso: ssoToken({ email: "dir@teste.local" }), erp_tenant: "nao-existe" });
    assert.deepEqual(await company(), ["ludus", "DIRETORIA", 2]);
  });
  setHeaders({});
});

test("empresa da sessão: no domínio próprio só entra quem é daquela empresa, com o perfil que tem nela", async () => {
  await withEnv(TWO_COMPANIES, async () => {
    setCookies({ avila_sso: ssoToken({ email: "dir@teste.local" }), erp_tenant: "ludus" });
    setHeaders({ host: "erp.acme.example" });
    // O cookie pede a Ludus, mas o domínio é da Acme: vale o domínio.
    assert.deepEqual(await company(), ["acme", "VENDEDOR", 1]);
    setHeaders({ host: "ERP.Ludus.Example:443" });
    assert.deepEqual(await company(), ["ludus", "DIRETORIA", 1]);

    // Vendedor da Acme no domínio da Ludus: autenticado, mas sem acesso.
    setCookies({ avila_sso: ssoToken({ email: "ven@teste.local" }) });
    assert.equal(await getSession(), null);
    assert.equal(await redirectOf(() => requirePermission("pedidos")), "/sem-acesso");
    setHeaders({ host: "erp.acme.example" });
    assert.deepEqual(await company(), ["acme", "VENDEDOR", 1]);
  });
  setHeaders({});
});

test("produção sem ERP_TENANTS, ou com usuário de empresa que não existe, não atende requisição", async () => {
  setCookies({ avila_sso: ssoToken() });
  await withEnv({ ...PRODUCTION, ERP_TENANTS: undefined }, async () => {
    await assert.rejects(() => getSession(), /ERP_TENANTS ausente/);
  });
  await withEnv({ ...PRODUCTION, ERP_USERS: "dir@teste.local:DIRETORIA@fantasma" }, async () => {
    await assert.rejects(() => requirePermission("dashboard"), /empresa desconhecida "fantasma"/);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { loginUrl, verifySsoToken } from "@/lib/auth/sso";
import { SECRET, ssoToken } from "./helpers.ts";

test("token válido devolve email e nome", () => {
  assert.deepEqual(verifySsoToken(ssoToken(), SECRET), {
    email: "dir@teste.local",
    name: "Diana Diretora",
  });
});

test("o papel do SSO não sai da validação", () => {
  const user = verifySsoToken(ssoToken({ papel: "ADMIN" }), SECRET);
  assert.deepEqual(Object.keys(user ?? {}).sort(), ["email", "name"]);
});

test("segredo errado devolve null", () => {
  assert.equal(verifySsoToken(ssoToken({}, { secret: "outro-segredo" }), SECRET), null);
});

test("emissor errado devolve null", () => {
  assert.equal(verifySsoToken(ssoToken({}, { issuer: "evil.example" }), SECRET), null);
});

test("token expirado devolve null", () => {
  assert.equal(verifySsoToken(ssoToken({}, { expiresIn: -10 }), SECRET), null);
});

test("token malformado, vazio ou sem e-mail devolve null", () => {
  assert.equal(verifySsoToken("isto-nao-e-um-jwt", SECRET), null);
  assert.equal(verifySsoToken("a.b.c", SECRET), null);
  assert.equal(verifySsoToken("", SECRET), null);
  assert.equal(verifySsoToken(undefined, SECRET), null);
  assert.equal(verifySsoToken(ssoToken({ email: undefined }), SECRET), null);
  assert.equal(verifySsoToken(ssoToken({ email: 42 }), SECRET), null);
});

test("sem segredo configurado nenhum token é aceito", () => {
  assert.equal(verifySsoToken(ssoToken(), undefined), null);
  assert.equal(verifySsoToken(ssoToken(), ""), null);
});

test("token sem assinatura (alg none) devolve null", () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    email: "dir@teste.local",
    nome: "Diana",
    iss: "auth.avilaops.com",
  })}.`;
  assert.equal(verifySsoToken(unsigned, SECRET), null);
});

test("loginUrl aponta para o Auth central com app e returnTo", () => {
  assert.equal(
    loginUrl("http://localhost:3020", "/parametros"),
    "https://auth.avilaops.com/login?app=erp&returnTo=http%3A%2F%2Flocalhost%3A3020%2Fparametros",
  );
});

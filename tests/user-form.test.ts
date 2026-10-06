import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUserForm } from "@/lib/user-form";
import type { UserField } from "@/lib/user-form";

const form = (values: Partial<Record<UserField, string>>) => (key: UserField) => values[key] ?? null;

test("usuário: nome, e-mail em minúsculas, perfil da lista e a caixa Pode entrar", () => {
  assert.deepEqual(parseUserForm(form({ email: " Ana@Ludus.com.br ", name: " Ana ", role: "VENDEDOR", active: "sim" }), { withEmail: true }), {
    ok: true,
    user: { email: "ana@ludus.com.br", name: "Ana", role: "VENDEDOR", active: true },
  });
  // Caixa desmarcada não vem no formulário; ao alterar, o e-mail não é lido.
  assert.deepEqual(parseUserForm(form({ name: "Ana", role: "FINANCEIRO" }), { withEmail: false }), {
    ok: true,
    user: { email: "", name: "Ana", role: "FINANCEIRO", active: false },
  });
});

test("usuário: cada problema com o rótulo do campo, todos de uma vez", () => {
  assert.deepEqual(parseUserForm(form({ email: "ana", name: " ", role: "DONO" }), { withEmail: true }), {
    ok: false,
    errors: [
      '"E-mail": informe um e-mail válido (ex.: nome@empresa.com.br).',
      '"Nome": informe o nome da pessoa.',
      '"Perfil": escolha um da lista (4 perfis).',
    ],
  });
});

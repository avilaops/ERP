import assert from "node:assert/strict";
import { test } from "node:test";
import { noteRulePatch } from "@/lib/fiscal/rules-form";
import { saleOperationCodes } from "@/lib/fiscal/setup";

test("preparar nota: operação escolhida preenche apenas natureza e CFOPs", () => {
  assert.deepEqual(noteRulePatch(0, (key) => key === "operation" ? "producao" : "não deve entrar"), saleOperationCodes("producao"));
  assert.deepEqual(noteRulePatch(0, (key) => key === "operation" ? "manual" : " Venda especial "), { operationNature: "Venda especial" });
  assert.throws(() => noteRulePatch(0, () => "inventada"), /Escolha a operação/);
});

test("preparar nota: cada etapa aceita só seus campos, com percentual e branco explícito", () => {
  assert.deepEqual(noteRulePatch(5, (key) => ({ pisCst: "01", pisRate: "0,65%" }[key] ?? "ignorado")), { pisCst: "01", pisRate: 0.0065 });
  assert.deepEqual(noteRulePatch(3, () => ""), { icmsCode: null });
  assert.throws(() => noteRulePatch(5, () => "abc"), /percentual válido/);
  assert.throws(() => noteRulePatch(99, () => ""), /Etapa fiscal inválida/);
});

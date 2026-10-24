import assert from "node:assert/strict";
import { test } from "node:test";
import { noteRulePatch, noteRulesPatch } from "@/lib/fiscal/rules-form";
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

test("preparar nota: uma tela salva todas as regras de uma vez", () => {
  const values: Record<string, string> = {
    operation: "manual",
    operationNature: "Venda de equipamento",
    cfopInternal: "5101",
    cfopInterstate: "6101",
    cfopInterstateNonTaxpayer: "6108",
    icmsCode: "00",
    ipiCst: "50",
    ipiFrameCode: "999",
    pisCst: "01",
    pisRate: "0,65%",
    cofinsCst: "01",
    cofinsRate: "3%",
    ibsCbsCst: "000",
    ibsCbsClass: "000001",
    ibsStateRate: "0,1%",
    ibsCityRate: "0,2%",
    cbsRate: "0,9%",
    finalConsumer: "sim",
    ipiInIcmsBase: "",
    icmsOutOfContributions: "sim",
    additionalInfo: "Entregar com agendamento.",
  };
  assert.deepEqual(noteRulesPatch((key) => values[key] ?? ""), {
    operationNature: "Venda de equipamento",
    cfopInternal: "5101",
    cfopInterstate: "6101",
    cfopInterstateNonTaxpayer: "6108",
    icmsCode: "00",
    ipiCst: "50",
    ipiFrameCode: "999",
    pisCst: "01",
    pisRate: 0.0065,
    cofinsCst: "01",
    cofinsRate: 0.03,
    ibsCbsCst: "000",
    ibsCbsClass: "000001",
    ibsStateRate: 0.001,
    ibsCityRate: 0.002,
    cbsRate: 0.009,
    finalConsumer: true,
    ipiInIcmsBase: false,
    icmsOutOfContributions: true,
    additionalInfo: "Entregar com agendamento.",
  });
});

test("preparar nota: operação escolhida preserva os demais campos e substitui CFOPs", () => {
  const patch = noteRulesPatch((key) => ({ operation: "producao", pisCst: "01", pisRate: "0,65%" }[key] ?? ""));
  assert.deepEqual(patch, {
    operationNature: saleOperationCodes("producao").operationNature,
    cfopInternal: saleOperationCodes("producao").cfopInternal,
    cfopInterstate: saleOperationCodes("producao").cfopInterstate,
    cfopInterstateNonTaxpayer: saleOperationCodes("producao").cfopInterstateNonTaxpayer,
    icmsCode: null,
    ipiCst: null,
    ipiFrameCode: "999",
    pisCst: "01",
    pisRate: 0.0065,
    cofinsCst: null,
    cofinsRate: 0,
    ibsCbsCst: null,
    ibsCbsClass: null,
    ibsStateRate: 0,
    ibsCityRate: 0,
    cbsRate: 0,
    finalConsumer: false,
    ipiInIcmsBase: false,
    icmsOutOfContributions: false,
    additionalInfo: null,
  });
});

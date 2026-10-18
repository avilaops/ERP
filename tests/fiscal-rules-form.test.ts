import assert from "node:assert/strict";
import test from "node:test";

import { firstProblemStep } from "@/lib/fiscal/rules-form";

test("a correção abre a primeira etapa fiscal citada pelo impedimento", () => {
  assert.equal(firstProblemStep(["A natureza da operação não foi informada."]), 0);
  assert.equal(firstProblemStep(["O CFOP para esta operação está ausente."]), 1);
  assert.equal(firstProblemStep(["O CST do ICMS não foi informado."]), 3);
  assert.equal(firstProblemStep(["A linha tem IPI na tabela e o CST do IPI é de saída sem imposto."]), 4);
  assert.equal(firstProblemStep(["CST e classificação tributária do IBS/CBS são obrigatórios."]), 7);
});

test("impedimento desconhecido começa pela operação, sem adivinhar regra tributária", () => {
  assert.equal(firstProblemStep(["Revise as regras fiscais desta nota."]), 0);
  assert.equal(firstProblemStep([]), 0);
});

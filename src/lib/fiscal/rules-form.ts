import { FiscalError } from "@/lib/db/fiscal";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import { parsePercent } from "@/lib/format";
import { saleOperationCodes } from "@/lib/fiscal/setup";

type RuleField = { key: keyof FiscalRules; label: string; kind: "text" | "percent" | "boolean" | "code" | "textarea" };
export const NOTE_RULE_STEPS: { title: string; fields: RuleField[] }[] = [
  { title: "Operação", fields: [{ key: "operationNature", label: "Natureza da operação", kind: "text" }] },
  { title: "CFOP dentro do estado", fields: [{ key: "cfopInternal", label: "CFOP dentro do estado", kind: "text" }] },
  { title: "CFOP para outro estado", fields: [{ key: "cfopInterstate", label: "CFOP para contribuinte", kind: "text" }, { key: "cfopInterstateNonTaxpayer", label: "CFOP para não contribuinte", kind: "text" }] },
  { title: "ICMS", fields: [{ key: "icmsCode", label: "CST / CSOSN do ICMS", kind: "code" }] },
  { title: "IPI", fields: [{ key: "ipiCst", label: "CST do IPI", kind: "code" }, { key: "ipiFrameCode", label: "Enquadramento do IPI", kind: "text" }] },
  { title: "PIS", fields: [{ key: "pisCst", label: "CST do PIS", kind: "code" }, { key: "pisRate", label: "Alíquota do PIS (%)", kind: "percent" }] },
  { title: "COFINS", fields: [{ key: "cofinsCst", label: "CST da COFINS", kind: "code" }, { key: "cofinsRate", label: "Alíquota da COFINS (%)", kind: "percent" }] },
  { title: "Classificação IBS/CBS", fields: [{ key: "ibsCbsCst", label: "CST do IBS/CBS", kind: "text" }, { key: "ibsCbsClass", label: "Classificação tributária (cClassTrib)", kind: "text" }] },
  { title: "IBS", fields: [{ key: "ibsStateRate", label: "Alíquota estadual (%)", kind: "percent" }, { key: "ibsCityRate", label: "Alíquota municipal (%)", kind: "percent" }] },
  { title: "CBS", fields: [{ key: "cbsRate", label: "Alíquota da CBS (%)", kind: "percent" }] },
  { title: "Condições", fields: [{ key: "finalConsumer", label: "Venda para consumidor final", kind: "boolean" }, { key: "ipiInIcmsBase", label: "IPI na base do ICMS", kind: "boolean" }, { key: "icmsOutOfContributions", label: "Retirar ICMS da base de PIS/COFINS", kind: "boolean" }] },
  { title: "Informações complementares", fields: [{ key: "additionalInfo", label: "Texto para esta nota", kind: "textarea" }] },
];

/** Opens the wizard at the first rule named by a validation message. */
export function firstProblemStep(problems: readonly string[]): number {
  const problem = problems[0]?.toLocaleLowerCase("pt-BR") ?? "";
  if (problem.includes("ibs/cbs") || problem.includes("cclasstrib")) return 7;
  if (problem.includes("cofins")) return 6;
  if (problem.includes("pis")) return 5;
  if (problem.includes("ipi")) return 4;
  if (problem.includes("icms") || problem.includes("csosn")) return 3;
  if (problem.includes("cfop")) return problem.includes("outro estado") || problem.includes("interestadual") ? 2 : 1;
  return 0;
}

/** Visual groups for the one-screen form; the underlying field list remains shared with validation. */
export const NOTE_RULE_SECTIONS = [
  { title: "CFOP", fields: NOTE_RULE_STEPS.slice(1, 3).flatMap((group) => group.fields) },
  { title: "Impostos atuais", fields: NOTE_RULE_STEPS.slice(3, 7).flatMap((group) => group.fields) },
  { title: "IBS e CBS", fields: NOTE_RULE_STEPS.slice(7, 10).flatMap((group) => group.fields) },
  { title: "Condições da operação", fields: NOTE_RULE_STEPS[10].fields },
  { title: "Informações complementares", fields: NOTE_RULE_STEPS[11].fields },
];

function readFields(fields: RuleField[], read: (key: string) => string): Partial<FiscalRules> {
  return Object.fromEntries(fields.map(({ key, label, kind }) => {
    const text = read(key).trim();
    if (kind === "boolean") return [key, text === "sim"];
    if (kind === "percent") {
      const value = text === "" ? 0 : parsePercent(text.replace(/\s*%$/, ""));
      if (value === null) throw new FiscalError(`${label}: informe um percentual válido.`);
      return [key, value];
    }
    return [key, text || (key === "ipiFrameCode" ? "999" : null)];
  }));
}

/** Reads the whole fiscal form in one atomic save. */
export function noteRulesPatch(read: (key: string) => string): Partial<FiscalRules> {
  const operation = read("operation");
  if (operation !== "manual" && operation !== "revenda" && operation !== "producao") {
    throw new FiscalError("Escolha a operação na lista.");
  }
  const fields = NOTE_RULE_STEPS.flatMap((group) => group.fields);
  const patch = readFields(fields, read);
  return operation === "manual" ? patch : { ...patch, ...saleOperationCodes(operation) };
}

/** Only the displayed step is accepted; missing fields cannot erase another step. */
export function noteRulePatch(step: number, read: (key: string) => string): Partial<FiscalRules> {
  const group = NOTE_RULE_STEPS[step];
  if (!Number.isInteger(step) || !group) throw new FiscalError("Etapa fiscal inválida. Recarregue a página.");
  if (step === 0 && read("operation") !== "manual") {
    const operation = read("operation");
    if (operation !== "revenda" && operation !== "producao") throw new FiscalError("Escolha a operação na lista.");
    return saleOperationCodes(operation);
  }
  return readFields(group.fields, read);
}

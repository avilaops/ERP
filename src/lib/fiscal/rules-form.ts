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

/** Only the displayed step is accepted; missing fields cannot erase another step. */
export function noteRulePatch(step: number, read: (key: string) => string): Partial<FiscalRules> {
  const group = NOTE_RULE_STEPS[step];
  if (!Number.isInteger(step) || !group) throw new FiscalError("Etapa fiscal inválida. Recarregue a página.");
  if (step === 0 && read("operation") !== "manual") {
    const operation = read("operation");
    if (operation !== "revenda" && operation !== "producao") throw new FiscalError("Escolha a operação na lista.");
    return saleOperationCodes(operation);
  }
  return Object.fromEntries(group.fields.map(({ key, label, kind }) => {
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

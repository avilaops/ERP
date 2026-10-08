import { FiscalError } from "@/lib/db/fiscal";
import type { Queryable } from "@/lib/db/pool";

/**
 * The fiscal rules of one product line, as the accountant defines them. Every
 * code may be blank until it is filled in: the invoice is what refuses to be
 * built with a hole (`nfeProblems`), not this register.
 */
export type FiscalRules = {
  operationNature: string | null;
  cfopInternal: string | null;
  cfopInterstate: string | null;
  cfopInterstateNonTaxpayer: string | null;
  /** CST of ICMS (two digits) or CSOSN (three), as the tax regime of the company asks. */
  icmsCode: string | null;
  /** Blank: the invoice has no IPI group. */
  ipiCst: string | null;
  ipiFrameCode: string;
  pisCst: string | null;
  /** As a fraction. */
  pisRate: number;
  cofinsCst: string | null;
  cofinsRate: number;
  finalConsumer: boolean;
  ipiInIcmsBase: boolean;
  additionalInfo: string | null;
  /** CST of IBS/CBS (three digits) and its tax classification (`cClassTrib`, six). Blank: the invoice has no IBSCBS group. */
  ibsCbsCst: string | null;
  ibsCbsClass: string | null;
  /** The rates of the year, as fractions: IBS of the state, IBS of the city and CBS. */
  ibsStateRate: number;
  ibsCityRate: number;
  cbsRate: number;
};

export const EMPTY_FISCAL_RULES: FiscalRules = {
  operationNature: null,
  cfopInternal: null,
  cfopInterstate: null,
  cfopInterstateNonTaxpayer: null,
  icmsCode: null,
  ipiCst: null,
  ipiFrameCode: "999",
  pisCst: null,
  pisRate: 0,
  cofinsCst: null,
  cofinsRate: 0,
  finalConsumer: true,
  ipiInIcmsBase: true,
  additionalInfo: null,
  ibsCbsCst: null,
  ibsCbsClass: null,
  // What the law sets for 2026; the same values the migration seeds.
  ibsStateRate: 0.001,
  ibsCityRate: 0,
  cbsRate: 0.009,
};

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);

/** The rules of a line. A line nobody filled in yet answers with the blanks, not with codes from the program. */
export async function loadFiscalRules(lineId: number, conn: Queryable): Promise<FiscalRules> {
  const { rows } = await conn.query(
    `SELECT operation_nature, cfop_internal, cfop_interstate, cfop_interstate_non_taxpayer, icms_code, ipi_cst, ipi_frame_code,
            pis_cst, pis_rate, cofins_cst, cofins_rate, final_consumer, ipi_in_icms_base, additional_info,
            ibscbs_cst, ibscbs_class, ibs_state_rate, ibs_city_rate, cbs_rate
       FROM fiscal_rules WHERE line_id = $1`,
    [lineId],
  );
  const row = rows[0];
  if (!row) return EMPTY_FISCAL_RULES;
  return {
    operationNature: text(row.operation_nature),
    cfopInternal: text(row.cfop_internal),
    cfopInterstate: text(row.cfop_interstate),
    cfopInterstateNonTaxpayer: text(row.cfop_interstate_non_taxpayer),
    icmsCode: text(row.icms_code),
    ipiCst: text(row.ipi_cst),
    ipiFrameCode: String(row.ipi_frame_code),
    pisCst: text(row.pis_cst),
    pisRate: Number(row.pis_rate),
    cofinsCst: text(row.cofins_cst),
    cofinsRate: Number(row.cofins_rate),
    finalConsumer: row.final_consumer === true,
    ipiInIcmsBase: row.ipi_in_icms_base === true,
    additionalInfo: text(row.additional_info),
    ibsCbsCst: text(row.ibscbs_cst),
    ibsCbsClass: text(row.ibscbs_class),
    ibsStateRate: Number(row.ibs_state_rate),
    ibsCityRate: Number(row.ibs_city_rate),
    cbsRate: Number(row.cbs_rate),
  };
}

/** What is still blank for an invoice of this line, in the words of the screen. */
export function missingFiscalRules(rules: FiscalRules): string[] {
  const fields: [keyof FiscalRules, string][] = [
    ["operationNature", "Natureza da operação"],
    ["cfopInternal", "CFOP dentro do estado"],
    ["cfopInterstate", "CFOP para outro estado"],
    ["cfopInterstateNonTaxpayer", "CFOP para não contribuinte de outro estado"],
    ["icmsCode", "CST ou CSOSN do ICMS"],
    ["pisCst", "CST do PIS"],
    ["cofinsCst", "CST da COFINS"],
  ];
  return fields.filter(([key]) => rules[key] === null).map(([, label]) => label);
}

const code = (value: string | null, pattern: RegExp, message: string): string | null => {
  const clean = blank(value);
  if (clean !== null && !pattern.test(clean)) throw new FiscalError(message);
  return clean;
};
const fraction = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new FiscalError(`${label}: informe um percentual de 0 até menos de 100.`);
  return value;
};

/** Writes the rules of a line. Blank is allowed, a malformed code is not. One statement. */
export async function saveFiscalRules(lineId: number, input: FiscalRules, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando as regras fiscais.");
  const nature = blank(input.operationNature);
  if (nature !== null && nature.length > 60) throw new FiscalError("Natureza da operação: até 60 letras.");
  const info = blank(input.additionalInfo);
  if (info !== null && info.length > 2000) throw new FiscalError("Informações complementares: até 2.000 letras.");
  const values = [
    lineId,
    nature,
    code(input.cfopInternal, /^5\d{3}$/, "CFOP dentro do estado: quatro dígitos, começando por 5."),
    code(input.cfopInterstate, /^6\d{3}$/, "CFOP para outro estado: quatro dígitos, começando por 6."),
    code(input.cfopInterstateNonTaxpayer, /^6\d{3}$/, "CFOP para não contribuinte de outro estado: quatro dígitos, começando por 6."),
    code(input.icmsCode, /^\d{2,3}$/, "ICMS: CST com dois dígitos ou CSOSN com três."),
    code(input.ipiCst, /^\d{2}$/, "CST do IPI: dois dígitos, ou em branco para nota sem IPI."),
    code(input.ipiFrameCode, /^\d{3}$/, "Código de enquadramento do IPI: três dígitos.") ?? "999",
    code(input.pisCst, /^\d{2}$/, "CST do PIS: dois dígitos."),
    fraction(input.pisRate, "Alíquota do PIS"),
    code(input.cofinsCst, /^\d{2}$/, "CST da COFINS: dois dígitos."),
    fraction(input.cofinsRate, "Alíquota da COFINS"),
    input.finalConsumer === true,
    input.ipiInIcmsBase === true,
    info,
    updatedBy,
    code(input.ibsCbsCst, /^\d{3}$/, "CST do IBS/CBS: três dígitos."),
    code(input.ibsCbsClass, /^\d{6}$/, "Classificação tributária do IBS/CBS: seis dígitos."),
    fraction(input.ibsStateRate, "Alíquota do IBS estadual"),
    fraction(input.ibsCityRate, "Alíquota do IBS municipal"),
    fraction(input.cbsRate, "Alíquota da CBS"),
  ];
  const { rows } = await conn.query(
    `INSERT INTO fiscal_rules
       (line_id, operation_nature, cfop_internal, cfop_interstate, cfop_interstate_non_taxpayer, icms_code, ipi_cst, ipi_frame_code,
        pis_cst, pis_rate, cofins_cst, cofins_rate, final_consumer, ipi_in_icms_base, additional_info, updated_by,
        ibscbs_cst, ibscbs_class, ibs_state_rate, ibs_city_rate, cbs_rate)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      WHERE EXISTS (SELECT 1 FROM product_lines WHERE id = $1)
     ON CONFLICT (line_id) DO UPDATE SET
       operation_nature = EXCLUDED.operation_nature, cfop_internal = EXCLUDED.cfop_internal, cfop_interstate = EXCLUDED.cfop_interstate,
       cfop_interstate_non_taxpayer = EXCLUDED.cfop_interstate_non_taxpayer, icms_code = EXCLUDED.icms_code, ipi_cst = EXCLUDED.ipi_cst,
       ipi_frame_code = EXCLUDED.ipi_frame_code, pis_cst = EXCLUDED.pis_cst, pis_rate = EXCLUDED.pis_rate, cofins_cst = EXCLUDED.cofins_cst,
       cofins_rate = EXCLUDED.cofins_rate, final_consumer = EXCLUDED.final_consumer, ipi_in_icms_base = EXCLUDED.ipi_in_icms_base,
       additional_info = EXCLUDED.additional_info, ibscbs_cst = EXCLUDED.ibscbs_cst, ibscbs_class = EXCLUDED.ibscbs_class,
       ibs_state_rate = EXCLUDED.ibs_state_rate, ibs_city_rate = EXCLUDED.ibs_city_rate, cbs_rate = EXCLUDED.cbs_rate,
       updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING line_id`,
    values,
  );
  if (rows.length === 0) throw new FiscalError("Linha de produto não encontrada. Recarregue a página.");
}

/** The forms of payment as the invoice names them (`tPag`). "Outros" (99) goes with the name of the form. */
export const PAYMENT_CODES = [
  ["01", "Dinheiro"],
  ["02", "Cheque"],
  ["03", "Cartão de crédito"],
  ["04", "Cartão de débito"],
  ["15", "Boleto bancário"],
  ["16", "Depósito bancário"],
  ["17", "PIX"],
  ["18", "Transferência bancária"],
  ["99", "Outros (vai com o nome da forma)"],
] as const;

export type PaymentCode = { id: number; label: string; active: boolean; code: string | null };

/** Every form of payment of the company with the code it takes in the invoice, or `null` while nobody chose. */
export async function listPaymentCodes(conn: Queryable): Promise<PaymentCode[]> {
  const { rows } = await conn.query("SELECT id, label, active, nfe_code FROM payment_methods ORDER BY position, label");
  return rows.map((row) => ({ id: Number(row.id), label: String(row.label), active: row.active === true, code: text(row.nfe_code) }));
}

export async function savePaymentCode(id: number, value: string | null, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando a forma de pagamento.");
  const chosen = blank(value);
  if (chosen !== null && !PAYMENT_CODES.some(([known]) => known === chosen)) throw new FiscalError("Escolha a forma da nota na lista.");
  const { rows } = await conn.query(
    "UPDATE payment_methods SET nfe_code = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING id",
    [id, chosen, updatedBy],
  );
  if (rows.length === 0) throw new FiscalError("Forma de pagamento não encontrada. Recarregue a página.");
}

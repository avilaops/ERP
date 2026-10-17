import type { Session } from "@/lib/auth/access";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { ToolError } from "@/lib/mcp/definition";
import type { Schema } from "@/lib/mcp/definition";
import { ORDER_NUMBER } from "@/lib/order-number";
import { roundCents } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

export type Args = Record<string, unknown>;
export const object = (properties: Schema["properties"], required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
export const field = (description: string) => ({ type: "string", description });
export const numeric = (description: string) => ({ type: "number", description });
export const confirmField = { confirmar: field("Código da prévia; use sozinho, somente após a pessoa confirmar.") };
export function text(args: Args, key: string, max = 300): string {
  if (args[key] === undefined) return "";
  if (typeof args[key] !== "string" || args[key].trim().length > max) throw new ToolError(`Informe "${key}" como texto de até ${max} caracteres.`);
  return args[key].trim();
}
export function integer(args: Args, key = "id", fallback?: number): number {
  const value = args[key] === undefined ? fallback : args[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new ToolError(`Informe "${key}" como inteiro maior que zero.`);
  return value;
}
export function money(args: Args, key = "valor"): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1e12 || Math.abs(value - roundCents(value)) > 1e-8) throw new ToolError(`Informe "${key}" maior que zero e com até dois decimais.`);
  return value;
}
export function date(value: string): string {
  try { parseDate(value); } catch { throw new ToolError("Informe uma data válida no formato AAAA-MM-DD."); }
  return value;
}
export function period(args: Args) {
  const from = date(text(args, "de", 10)), to = date(text(args, "ate", 10));
  if (to < from || parseDate(to) - parseDate(from) > 365 * 86400000) throw new ToolError("Escolha um período de até 366 dias, com início antes do fim.");
  return { from, to };
}
export const periodFields = { de: field("Primeiro dia: AAAA-MM-DD"), ate: field("Último dia: AAAA-MM-DD") };
export function confirmation(args: Args): string {
  const token = text(args, "confirmar", 32);
  if (token && Object.keys(args).some((key) => key !== "confirmar")) throw new ToolError("Confirme usando apenas o código da prévia. Para mudar algo, peça nova prévia.");
  return token;
}
export const scopeOf = (session: Session) => ({ sellerEmail: seesAllOrders(session) ? null : session.email });
export function numberOf(args: Args): string {
  const number = text(args, "pedido", 11).toUpperCase();
  if (!ORDER_NUMBER.test(number)) throw new ToolError("Informe o número do pedido, como 261016-HXKP.");
  return number;
}
export async function orderOf(session: Session, conn: Queryable, args: Args) {
  const order = await getOrder(numberOf(args), scopeOf(session), conn);
  if (!order) throw new ToolError("Pedido não encontrado.");
  return order;
}

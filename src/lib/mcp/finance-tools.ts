import { payableChoicesForMcp, payableStateForMcp, receivableForMcp } from "@/lib/db/mcp-operations";
import { createPayable, payPayable } from "@/lib/db/payables";
import type { PayableInput } from "@/lib/db/payables";
import type { Queryable } from "@/lib/db/pool";
import { formatMoney, isoDate, showIsoDate } from "@/lib/format";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { confirmField, confirmation, date, field, integer, money, numeric, object, text } from "@/lib/mcp/input";
import { parsePayableForm, parsePaymentForm } from "@/lib/payable-form";

async function validateBill(input: PayableInput, conn: Queryable, lock = false) {
  const choices = await payableChoicesForMcp(conn, lock);
  const values = { ...input, amount: formatMoney(input.amount), supplierId: input.supplierId === null ? "" : String(input.supplierId) };
  const parsed = parsePayableForm((key) => String(values[key as keyof typeof values] ?? ""), { ...choices, supplierIds: choices.suppliers.map((s) => s.id) });
  if (!parsed.ok) throw new ToolError(parsed.errors.join(" "));
  date(input.dueDate);
  return parsed.value;
}

export const FINANCE_TOOLS: Tool[] = [
  {
    name: "contas_a_pagar_lancar", title: "Lançar conta a pagar", item: "contas-pagar", writes: true,
    description: "Sem dados lista categorias, meios e fornecedores ativos. Com dados prepara uma conta, exige confirmação explícita e não duplica ao repetir o código. Registra obrigação; não envia dinheiro ao banco.",
    inputSchema: object({ descricao: field("Descrição da conta, até 300 caracteres"), categoria: field("Nome exato da categoria ativa"), valor: numeric("Valor em reais, até dois decimais"), vencimento: field("AAAA-MM-DD"), forma: field("Meio ativo, opcional"), fornecedor_id: numeric("Id do fornecedor ativo, opcional"), ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const bill = await createPayable(await validateBill(payload.bill as PayableInput, conn, true), session.email, conn);
        return { lancada: true, conta_id: bill.id, descricao: bill.description, valor: bill.amount, vencimento: bill.dueDate, registrada_por: session.email };
      });
      if (Object.keys(args).length === 0) {
        const choices = await payableChoicesForMcp(conn);
        return { categorias: choices.categories, meios: choices.methods, fornecedores: choices.suppliers, instrucao: "Informe descrição, categoria, valor e vencimento para obter uma prévia." };
      }
      const input: PayableInput = { description: text(args, "descricao"), category: text(args, "categoria", 60), amount: money(args), dueDate: date(text(args, "vencimento", 10)), method: text(args, "forma", 60) || null, supplierId: args.fornecedor_id === undefined ? null : integer(args, "fornecedor_id") };
      const bill = await validateBill(input, conn);
      return prepareConfirmation(this.name, session.email, { bill }, { descricao: bill.description, categoria: bill.category, valor: bill.amount, vencimento: bill.dueDate, forma: bill.method, fornecedor_id: bill.supplierId }, conn);
    },
  },
  {
    name: "contas_a_pagar_dar_baixa", title: "Registrar pagamento de conta", item: "contas-pagar", writes: true,
    description: "Registra pagamento já realizado, com valor efetivo, data e meio. Exige prévia e confirmação. Não transfere dinheiro nem executa pagamento bancário. Se a conta mudar ou já estiver paga, peça nova prévia.",
    inputSchema: object({ id: numeric("Id da conta em contas_a_pagar_em_aberto"), valor: numeric("Valor efetivamente pago, com juros/desconto quando houver"), data: field("Dia do pagamento: AAAA-MM-DD"), forma: field("Nome exato do meio ativo"), ...confirmField }),
    async run(session, conn, args) {
      const validate = async (paidOn: string, amount: number, method: string, lock = false) => {
        date(paidOn);
        if (paidOn > isoDate(new Date())) throw new ToolError("A data do pagamento não pode ser no futuro.");
        const choices = await payableChoicesForMcp(conn, lock);
        if (!method) throw new ToolError("Informe o meio efetivo do pagamento.");
        const values = { paidOn, paidAmount: formatMoney(amount), method };
        const parsed = parsePaymentForm((key) => values[key as keyof typeof values] ?? null, choices.methods);
        if (!parsed.ok) throw new ToolError(parsed.errors.join(" "));
        return parsed.value;
      };
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const current = await payableStateForMcp(Number(payload.id), conn, true);
        if (!current || current.status !== "aberta" || current.revision !== payload.revision) throw new ToolError("A conta mudou ou não está em aberto. Peça nova prévia.");
        const input = await validate(String(payload.date), Number(payload.amount), String(payload.method), true);
        await payPayable(Number(payload.id), input, session.email, isoDate(new Date()), conn);
        return { registrada: true, conta_id: payload.id, descricao: current.description, valor_pago: input.paidAmount, data: input.paidOn, forma: input.method, registrado_por: session.email };
      });
      const id = integer(args), amount = money(args), paidOn = date(text(args, "data", 10)), method = text(args, "forma", 60);
      await validate(paidOn, amount, method);
      const current = await payableStateForMcp(id, conn);
      if (!current || current.status !== "aberta") throw new ToolError("Conta não encontrada ou já paga.");
      return prepareConfirmation(this.name, session.email, { id, amount, date: paidOn, method, revision: current.revision }, { conta_id: id, descricao: current.description, valor_da_conta: Number(current.amount), valor_pago: amount, data: paidOn, forma: method }, conn);
    },
  },
  {
    name: "cobranca_gerar_mensagem", title: "Rascunhar cobrança", item: "recebimentos",
    description: "Gera texto de cobrança de parcela vencida usando o saldo líquido atual. Apenas rascunho: não envia WhatsApp/e-mail nem cria tarefa. Não adiciona multa, juros ou dados bancários não confirmados.",
    inputSchema: object({ id: numeric("Id da parcela em recebimentos_em_aberto") }, ["id"]),
    async run(_session, conn, args) {
      const row = await receivableForMcp(integer(args), conn);
      const today = isoDate(new Date());
      if (!row || Number(row.open) <= 0) throw new ToolError("Parcela não encontrada ou sem saldo aberto.");
      if (!row.due || String(row.due) >= today) throw new ToolError("Esta parcela não está vencida. Confira o vencimento antes de cobrar.");
      const label = row.kind === "entrada" ? "entrada" : `parcela ${row.installment}`;
      return { enviado: false, pedido: row.number, saldo: Number(row.open), vencimento: row.due, texto: `Olá${row.customer ? `, ${row.customer}` : ""}. Consta em aberto a ${label} do pedido ${row.number}, com vencimento em ${showIsoDate(String(row.due))}, no valor de R$ ${formatMoney(Number(row.open))}. Você pode confirmar a previsão de pagamento? Se já pagou, por favor nos encaminhe o comprovante para conferirmos. Obrigado.`, criterio: "Saldo atual, sem acréscimos presumidos. Revise o texto antes de enviar pelo canal escolhido." };
    },
  },
];

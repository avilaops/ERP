import { allows, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/access";
import { getOrder } from "@/lib/db/orders";
import { listAllPaymentMethods } from "@/lib/db/payment-methods";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedSnapshot } from "@/lib/db/price-table";
import { recordReceipt } from "@/lib/db/receivables";
import { isoDate } from "@/lib/format";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Schema, Tool } from "@/lib/mcp/definition";
import { directorOf, engineOrder } from "@/lib/order-quote";
import { ORDER_NUMBER } from "@/lib/order-number";
import { roundCents } from "@/lib/pricing/money";
import { quoteOrder } from "@/lib/pricing/order";
import { parseDate } from "@/lib/pricing/payment";

type Args = Record<string, unknown>;
const object = (properties: Schema["properties"], required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const field = (description: string) => ({ type: "string", description });
function text(args: Args, key: string, max = 300): string {
  const value = args[key];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > max) throw new ToolError(`Informe "${key}" como texto de até ${max} caracteres.`);
  return value.trim();
}
function date(value: string): string {
  try { parseDate(value); } catch { throw new ToolError("Informe uma data válida no formato AAAA-MM-DD."); }
  return value;
}
function numberOf(args: Args): string {
  const number = text(args, "pedido", 11).toUpperCase();
  if (!ORDER_NUMBER.test(number)) throw new ToolError("Informe o número do pedido, como 261016-HXKP.");
  return number;
}
const scopeOf = (session: Session) => ({ sellerEmail: seesAllOrders(session) ? null : session.email });
const confirmField = { confirmar: field("Código da prévia. Use sozinho, somente após confirmação explícita da pessoa.") };
function confirmation(args: Args): string {
  const token = text(args, "confirmar", 32);
  if (token && Object.keys(args).some((key) => key !== "confirmar")) throw new ToolError("Confirme usando apenas o código da prévia. Para mudar algo, peça uma nova prévia.");
  return token;
}

async function receiptState(id: number, conn: Queryable, lock = false) {
  // Lock the order before its receivable, the same order used by other order writes.
  if (lock) {
    await conn.query("SELECT id FROM orders WHERE id = (SELECT order_id FROM receivables WHERE id = $1) FOR UPDATE", [id]);
    await conn.query("SELECT id FROM receivables WHERE id = $1 FOR UPDATE", [id]);
  }
  const { rows } = await conn.query(
    `SELECT r.id, r.updated_at::text AS revision, o.updated_at::text AS order_revision, o.number,
            COALESCE(c.trade_name, c.name) AS customer, r.status, o.status AS order_status,
            r.amount - COALESCE((SELECT sum(p.amount) FROM receipts p WHERE p.receivable_id = r.id
              AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')), 0) AS open
       FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = o.customer_id WHERE r.id = $1`, [id],
  );
  const row = rows[0];
  if (!row || row.status !== "aberta" || row.order_status !== "fechado" || Number(row.open) <= 0) throw new ToolError("Recebimento não encontrado ou sem saldo em aberto.");
  return row;
}
async function checkMethod(method: string, conn: Queryable) {
  if (!(await listAllPaymentMethods(conn)).some((item) => item.active && !item.onDelivery && item.label === method)) throw new ToolError("Escolha um meio de pagamento ativo, como PIX. Prazo de entrega não é meio de pagamento.");
}

const receiptTool: Tool = {
  name: "recebimento_dar_baixa", title: "Registrar recebimento", item: "recebimentos", writes: true, destructive: true,
  description: "Prepara uma baixa parcial ou total de uma parcela. Primeiro informe id, valor, data e forma; mostre o resumo e peça confirmação. Depois use somente confirmar. Repetir o mesmo código devolve o resultado sem nova baixa.",
  inputSchema: object({ id: { type: "number", description: "Id da parcela em recebimentos_em_aberto" }, valor: { type: "number", description: "Valor recebido em reais, maior que zero e com até dois decimais" }, data: field("Dia do recebimento: AAAA-MM-DD"), forma: field("Nome exato do meio ativo na empresa"), observacao: field("Observação opcional, até 300 caracteres"), ...confirmField }),
  async run(session, conn, args) {
    const token = confirmation(args);
    if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
      const state = await receiptState(Number(payload.id), conn, true);
      if (state.revision !== payload.revision || state.order_revision !== payload.orderRevision || Number(state.open) !== payload.open) throw new ToolError("O pedido ou o saldo mudou desde a prévia. Peça uma nova prévia.");
      await checkMethod(String(payload.method), conn);
      await recordReceipt(Number(payload.id), { amount: Number(payload.amount), receivedOn: String(payload.date), method: String(payload.method), note: String(payload.note) || null }, session.email, isoDate(new Date()), conn);
      return { registrada: true, pedido: state.number, recebimento_id: payload.id, valor: payload.amount, saldo: roundCents(Number(state.open) - Number(payload.amount)), data: payload.date, forma: payload.method, registrado_por: session.email };
    });
    const id = args.id;
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new ToolError("Informe o id da parcela.");
    const amount = args.valor;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || Math.abs(amount - roundCents(amount)) > 1e-8) throw new ToolError("Informe o valor recebido com até dois decimais.");
    const receivedOn = date(text(args, "data", 10));
    if (receivedOn > isoDate(new Date())) throw new ToolError("A data do recebimento não pode ser no futuro.");
    const method = text(args, "forma", 60);
    await checkMethod(method, conn);
    const state = await receiptState(Number(id), conn);
    if (amount > Number(state.open)) throw new ToolError("O valor recebido não pode ser maior que o saldo em aberto.");
    const note = text(args, "observacao");
    return prepareConfirmation(this.name, session.email, { id, amount, date: receivedOn, method, note, revision: state.revision, orderRevision: state.order_revision, open: Number(state.open) }, { pedido: state.number, cliente: state.customer, recebimento_id: id, valor: amount, saldo_antes: Number(state.open), saldo_depois: roundCents(Number(state.open) - amount), data: receivedOn, forma: method, observacao: note || null }, conn);
  },
};

const taskTool: Tool = {
  name: "tarefa_criar_em_pedido", title: "Criar tarefa no pedido", item: "pedidos", writes: true,
  available: (session) => allows(session, "funil"),
  description: "Prepara tarefa diretamente no pedido, sem oportunidade. O responsável é o vendedor do pedido. Exige confirmação da prévia. Vendedor alcança somente seus pedidos. A mesma confirmação nunca duplica a tarefa.",
  inputSchema: object({ pedido: field("Número do pedido"), texto: field("O que fazer: de 2 a 300 caracteres"), para: field("Data opcional: AAAA-MM-DD"), ...confirmField }),
  async run(session, conn, args) {
    const token = confirmation(args);
    if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
      await conn.query("SELECT id FROM orders WHERE number = $1 FOR UPDATE", [payload.number]);
      const order = await getOrder(String(payload.number), scopeOf(session), conn);
      if (!order) throw new ToolError("Pedido não encontrado.");
      if (order.revision !== payload.revision || ["cancelado", "perdido"].includes(order.status)) throw new ToolError("O pedido mudou desde a prévia. Peça uma nova prévia.");
      // Two separately prepared previews of the same pending task also reuse the task.
      const existing = await conn.query("SELECT id FROM opportunity_activities WHERE order_id = $1 AND opportunity_id IS NULL AND kind = 'tarefa' AND title = $2 AND due_on IS NOT DISTINCT FROM $3::date AND done_at IS NULL AND owner_email = $4", [order.id, payload.title, payload.due, order.sellerEmail]);
      let taskId = existing.rows[0]?.id;
      if (!taskId) {
        const added = await conn.query("INSERT INTO opportunity_activities (order_id, kind, title, due_on, owner_email, created_by) VALUES ($1, 'tarefa', $2, $3::date, $4, $5) RETURNING id", [order.id, payload.title, payload.due, order.sellerEmail, session.email]);
        taskId = added.rows[0].id;
      }
      return { criada: existing.rows.length === 0, tarefa_id: Number(taskId), pedido: order.number, texto: payload.title, para: payload.due, responsavel: order.sellerEmail };
    });
    const order = await getOrder(numberOf(args), scopeOf(session), conn);
    if (!order) throw new ToolError("Pedido não encontrado.");
    if (["cancelado", "perdido"].includes(order.status)) throw new ToolError("Não é possível criar tarefa em pedido cancelado ou perdido.");
    const title = text(args, "texto");
    if (title.length < 2) throw new ToolError("Descreva a tarefa (2 a 300 caracteres).");
    const due = text(args, "para", 10);
    if (due) date(due);
    return prepareConfirmation(this.name, session.email, { number: order.number, revision: order.revision, title, due: due || null }, { pedido: order.number, cliente: order.customer?.name ?? null, texto: title, para: due || null, responsavel: order.sellerEmail }, conn);
  },
};

const costTool: Tool = {
  name: "pedidos_custo_margem", title: "Custo e margem do pedido", item: "pedidos",
  available: seesCosts,
  description: "Diretoria autorizada: custo e margem do pedido e de seus produtos, com a tabela congelada do pedido. Frete e taxa fixa são rateados por receita sem IPI. É margem calculada do pedido, não custo contábil realizado.",
  inputSchema: object({ pedido: field("Número do pedido") }, ["pedido"]),
  async run(session, conn, args) {
    const order = await getOrder(numberOf(args), scopeOf(session), conn);
    if (!order) throw new ToolError("Pedido não encontrado.");
    if (!order.items.length) throw new ToolError("Pedido sem itens para calcular.");
    const snapshot = await loadPublishedSnapshot(order.priceTableVersion, conn);
    if (!snapshot) throw new ToolError("Tabela do pedido não encontrada.");
    const board = directorOf(order, snapshot);
    const input = engineOrder(order, snapshot);
    if (!board || !input) throw new ToolError("Informe o estado de entrega no pedido antes de calcular a margem.");
    const total = board.quote;
    const tableTotal = input.items.reduce((sum, item) => sum + item.quantity * item.tableUnitPrice, 0);
    const allocate = (amount: number) => {
      const cents = Math.round(amount * 100);
      const shares = input.items.map((item, index) => {
        const exact = cents * item.quantity * item.tableUnitPrice / tableTotal;
        return { index, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
      });
      const left = cents - shares.reduce((sum, share) => sum + share.cents, 0);
      const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
      for (let index = 0; index < left; index++) ranked[index].cents += 1;
      return shares.map((share) => share.cents / 100);
    };
    const freight = allocate(total.freight), fee = allocate(total.fixedFee);
    const items = input.items.map((item, index) => {
      const product = snapshot.items.find((candidate) => candidate.productId === order.items[index].productId)!;
      const quote = quoteOrder({ ...input, items: [item], freight: freight[index] }, { ...snapshot.params, fixedFeePerOrder: fee[index] });
      return { produto_id: product.productId, codigo: product.code, nome: product.name, quantidade: item.quantity, venda_sem_ipi: quote.netSale, custo_equipamentos: quote.equipmentCost, frete_rateado: quote.freight, taxa_fixa_rateada: quote.fixedFee, lucro_liquido: quote.netProfit, margem: quote.netProfitRate };
    });
    return { pedido: order.number, situacao: order.status, tabela: snapshot.version, criterio: "Cálculo comercial com custos da tabela do pedido; frete e taxa fixa rateados pela receita sem IPI. Margens são frações. Não representa custos contábeis realizados.", venda_sem_ipi: total.netSale, custo_equipamentos: total.equipmentCost, impostos: total.taxes, difal: total.difal, imposto_sobre_lucro: total.incomeTax, frete: total.freight, taxa_fixa: total.fixedFee, lucro_liquido: total.netProfit, margem: total.netProfitRate, itens: items };
  },
};

const cashTool: Tool = {
  name: "fluxo_de_caixa", title: "Previsão de caixa", item: "relatorios",
  available: (session) => session.role === "DIRETORIA" && allows(session, "recebimentos") && allows(session, "contas-pagar") && allows(session, "comissoes"),
  description: "Diretoria: entradas e saídas previstas por semana ou mês, em até 366 dias. Inclui saldo a receber, contas abertas e comissões já geradas e não pagas. Atrasados anteriores ao início e sem vencimento ficam separados. Não é saldo bancário nem inclui custos ainda não lançados.",
  inputSchema: object({ de: field("Primeiro dia: AAAA-MM-DD"), ate: field("Último dia: AAAA-MM-DD"), agrupar: { type: "string", description: "semana (segunda-feira) ou mes", enum: ["semana", "mes"] } }, ["de", "ate"]),
  async run(_session, conn, args) {
    const from = date(text(args, "de", 10)), to = date(text(args, "ate", 10));
    if (to < from || parseDate(to) - parseDate(from) > 365 * 86400000) throw new ToolError("Escolha um período de até 366 dias, com início antes do fim.");
    const group = text(args, "agrupar", 10) || "mes";
    if (!["semana", "mes"].includes(group)) throw new ToolError("Escolha semana ou mes.");
    const { rows } = await conn.query(
      `WITH flows AS (
         SELECT r.due_date AS due, 'entrada' AS kind, r.amount - COALESCE((SELECT sum(p.amount) FROM receipts p WHERE p.receivable_id = r.id AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')), 0) AS amount
           FROM receivables r JOIN orders o ON o.id = r.order_id WHERE r.status = 'aberta' AND o.status = 'fechado'
         UNION ALL SELECT due_date, 'saida', amount FROM payables WHERE status = 'aberta'
         UNION ALL SELECT max(payment_due), 'comissao', sum(amount) FROM commissions WHERE paid_at IS NULL GROUP BY seller_email, competence HAVING sum(amount) <> 0
       ) SELECT CASE WHEN due IS NULL THEN 'sem_vencimento' WHEN due < $1::date THEN 'anterior_ao_inicio' ELSE to_char(date_trunc($3, due), 'YYYY-MM-DD') END AS period,
           COALESCE(sum(amount) FILTER (WHERE kind = 'entrada'), 0) AS incoming,
           COALESCE(sum(amount) FILTER (WHERE kind = 'saida'), 0) AS outgoing,
           COALESCE(sum(amount) FILTER (WHERE kind = 'comissao'), 0) AS commission,
           COALESCE(sum(amount) FILTER (WHERE due < (now() AT TIME ZONE 'America/Sao_Paulo')::date AND kind = 'entrada'), 0) AS overdue_incoming,
           COALESCE(sum(amount) FILTER (WHERE due < (now() AT TIME ZONE 'America/Sao_Paulo')::date AND kind <> 'entrada'), 0) AS overdue_outgoing
         FROM flows WHERE due <= $2::date OR due IS NULL GROUP BY 1 ORDER BY 1`,
      [from, to, group === "semana" ? "week" : "month"],
    );
    const values = rows.map((row) => ({ periodo: String(row.period), entradas: Number(row.incoming), contas_a_pagar: Number(row.outgoing), comissoes: Number(row.commission), saidas: roundCents(Number(row.outgoing) + Number(row.commission)), saldo_previsto: roundCents(Number(row.incoming) - Number(row.outgoing) - Number(row.commission)), entradas_atrasadas: Number(row.overdue_incoming), saidas_atrasadas: Number(row.overdue_outgoing) }));
    return { de: from, ate: to, agrupamento: group, criterio: "Valores abertos, líquidos de baixas e estornos. Comissões já geradas. Não é saldo bancário; despesas e custos sem lançamento não entram. Períodos são recortados pelas datas solicitadas.", periodos: values.filter((row) => /^\d/.test(row.periodo)), anteriores_ao_inicio: values.find((row) => row.periodo === "anterior_ao_inicio") ?? null, sem_vencimento: values.find((row) => row.periodo === "sem_vencimento") ?? null };
  },
};

export const BUSINESS_TOOLS: Tool[] = [receiptTool, taskTool, costTool, cashTool];

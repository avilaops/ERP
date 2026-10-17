import { randomInt } from "node:crypto";
import { allows } from "@/lib/auth/permissions";
import { getCustomer } from "@/lib/db/customers";
import { listEquipmentColors } from "@/lib/db/equipment-colors";
import { digest } from "@/lib/db/mcp-commercial";
import { addOrderItem, createOrder, getOrder, linkOrderCustomer, saveOrderTerms, savePayment, setOrderItemOptions } from "@/lib/db/orders";
import type { OrderPayment, OrderTerms } from "@/lib/db/orders";
import { listAllPaymentMethods } from "@/lib/db/payment-methods";
import { loadPublishedTable } from "@/lib/db/price-table";
import { loadProposalDetails, saveProposalDetails } from "@/lib/db/proposal-details";
import type { Queryable } from "@/lib/db/pool";
import { isoDate } from "@/lib/format";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { confirmField, confirmation, date, field, integer, money, numeric, object, text } from "@/lib/mcp/input";
import type { Args } from "@/lib/mcp/input";
import { closingProblems, paymentOf, saleOf } from "@/lib/order-quote";
import { orderNumber } from "@/lib/order-number";
import { isPlates } from "@/lib/plates";
import type { Plates } from "@/lib/plates";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";
import { checkedProposalDetails, closingProposalProblems } from "@/lib/quote/settings";
import type { ProposalDetails, ProposalField } from "@/lib/quote/settings";

const amount = (args: Args, key: string) => args[key] === undefined || args[key] === 0 ? 0 : money(args, key);
const days = (args: Args, key: string) => {
  const value = args[key] === undefined ? null : args[key] === 0 ? 0 : integer(args, key);
  if (value !== null && value > 3650) throw new ToolError(`"${key}": até 3650 dias.`);
  return value;
};
const PROPOSAL: Record<string, ProposalField> = { garantia: "warranty", montagem: "installation", modalidade_frete: "freightMode", condicoes_frete: "freightTerms", prazo_transporte: "deliveryEstimate" };
type Line = { productId: number; quantity: number; plates: Plates | null; frameColor: string | null; armColor: string | null };
type Draft = { version: number; customerId: number; lines: Line[]; terms: OrderTerms; payment: OrderPayment; details: ProposalDetails };

function parseDraft(args: Args): Draft {
  if (!Array.isArray(args.itens) || args.itens.length < 1 || args.itens.length > 50) throw new ToolError("Informe de 1 a 50 itens.");
  const lines = args.itens.map((value): Line => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ToolError("Item inválido.");
    const item = value as Args;
    if (Object.keys(item).some((k) => !["produto_id", "quantidade", "anilheiro", "cor_estrutura", "cor_braco"].includes(k))) throw new ToolError("Campo desconhecido em item.");
    const plates = text(item, "anilheiro", 10);
    if (plates && !isPlates(plates)) throw new ToolError("Anilheiro: escolha olimpico ou standard.");
    const quantity = integer(item, "quantidade");
    if (quantity > 1000) throw new ToolError("Até 1000 unidades por item.");
    return { productId: integer(item, "produto_id"), quantity, plates: plates ? plates as Plates : null, frameColor: text(item, "cor_estrutura", 60) || null, armColor: text(item, "cor_braco", 60) || null };
  });
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) throw new ToolError("Agrupe a quantidade de cada produto em uma única linha.");
  const discount = args.desconto_percentual ?? 0;
  if (typeof discount !== "number" || !Number.isFinite(discount) || discount < 0 || discount > 95 || Math.abs(discount * 100 - Math.round(discount * 100)) > 1e-7) throw new ToolError("Desconto percentual: de 0 a 95, com até dois decimais.");
  const uf = text(args, "uf", 2).toUpperCase();
  if (uf && !(UFS as readonly string[]).includes(uf)) throw new ToolError("UF de entrega inválida.");
  const unit = text(args, "unidade_prazo", 8) || "corridos";
  if (unit !== "corridos" && unit !== "uteis") throw new ToolError("Prazo: corridos ou uteis.");
  if (args.saldo_na_entrega !== undefined && typeof args.saldo_na_entrega !== "boolean") throw new ToolError("saldo_na_entrega deve ser verdadeiro ou falso.");
  const details: ProposalDetails = {};
  for (const [arg, key] of Object.entries(PROPOSAL)) if (args[arg] !== undefined) details[key] = text(args, arg, 1000);
  const productionDays = days(args, "prazo_fabricacao");
  if (productionDays === 0) throw new ToolError("Prazo de fabricação deve ser maior que zero.");
  const onDelivery = args.saldo_na_entrega === true;
  return { version: integer(args, "tabela"), customerId: integer(args, "cliente_id"), lines,
    terms: { discount: discount / 100, deliveryUf: uf ? uf as Uf : null, taxpayer: false, productionDays, productionUnit: unit, freight: amount(args, "frete_pago_empresa"), notes: text(args, "observacoes", 2000) || null },
    payment: { downPayment: amount(args, "entrada"), downPaymentMethod: text(args, "meio_entrada", 60) || null, downPaymentDate: args.data_entrada === undefined ? null : date(text(args, "data_entrada", 10)), balanceMethod: text(args, "meio_saldo", 60) || null, balanceOnDelivery: onDelivery, installmentCount: onDelivery ? 1 : args.parcelas === undefined ? null : integer(args, "parcelas"), firstInstallmentDays: onDelivery ? null : days(args, "primeira_parcela_dias"), installmentIntervalDays: onDelivery ? null : days(args, "intervalo_dias"), paymentNotes: text(args, "observacoes_pagamento", 1000) || null },
    details: checkedProposalDetails(details) };
}

async function validate(draft: Draft, conn: Queryable, lock = false) {
  if (lock) {
    await conn.query("SELECT id FROM customers WHERE id=$1 FOR SHARE", [draft.customerId]);
    await conn.query("SELECT id FROM company_settings FOR SHARE");
    await conn.query("SELECT id FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE", [draft.lines.map((l) => l.productId)]);
    await conn.query("SELECT id FROM payment_methods WHERE active FOR SHARE");
    await conn.query("SELECT id FROM equipment_colors FOR SHARE");
  }
  const customer = await getCustomer(draft.customerId, conn);
  const revision = await conn.query("SELECT updated_at::text AS revision FROM customers WHERE id=$1", [draft.customerId]);
  const table = await loadPublishedTable(draft.version, conn);
  if (!customer || !table) throw new ToolError("Cliente ou tabela não encontrado.");
  const products = await conn.query("SELECT id,active,plate_loaded FROM products WHERE id=ANY($1::int[])", [draft.lines.map((l) => l.productId)]);
  const colors = await listEquipmentColors(conn);
  for (const line of draft.lines) {
    const product = products.rows.find((p) => Number(p.id) === line.productId);
    if (!product?.active || !table.items.some((p) => p.productId === line.productId)) throw new ToolError("Um produto não está ativo ou não pertence à tabela escolhida.");
    if (line.plates && !product.plate_loaded) throw new ToolError("O produto não tem anilheiro.");
    if ((line.frameColor && !colors.some((c) => c.part === "estrutura" && c.name === line.frameColor)) || (line.armColor && !colors.some((c) => c.part === "braco" && c.name === line.armColor))) throw new ToolError("Escolha uma cor cadastrada no ERP.");
  }
  const methods = (await listAllPaymentMethods(conn)).filter((m) => m.active && !m.onDelivery).map((m) => m.label);
  for (const method of [draft.payment.downPaymentMethod, draft.payment.balanceMethod]) if (method && !methods.includes(method)) throw new ToolError("Escolha meios de pagamento ativos. Prazo não é meio de pagamento.");
  const sale = saleOf({ items: draft.lines, discount: draft.terms.discount }, table);
  if (draft.payment.downPayment > sale.invoiceTotal) throw new ToolError("Entrada maior que o total do orçamento.");
  if (draft.payment.installmentCount !== null && draft.payment.installmentCount > 120) throw new ToolError("Até 120 parcelas.");
  const details = await loadProposalDetails(conn);
  const terms = { ...draft.terms, deliveryUf: draft.terms.deliveryUf ?? customer.uf };
  const plan = paymentOf({ ...draft.payment, ...terms, closedAt: null }, sale, table, isoDate(new Date()));
  const missing = [...closingProblems({ ...terms, ...draft.payment, customer, items: draft.lines.map((l) => ({ ...l, plateLoaded: products.rows.find((p) => Number(p.id) === l.productId)?.plate_loaded === true })) }, sale), ...closingProposalProblems({ ...details.details, ...draft.details })];
  return { customer, table, sale, plan, terms, missing, fingerprint: digest({ customer, revision: revision.rows[0], details, day: isoDate(new Date()) }) };
}

export const ORDER_CREATE_TOOL: Tool = {
  name: "orcamento_criar", title: "Montar orçamento", item: "pedidos", writes: true,
  available: (session) => allows(session, "clientes") && allows(session, "tabela-precos"),
  description: "Monta orçamento do próprio usuário com 1–50 produtos ativos da mesma tabela, cliente e condição de pagamento. Mostra preços, totais, parcelas e pendências antes de confirmar. Mantém em negociação; não fecha, aprova ou envia. Não inventa garantia/frete/montagem ausentes.",
  inputSchema: object({ tabela: numeric("Versão publicada em produtos_buscar"), cliente_id: numeric("ID do cliente cadastrado"), itens: { type: "array", description: "Um registro por produto", items: { ...object({ produto_id: numeric("ID do produto"), quantidade: numeric("1–1000"), anilheiro: { ...field("Quando aplicável"), enum: ["olimpico", "standard"] }, cor_estrutura: field("Cor cadastrada da estrutura"), cor_braco: field("Cor cadastrada do braço") }, ["produto_id", "quantidade"]), description: "Item do orçamento" } }, desconto_percentual: numeric("0 a 95%, até dois decimais; padrão zero"), uf: field("UF de entrega; omitida usa a do cliente"), prazo_fabricacao: numeric("Dias de fabricação informados pelo vendedor"), unidade_prazo: { ...field("corridos (padrão) ou uteis"), enum: ["corridos", "uteis"] }, entrada: numeric("Valor em reais; padrão zero"), meio_entrada: field("Meio ativo da entrada"), data_entrada: field("AAAA-MM-DD, opcional"), meio_saldo: field("Meio ativo do saldo"), saldo_na_entrega: { type: "boolean", description: "Vencimento na entrega, separado do meio; padrão falso" }, parcelas: numeric("Quantidade de parcelas, 1–120"), primeira_parcela_dias: numeric("Dias até a primeira parcela"), intervalo_dias: numeric("Dias entre parcelas"), frete_pago_empresa: numeric("Custo de frete da vendedora, em reais; padrão zero"), observacoes: field("Observações do orçamento, até 2000 caracteres"), observacoes_pagamento: field("Condições adicionais de pagamento"), ...Object.fromEntries(Object.entries(PROPOSAL).map(([arg, key]) => [arg, field(`Condição expressamente informada: ${key}. Omitida herda padrão cadastrado da empresa.`)])), ...confirmField }),
  async run(session, conn, args) {
    const token = confirmation(args);
    if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
      const draft = payload.draft as Draft;
      const current = await validate(draft, conn, true);
      if (current.fingerprint !== payload.fingerprint) throw new ToolError("O cliente, as condições ou a data mudaram. Peça nova prévia.");
      const first = draft.lines[0];
      const number = await createOrder({ seller: session, version: draft.version, productId: first.productId, quantity: first.quantity }, () => orderNumber(isoDate(new Date()), randomInt), conn);
      const scope = { sellerEmail: session.email };
      for (const line of draft.lines.slice(1)) await addOrderItem(number, line.productId, line.quantity, session.email, scope, conn);
      await linkOrderCustomer(number, draft.customerId, session.email, scope, conn);
      const linked = (await getOrder(number, scope, conn))!;
      await saveOrderTerms(number, { ...current.terms, taxpayer: linked.taxpayer }, session.email, scope, conn);
      for (const line of draft.lines) await setOrderItemOptions(number, line.productId, { plates: line.plates, frameColor: line.frameColor, armColor: line.armColor }, session.email, scope, conn);
      await savePayment(number, draft.payment, session.email, scope, conn);
      if (Object.keys(draft.details).length) {
        const order = (await getOrder(number, scope, conn))!;
        const stored = await loadProposalDetails(conn, order.id);
        await saveProposalDetails({ values: draft.details, fields: Object.keys(draft.details) as ProposalField[], revision: stored.revision, actor: session.email, orderId: order.id }, conn);
      }
      return { criado: true, pedido: number, situacao: "em_negociacao", total_com_ipi: current.sale.invoiceTotal, pendencias_para_aprovar: current.missing };
    });
    if (!Object.keys(args).length) return { meios: (await listAllPaymentMethods(conn)).filter((m) => m.active && !m.onDelivery).map((m) => m.label), cores: await listEquipmentColors(conn), instrucao: "Use produtos_buscar para escolher tabela e produtos; informe cliente_id, itens e condições para obter a prévia." };
    const draft = parseDraft(args), current = await validate(draft, conn);
    return prepareConfirmation(this.name, session.email, { draft, fingerprint: current.fingerprint }, { cliente: current.customer.name, tabela: draft.version, itens: draft.lines.map((line) => ({ ...line, nome: current.table.items.find((p) => p.productId === line.productId)!.name })), prazo: { dias: draft.terms.productionDays, unidade: draft.terms.productionUnit }, total_sem_ipi: current.sale.netSale, ipi: current.sale.ipi, total_com_ipi: current.sale.invoiceTotal, pagamento: current.plan.receipts.map((p) => ({ parcela: p.label, valor: p.amount, vencimento: p.dueDate, forma: p.method })), condicoes_informadas: draft.details, pendencias_para_aprovar: current.missing, situacao: "em_negociacao" }, conn);
  },
};

import { allows, seesAllOrders } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/access";
import { listCommissions, listCarriedBalances } from "@/lib/db/commissions";
import { listOrderInvoices } from "@/lib/db/invoices";
import { listMaterials, MATERIAL_UNITS } from "@/lib/db/materials";
import { arrearsForMcp, catalogueForMcp, conversionForMcp, deliveriesForMcp, productionForMcp, salesForMcp, shipmentForMcp, suspiciousForMcp } from "@/lib/db/mcp-operations";
import { getOrder, listOrders, loadOrderStanding } from "@/lib/db/orders";
import { loadOrderDelivery } from "@/lib/db/order-delivery";
import { loadPublishedTable } from "@/lib/db/price-table";
import { futureCommission } from "@/lib/db/receivables";
import { isoDate } from "@/lib/format";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { date, field, integer, numberOf, numeric, object, orderOf, period, periodFields, text } from "@/lib/mcp/input";
import { paymentOf, saleOf } from "@/lib/order-quote";
import { roundCents } from "@/lib/pricing/money";
import type { Queryable } from "@/lib/db/pool";

const director = (session: Session) => session.role === "DIRETORIA";
const directorOrders = (session: Session) => director(session) && seesAllOrders(session) && allows(session, "pedidos");
const statusReader = (session: Session) => allows(session, "pedidos") || allows(session, "recebimentos");
async function statusOrder(session: Session, conn: Queryable, args: Record<string, unknown>) {
  const order = await getOrder(numberOf(args), { sellerEmail: allows(session, "recebimentos") || seesAllOrders(session) ? null : session.email }, conn);
  if (!order) throw new ToolError("Pedido não encontrado.");
  return order;
}
const pageOf = (args: Record<string, unknown>) => {
  const page = integer(args, "pagina", 1);
  if (page > 10000) throw new ToolError("Escolha uma página de 1 a 10000.");
  return page;
};

export const QUERY_TOOLS: Tool[] = [
  {
    name: "produtos_buscar", title: "Catálogo comercial", item: "tabela-precos",
    description: "Produtos ativos na última tabela publicada de cada linha: preço sem/com IPI, estoque e disponibilidade. Até 50 por página. Prazo de fabricação é definido pelo vendedor no pedido. Sem custos ou preços de fornecedores.",
    inputSchema: object({ busca: field("Trecho do nome ou código, até 80 caracteres"), pagina: numeric("Página, começando em 1") }),
    run: async (_session, conn, args) => catalogueForMcp(text(args, "busca", 80), pageOf(args), conn),
  },
  {
    name: "pedido_detalhe", title: "Detalhe do pedido", item: "pedidos",
    description: "Itens, preços de venda, condição de pagamento, status de produção e expedição de um pedido. Vendedor só recebe seus pedidos. Não traz custo, margem ou dados bancários.",
    inputSchema: object({ pedido: field("Número do pedido") }, ["pedido"]),
    async run(session, conn, args) {
      const order = await orderOf(session, conn, args);
      const table = await loadPublishedTable(order.priceTableVersion, conn);
      if (!table) throw new ToolError("Tabela do pedido não encontrada.");
      const sale = order.items.length ? saleOf(order, table) : null;
      const plan = sale ? paymentOf(order, sale, table, isoDate(new Date())) : null;
      // The HTTP route supplies one reserved pg client; do not overlap its queries.
      const production = await productionForMcp(order.id, conn);
      const shipment = await shipmentForMcp(order.id, conn);
      const delivery = await loadOrderDelivery(order.id, conn);
      return { pedido: order.number, situacao: order.status, cliente: order.customer ? { id: order.customer.id, nome: order.customer.name } : null, vendedor: order.sellerName, tabela: table.version, desconto: order.discount, total_sem_ipi: sale?.netSale ?? null, ipi: sale?.ipi ?? null, total_com_ipi: sale?.invoiceTotal ?? null,
        itens: order.items.map((item, index) => { const p = table.items.find((p) => p.productId === item.productId); return { id: item.productId, codigo: p?.code, produto: p?.name, quantidade: item.quantity, anilheiro: item.plates, cor_estrutura: item.frameColor, cor_braco: item.armColor, total_com_ipi: sale?.lines[index].totalWithIpi ?? null }; }),
        prazo_fabricacao: { dias: order.productionDays, unidade: order.productionUnit }, pagamento: plan?.receipts.map((part) => ({ parcela: part.label, vencimento: part.dueDate, valor: part.amount, forma: part.method })) ?? [], saldo_na_entrega: order.balanceOnDelivery,
        destino: delivery ? { cidade: delivery.city, uf: delivery.uf } : { cidade: order.customer?.city ?? null, uf: order.deliveryUf }, producao: production, expedicao: shipment, observacoes: order.notes };
    },
  },
  {
    name: "minhas_comissoes", title: "Minhas comissões", item: "comissoes",
    description: "Comissões da própria pessoa: previstas nos pedidos fechados ainda a receber, geradas, pagas e saldo anterior. Nunca consulta comissões de outro vendedor. Mês padrão: atual em São Paulo.",
    inputSchema: object({ mes: field("Competência AAAA-MM, opcional") }),
    async run(session, conn, args) {
      const month = text(args, "mes", 7) || isoDate(new Date()).slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ToolError("Informe o mês como AAAA-MM.");
      date(`${month}-01`);
      const entries = await listCommissions(month, session.email, conn);
      const balances = await listCarriedBalances(month, session.email, conn);
      const forecast = await futureCommission(session.email, conn);
      const sum = (paid: boolean) => roundCents(entries.filter((e) => (e.paidAt !== null) === paid).reduce((n, e) => n + e.amount, 0));
      const pending = sum(false), carried = balances.get(session.email) ?? 0;
      return { mes: month, vendedor: session.email, previstas_ainda_nao_geradas: forecast, geradas_no_mes: roundCents(sum(true) + pending), pagas_no_mes_de_competencia: sum(true), abertas_no_mes: pending, saldo_anterior: carried, saldo_a_pagar: Math.max(0, roundCents(pending + carried)), saldo_liquido: roundCents(pending + carried), registros: entries.map((e) => ({ pedido: e.orderNumber, cliente: e.customerName, valor: e.amount, estorno: e.refund, vence_em: e.paymentDue, paga_em: e.paidAt })) };
    },
  },
  {
    name: "nota_fiscal_status", title: "Situação da nota fiscal", item: "relatorios", available: statusReader,
    description: "Consulta tentativas, autorização ou rejeição de nota de um pedido. Sem XML, certificado ou emissão. Vendedor alcança seus pedidos; financeiro com Recebimentos consulta os pedidos da empresa.",
    inputSchema: object({ pedido: field("Número do pedido") }, ["pedido"]),
    async run(session, conn, args) {
      const order = await statusOrder(session, conn, args);
      return { pedido: order.number, notas: (await listOrderInvoices(order.id, conn)).map((i) => ({ numero: i.number, serie: i.series, ambiente: i.environment, situacao: i.status, protocolo: i.protocol, codigo: i.statusCode, motivo: i.statusReason, emitida_em: i.issuedAt })) };
    },
  },
  {
    name: "producao_status", title: "Produção do pedido", item: "relatorios", available: statusReader,
    description: "Etapas e prazos de fabricação de um pedido ao alcance da pessoa. Só consulta; não movimenta a fábrica. Sem ordens cadastradas, devolve lista vazia, sem presumir produção iniciada.",
    inputSchema: object({ pedido: field("Número do pedido") }, ["pedido"]),
    async run(session, conn, args) { const order = await statusOrder(session, conn, args); return { pedido: order.number, ordens: await productionForMcp(order.id, conn) }; },
  },
  {
    name: "entregas_agenda", title: "Expedições e pendências de entrega", item: "estoque",
    description: "Expedições registradas no período e pedidos pendentes, com prazo de produção e paginação. O ERP ainda não tem data agendada de transporte: não confunda fabricação com entrega prometida.",
    inputSchema: object({ ...periodFields, pagina: numeric("Página, começando em 1") }, ["de", "ate"]),
    async run(_session, conn, args) { const { from, to } = period(args); return deliveriesForMcp(from, to, pageOf(args), conn); },
  },
  {
    name: "compras_estoque_minimo", title: "Materiais abaixo do mínimo", item: "compras",
    description: "Insumos com estoque abaixo do mínimo cadastrado e quantidade necessária para repor até o mínimo. Apenas quantidades; não cria compras nem presume fornecedor ou preço.",
    inputSchema: object({}),
    async run(_session, conn) { return (await listMaterials(conn)).filter((m) => m.stock < m.minimum).map((m) => ({ id: m.id, material: m.name, unidade: MATERIAL_UNITS[m.unit], estoque: m.stock, minimo: m.minimum, repor_ate_minimo: m.minimum - m.stock })); },
  },
  {
    name: "inadimplencia_resumo", title: "Inadimplência por cliente e vendedor", item: "recebimentos", available: director,
    description: "Diretoria: saldo vencido atual, líquido de recebimentos e estornos, por cliente e vendedor. Não usa valor original de parcela já parcialmente recebida. Não altera registros.",
    inputSchema: object({}),
    async run(_session, conn) { const rows = await arrearsForMcp(isoDate(new Date()), conn); return { total_atrasado: roundCents(rows.reduce((sum, row) => sum + row.saldo_atrasado, 0)), grupos: rows }; },
  },
  {
    name: "vendas_resumo", title: "Resumo comercial das vendas", item: "relatorios", available: directorOrders,
    description: "Diretoria: pedidos fechados por mês, vendedor, produto ou UF de entrega. Valor comercial vendido, não receita recebida ou faturamento fiscal. Período de até 366 dias.",
    inputSchema: object({ ...periodFields, agrupar: { type: "string", description: "mes (padrão), vendedor, produto ou regiao (UF)", enum: ["mes", "vendedor", "produto", "regiao"] } }, ["de", "ate"]),
    async run(_session, conn, args) { const { from, to } = period(args); const group = text(args, "agrupar", 10) || "mes"; if (!["mes", "vendedor", "produto", "regiao"].includes(group)) throw new ToolError("Escolha mes, vendedor, produto ou regiao."); return { de: from, ate: to, agrupamento: group, criterio: "Pedidos fechados pela data de fechamento, com IPI. Produto usa as linhas da tabela congelada; arredondamentos por linha podem diferir em centavos do total de fechamento. Não é faturamento fiscal ou caixa recebido.", grupos: await salesForMcp(from, to, group, conn) }; },
  },
  {
    name: "funil_conversao", title: "Conversão do funil", item: "funil", available: (s) => director(s) && seesAllOrders(s),
    description: "Diretoria: situação atual das oportunidades criadas no período, taxa ganhas/(ganhas+perdidas) e motivos de perda. Sem decisões a taxa é nula. Não confunde oportunidade ganha com dinheiro recebido.",
    inputSchema: object(periodFields, ["de", "ate"]),
    async run(_session, conn, args) { const { from, to } = period(args); return { de: from, ate: to, ...(await conversionForMcp(from, to, conn)) }; },
  },
  {
    name: "descontos_fora_da_regra", title: "Pedidos fora da política comercial", item: "pedidos", available: directorOrders,
    description: "Diretoria: pagina pedidos e confere política atual (desconto, entrada, frete e faixa), sem divulgar custos. Prazo acima do limite não é inferido: o ERP não possui limite global de prazo de fabricação.",
    inputSchema: object({ pagina: numeric("Página de pedidos analisados, até 25 por página") }),
    async run(_session, conn, args) {
      const page = pageOf(args), orders = await listOrders({ sellerEmail: null }, conn);
      const selected = orders.slice((page - 1) * 25, page * 25);
      const result = [];
      for (const summary of selected) {
        const order = await getOrder(summary.number, { sellerEmail: null }, conn);
        if (!order || !order.items.length) continue;
        const standing = await loadOrderStanding(order, conn);
        if (standing.policy?.needsApproval) result.push({ pedido: order.number, situacao: order.status, vendedor: order.sellerName, desconto: order.discount, motivos: standing.policy.reasons });
      }
      return { pagina: page, pedidos_analisados: selected.length, tem_mais: orders.length > page * 25, criterio: "Política atual aplicada aos dados e à tabela do pedido; não desfaz aprovação já registrada. Sem limite global de prazo para avaliar atraso comercial.", pedidos: result };
    },
  },
  {
    name: "pedidos_suspeitos", title: "Pedidos para conferência", item: "pedidos", available: directorOrders,
    description: "Diretoria: sinaliza negociação/rascunho, pedido sem cliente ou sem itens e menção a teste/demo/exemplo. São indícios para conferir, não prova de fraude. Não cancela nem exclui.",
    inputSchema: object({ pagina: numeric("Página, até 50 registros") }),
    run: async (_session, conn, args) => suspiciousForMcp(pageOf(args), conn),
  },
];

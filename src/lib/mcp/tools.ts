import type { Session } from "@/lib/auth/access";
import { allows, seesAllOrders } from "@/lib/auth/permissions";
import { customerTimeline } from "@/lib/db/customer-timeline";
import { CustomerError, getCustomer } from "@/lib/db/customers";
import { OrderError } from "@/lib/db/orders";
import { ProposalSettingsError } from "@/lib/quote/settings";
import { FunnelError, getOpportunity, listActivities, listOpportunities, listPendingActivities, opportunityParty } from "@/lib/db/funnel";
import { listInbox } from "@/lib/db/inbox";
import { listMaterials, materialNeeds, MATERIAL_UNITS } from "@/lib/db/materials";
import { customersForAssistant, openPayablesForAssistant, openReceivablesForAssistant, ordersForAssistant, pendingApprovalsForAssistant } from "@/lib/db/mcp-read";
import { listOpportunityMessages } from "@/lib/db/messages";
import type { Queryable } from "@/lib/db/pool";
import { listProductionOrders, listProductionStages } from "@/lib/db/production";
import { BUSINESS_TOOLS } from "@/lib/mcp/business-tools";
import { FINANCE_TOOLS } from "@/lib/mcp/finance-tools";
import { QUERY_TOOLS } from "@/lib/mcp/query-tools";
import { CUSTOMER_TOOLS } from "@/lib/mcp/customer-tools";
import { FUNNEL_TOOLS } from "@/lib/mcp/funnel-tools";
import { ORDER_CREATE_TOOL } from "@/lib/mcp/order-create-tool";
import { ORDER_DECISION_TOOLS } from "@/lib/mcp/order-decision-tools";
import { PayableError } from "@/lib/db/payables";
import { ConfirmationError } from "@/lib/mcp/confirmation";
import { ReceivableError } from "@/lib/db/receivables";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool, Schema } from "@/lib/mcp/definition";
export { ToolError } from "@/lib/mcp/definition";
export type { Tool, Schema } from "@/lib/mcp/definition";

type Args = Record<string, unknown>;

const text = (args: Args, key: string, max = 300): string => (typeof args[key] === "string" ? (args[key] as string).trim().slice(0, max) : "");
const id = (args: Args, key = "id"): number => {
  const value = args[key];
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(number) || number < 1) throw new ToolError(`Informe "${key}": o número do registro.`);
  return number;
};
const day = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));
/** A seller reaches their own sales; who sees the team's orders reaches the team's. The same rule as the screens. */
const scopeOf = (session: Session) => ({ ownerEmail: seesAllOrders(session) ? null : session.email });
const object = (properties: Schema["properties"], required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });

export const TOOLS: Tool[] = [
  ...BUSINESS_TOOLS,
  ...FINANCE_TOOLS,
  ...QUERY_TOOLS,
  ...CUSTOMER_TOOLS,
  ...FUNNEL_TOOLS,
  ORDER_CREATE_TOOL,
  ...ORDER_DECISION_TOOLS,
  {
    name: "funil_oportunidades", title: "Oportunidades do funil", item: "funil",
    description: "Lista as oportunidades de venda (vendas possíveis, antes do pedido): as da própria pessoa, ou as da equipe para gerência e diretoria. Até 50.",
    inputSchema: object({ situacao: { type: "string", description: "andamento (padrão), ganhas ou perdidas", enum: ["andamento", "ganhas", "perdidas"] }, busca: { type: "string", description: "Trecho do título, da empresa ou do contato" } }),
    async run(session, conn, args) {
      const kind = { andamento: "aberta", ganhas: "ganha", perdidas: "perdida" }[text(args, "situacao") || "andamento"] ?? "aberta";
      const search = text(args, "busca", 80).toLowerCase();
      return (await listOpportunities(scopeOf(session), conn))
        .filter((item) => item.stageKind === kind && (search === "" || [item.title, opportunityParty(item), item.contactName ?? ""].some((value) => value.toLowerCase().includes(search))))
        .slice(0, 50)
        .map((item) => ({ id: item.id, titulo: item.title, empresa: opportunityParty(item), contato: item.contactName, etapa: item.stageName, valor_estimado: item.estimatedValue, responsavel: item.ownerName, proxima_tarefa: item.nextTitle, proxima_tarefa_para: item.nextDue, atualizada_em: day(item.updatedAt) }));
    },
  },
  {
    name: "funil_oportunidade", title: "Uma oportunidade", item: "funil",
    description: "Mostra uma oportunidade com o que foi feito nela: atividades, e-mails enviados e respostas do cliente.",
    inputSchema: object({ id: { type: "number", description: "O id da oportunidade" } }, ["id"]),
    async run(session, conn, args) {
      const item = await getOpportunity(id(args), scopeOf(session), conn);
      if (!item) throw new ToolError("Oportunidade não encontrada.");
      const [activities, sent, received] = [await listActivities(item.id, conn), await listOpportunityMessages(item.id, conn), await listInbox(item.id, conn)];
      return {
        id: item.id, titulo: item.title, empresa: opportunityParty(item), contato: item.contactName, telefone: item.phone, email: item.email, origem: item.source, etapa: item.stageName, valor_estimado: item.estimatedValue,
        responsavel: item.ownerName, pedido: item.orderNumber, motivo_da_perda: item.lostReason, observacoes: item.notes, criada_em: day(item.createdAt),
        atividades: activities.slice(0, 25).map((activity) => ({ tipo: activity.kind, texto: activity.title, para: activity.dueOn, feita_em: day(activity.doneAt), conclusao: activity.completionNote ?? null })),
        emails_enviados: sent.filter((message) => message.status === "enviado").slice(0, 5).map((message) => ({ em: day(message.sentAt), assunto: message.subject, texto: message.body.slice(0, 1500) })),
        emails_recebidos: received.slice(0, 5).map((message) => ({ em: day(message.receivedAt), de: message.sender, assunto: message.subject, texto: message.body.slice(0, 1500) })),
      };
    },
  },
  {
    name: "funil_tarefas", title: "Tarefas pendentes", item: "funil",
    description: "Lista as tarefas, ligações e reuniões por fazer: as da própria pessoa, ou as da equipe para gerência e diretoria.",
    inputSchema: object({}),
    async run(session, conn) {
      return (await listPendingActivities(scopeOf(session), conn)).slice(0, 80).map((task) => ({ oportunidade_id: task.opportunityId, pedido: task.orderNumber, sobre: task.subject, empresa: task.party, tipo: task.kind, texto: task.title, para: task.dueOn, responsavel: task.ownerName }));
    },
  },
  {
    name: "clientes_buscar", title: "Buscar clientes", item: "clientes",
    description: "Procura clientes do cadastro por nome, nome fantasia, cidade ou começo do CNPJ/CPF. Até 25.",
    inputSchema: object({ busca: { type: "string", description: "O que procurar; vazio lista os primeiros" } }),
    run: async (_session, conn, args) => customersForAssistant(text(args, "busca", 80), conn),
  },
  {
    name: "cliente_historico", title: "Histórico do cliente", item: "clientes",
    description: "O que aconteceu com um cliente, do mais novo ao mais antigo: pedidos, contratos, notas e o que foi feito no funil. O vendedor recebe só as próprias vendas.",
    inputSchema: object({ id: { type: "number", description: "O id do cliente (de clientes_buscar)" } }, ["id"]),
    async run(session, conn, args) {
      const customer = await getCustomer(id(args), conn);
      if (!customer) throw new ToolError("Cliente não encontrado.");
      const entries = await customerTimeline(customer.id, { sellerEmail: seesAllOrders(session) ? null : session.email, receipts: allows(session, "recebimentos") }, conn);
      return { cliente: customer.tradeName ?? customer.name, registros: entries.slice(0, 60).map((entry) => ({ em: day(entry.at), tipo: entry.kind, o_que: entry.title, detalhe: entry.detail, valor: entry.amount, pedido: entry.orderNumber, oportunidade_id: entry.opportunityId })) };
    },
  },
  {
    name: "pedidos_listar", title: "Pedidos", item: "pedidos",
    description: "Lista pedidos e orçamentos, os mais novos primeiro: os da própria pessoa, ou os da equipe para gerência e diretoria. Só valores de venda. Até 50.",
    inputSchema: object({ situacao: { type: "string", description: "Filtra pela situação", enum: ["em_negociacao", "aguardando_aprovacao", "fechado", "perdido", "cancelado"] }, busca: { type: "string", description: "Trecho do número do pedido ou do nome do cliente" } }),
    run: async (session, conn, args) => ordersForAssistant({ sellerEmail: seesAllOrders(session) ? null : session.email, status: ["em_negociacao", "aguardando_aprovacao", "fechado", "perdido", "cancelado"].includes(text(args, "situacao")) ? text(args, "situacao") : null, search: text(args, "busca", 80) }, conn),
  },
  {
    name: "aprovacoes_pendentes", title: "Aprovações pendentes", item: "aprovacoes",
    description: "Lista os pedidos que esperam aprovação. Os perfis autorizados podem decidir com prévia e confirmação usando aprovacao_aprovar/reprovar.",
    inputSchema: object({}),
    run: async (_session, conn) => pendingApprovalsForAssistant(conn),
  },
  {
    name: "recebimentos_em_aberto", title: "A receber", item: "recebimentos",
    description: "Lista as parcelas ainda não recebidas, das que vencem primeiro, dizendo quais estão atrasadas. Até 100.",
    inputSchema: object({}),
    run: async (_session, conn) => openReceivablesForAssistant(conn),
  },
  {
    name: "contas_a_pagar_em_aberto", title: "A pagar", item: "contas-pagar",
    description: "Lista as contas ainda não pagas, das que vencem primeiro, dizendo quais estão atrasadas. Até 100.",
    inputSchema: object({}),
    run: async (_session, conn) => openPayablesForAssistant(conn),
  },
  {
    name: "producao_ordens", title: "Ordens de produção", item: "producao",
    description: "Lista as ordens de produção por etapa, com o equipamento, a quantidade, o cliente e o prazo.",
    inputSchema: object({ etapa: { type: "string", description: "Nome de uma etapa; vazio traz todas as etapas com ordem" } }),
    async run(_session, conn, args) {
      const wanted = text(args, "etapa", 40).toLowerCase();
      const stages = (await listProductionStages(conn)).filter((stage) => (wanted === "" ? stage.orders > 0 : stage.name.toLowerCase() === wanted));
      const result = [];
      for (const stage of stages) {
        const orders = await listProductionOrders(stage.id, conn);
        result.push({ etapa: stage.name, ordens: orders.slice(0, 60).map((order) => ({ ordem: order.number, equipamento: [order.productCode, order.productName].filter(Boolean).join(" · "), quantidade: order.quantity, cliente: order.customer, para: order.dueOn, pronta_em: day(order.finishedAt), observacoes: order.notes })) });
      }
      return result;
    },
  },
  {
    name: "producao_materiais", title: "Materiais da produção", item: "producao",
    description: "Mostra o que as ordens em produção ainda vão usar contra o estoque de hoje (o que vai faltar) e os materiais abaixo do mínimo. Só quantidades.",
    inputSchema: object({}),
    async run(_session, conn) {
      const { needs, withoutList } = await materialNeeds(conn);
      const low = (await listMaterials(conn)).filter((material) => material.stock < material.minimum);
      return {
        vai_faltar: needs.filter((need) => need.missing > 0).map((need) => ({ material: need.name, unidade: MATERIAL_UNITS[need.unit], precisa: need.needed, tem: need.stock, falta: need.missing })),
        abaixo_do_minimo: low.map((material) => ({ material: material.name, unidade: MATERIAL_UNITS[material.unit], tem: material.stock, minimo: material.minimum })),
        ordens_sem_lista_de_materiais: withoutList,
      };
    },
  },
];

/** The tools a person has: the ones of the screens their profile reaches, nothing else. */
export const toolsOf = (session: Session): Tool[] => TOOLS.filter((tool) => allows(session, tool.item) && (tool.available?.(session) ?? true));

/**
 * Runs one tool for a person. A tool of a screen the person does not have is
 * answered as one that does not exist. What the ERP refuses comes back as a
 * `ToolError` with the reason; anything else is a failure of the ERP.
 */
export async function callTool(session: Session, conn: Queryable, name: string, args: unknown): Promise<unknown> {
  const tool = toolsOf(session).find((candidate) => candidate.name === name);
  if (!tool) throw new ToolError(`Ferramenta desconhecida: ${String(name).slice(0, 60)}.`);
  const given = typeof args === "object" && args !== null && !Array.isArray(args) ? (args as Args) : {};
  const unknown = Object.keys(given).filter((key) => !(key in tool.inputSchema.properties));
  if (unknown.length > 0) throw new ToolError(`Campo que a ferramenta não tem: ${unknown.slice(0, 5).join(", ")}.`);
  try {
    return await tool.run(session, conn, given);
  } catch (error) {
    if (error instanceof FunnelError || error instanceof ConfirmationError || error instanceof ReceivableError || error instanceof PayableError || error instanceof CustomerError || error instanceof OrderError || error instanceof ProposalSettingsError) throw new ToolError(error.message);
    throw error;
  }
}

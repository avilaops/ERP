import { approvesAtLoss, seesAllOrders } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/access";
import { assertApprovalAuthority, decideApproval } from "@/lib/db/approvals";
import { cancellationProblems, cancelForMcp, commercialContext, requestApprovalForMcp } from "@/lib/db/mcp-commercial";
import { loadPublishedTable } from "@/lib/db/price-table";
import { closingProblems, saleOf } from "@/lib/order-quote";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { confirmField, confirmation, field, numberOf, object, scopeOf, text } from "@/lib/mcp/input";

const decider = (s: Session) => (s.role === "DIRETORIA" || s.role === "GERENTE_COMERCIAL") && seesAllOrders(s);
const orderFields = { pedido: field("Número do pedido"), ...confirmField };
const CHANGED = "O pedido, cliente ou as regras mudaram. Peça nova prévia.";
function actor(s: Session) {
  if (s.role !== "DIRETORIA" && s.role !== "GERENTE_COMERCIAL") throw new ToolError("Seu perfil não decide aprovações ou cancelamentos.");
  return { email: s.email, role: s.role, approvesAtLoss: approvesAtLoss(s) };
}

const requestTool: Tool = {
  name: "pedido_enviar_aprovacao", title: "Solicitar aprovação do orçamento", item: "pedidos", writes: true,
  description: "Envia orçamento completo em negociação para aprovação. Sempre aguarda decisão, inclusive dentro da política: não fecha a venda nem gera recebíveis. Prévia e confirmação exigidas. Prazo, cliente, pagamento, garantia, frete e montagem devem estar informados.",
  inputSchema: object(orderFields),
  async run(session, conn, args) {
    const token = confirmation(args);
    if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
      const context = await commercialContext(String(payload.number), scopeOf(session), conn, true);
      if (context.fingerprint !== payload.fingerprint) throw new ToolError(CHANGED);
      return requestApprovalForMcp(context.order.number, scopeOf(session), session.email, conn);
    });
    const context = await commercialContext(numberOf(args), scopeOf(session), conn);
    const order = context.order;
    if (order.status !== "em_negociacao" || !order.items.length) throw new ToolError("Só orçamento em negociação e com itens pode ir para aprovação.");
    const table = await loadPublishedTable(order.priceTableVersion, conn);
    if (!table) throw new ToolError("Tabela não encontrada.");
    const sale = saleOf(order, table);
    const missing = [...closingProblems(order, sale), ...context.proposal.missing];
    if (missing.length) throw new ToolError(missing.join(" "));
    return prepareConfirmation(this.name, session.email, { number: order.number, fingerprint: context.fingerprint }, { pedido: order.number, cliente: order.customer?.name, total_com_ipi: sale.invoiceTotal, efeito: "Aguardará aprovação. Nenhum recebível será gerado nesta solicitação." }, conn);
  },
};

function decisionTool(approve: boolean): Tool {
  return {
    name: approve ? "aprovacao_aprovar" : "aprovacao_reprovar", title: approve ? "Aprovar pedido" : "Reprovar pedido", item: "aprovacoes", available: decider, writes: true, destructive: true,
    description: approve ? "Prévia e confirmação para aprovar pedido pendente. A aprovação fecha a venda e gera recebíveis pelas condições do pedido; não registra pagamento ou emite NF. Respeita a alçada do perfil, inclusive o poder de aprovar prejuízo." : "Prévia e confirmação para reprovar pedido pendente, com motivo obrigatório. Retorna à negociação com registro de quem decidiu e quando.",
    inputSchema: object({ ...orderFields, motivo: field(approve ? "Comentário opcional, até 300 caracteres" : "Motivo obrigatório, de 3 a 300 caracteres") }),
    async run(session, conn, args) {
      const who = actor(session), token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const context = await commercialContext(String(payload.number), scopeOf(session), conn, true);
        if (context.fingerprint !== payload.fingerprint) throw new ToolError(CHANGED);
        await decideApproval(context.order.number, { approve, comment: payload.reason as string | null }, who, conn);
        return { pedido: context.order.number, aprovado: approve, situacao: approve ? "fechado" : "em_negociacao", motivo: payload.reason, decidido_por: session.email };
      });
      const context = await commercialContext(numberOf(args), scopeOf(session), conn);
      if (context.order.status !== "aguardando_aprovacao") throw new ToolError("Pedido não está aguardando aprovação.");
      const reason = text(args, "motivo") || null;
      if (!approve && (!reason || reason.length < 3)) throw new ToolError("Informe um motivo de reprovação, de 3 a 300 caracteres.");
      const table = await loadPublishedTable(context.order.priceTableVersion, conn);
      if (!table) throw new ToolError("Tabela não encontrada.");
      const sale = saleOf(context.order, table);
      if (approve) await assertApprovalAuthority(context.order, who, conn);
      if (approve && context.proposal.missing.length) throw new ToolError(context.proposal.missing.join(" "));
      return prepareConfirmation(this.name, session.email, { number: context.order.number, reason, fingerprint: context.fingerprint }, { pedido: context.order.number, cliente: context.order.customer?.name, total_com_ipi: sale.invoiceTotal, motivo: reason, efeito: approve ? "Fechará a venda e gerará os recebíveis. Nenhum pagamento será baixado." : "Voltará à negociação com este motivo." }, conn);
    },
  };
}

const cancelTool: Tool = {
  name: "pedido_cancelar", title: "Cancelar pedido sem movimentação", item: "pedidos", available: decider, writes: true, destructive: true,
  description: "Gerência/diretoria com acesso à equipe: prévia e confirmação de cancelamento com motivo. Somente sem qualquer baixa (mesmo estornada), nota fiscal, contrato ativo, produção, estoque ou conta vinculada. Cancela títulos abertos, preserva histórico e registra autoria. Não cancela NF, contrato ou pagamento.",
  inputSchema: object({ ...orderFields, motivo: field("Motivo obrigatório, de 5 a 300 caracteres") }),
  async run(session, conn, args) {
    const who = actor(session), token = confirmation(args);
    if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
      const context = await commercialContext(String(payload.number), scopeOf(session), conn, true);
      if (context.fingerprint !== payload.fingerprint) throw new ToolError(CHANGED);
      return cancelForMcp(context.order.number, scopeOf(session), String(payload.reason), who, conn);
    });
    const context = await commercialContext(numberOf(args), scopeOf(session), conn);
    if (!["em_negociacao", "aguardando_aprovacao", "fechado"].includes(context.order.status)) throw new ToolError("Este pedido já está cancelado ou perdido.");
    const reason = text(args, "motivo");
    if (reason.length < 5) throw new ToolError("Informe o motivo do cancelamento, de 5 a 300 caracteres.");
    const problems = await cancellationProblems(context.order.id, conn);
    if (problems.length) throw new ToolError(`Cancelamento bloqueado. ${problems.join(" ")}`);
    return prepareConfirmation(this.name, session.email, { number: context.order.number, reason, fingerprint: context.fingerprint }, { pedido: context.order.number, cliente: context.order.customer?.name ?? null, situacao: context.order.status, motivo: reason, efeito: "Pedido cancelado e títulos abertos cancelados; histórico preservado. Não desfaz documentos ou movimentações." }, conn);
  },
};
export const ORDER_DECISION_TOOLS: Tool[] = [requestTool, decisionTool(true), decisionTool(false), cancelTool];

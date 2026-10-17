import { seesAllOrders } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/access";
import { getCustomer } from "@/lib/db/customers";
import { addActivity, checkedOpportunity, createOpportunity, getOpportunity, listStages, moveOpportunity, setActivityDone } from "@/lib/db/funnel";
import type { OpportunityInput } from "@/lib/db/funnel";
import { digest, duplicateTasksForMcp } from "@/lib/db/mcp-commercial";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { confirmField, confirmation, date, field, integer, money, numeric, object, text } from "@/lib/mcp/input";

const scope = (session: Session) => ({ ownerEmail: seesAllOrders(session) ? null : session.email });
function activityTool(note: boolean): Tool {
  return {
    name: note ? "funil_anotar" : "funil_criar_tarefa", title: note ? "Anotar na oportunidade" : "Criar tarefa", item: "funil", writes: true,
    description: "Prepara atividade na oportunidade ao alcance da pessoa. Exige prévia e confirmação, sem repetir a escrita ao reutilizar o código. Não envia mensagens ou convites.",
    inputSchema: object({ id: numeric("ID da oportunidade"), texto: field("Texto de 2 a 300 caracteres"), ...(note ? {} : { tipo: { ...field("Tipo da atividade; padrão tarefa"), enum: ["tarefa", "ligacao", "reuniao"] }, para: field("AAAA-MM-DD, opcional") }), ...confirmField }),
    async run(session, conn, args) {
      const state = async (id: number, lock = false) => {
        if (lock) await conn.query("SELECT id FROM opportunities WHERE id=$1 AND ($2::text IS NULL OR owner_email=$2) FOR UPDATE", [id, scope(session).ownerEmail]);
        const revision = await conn.query("SELECT updated_at::text AS revision FROM opportunities WHERE id=$1 AND ($2::text IS NULL OR owner_email=$2)", [id, scope(session).ownerEmail]);
        const opportunity = await getOpportunity(id, scope(session), conn);
        if (!opportunity) throw new ToolError("Oportunidade não encontrada.");
        return { opportunity, fingerprint: digest({ opportunity, revision: revision.rows[0] }) };
      };
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const current = await state(Number(payload.id), true);
        if (current.fingerprint !== payload.fingerprint) throw new ToolError("A oportunidade mudou. Peça nova prévia.");
        await addActivity(Number(payload.id), { kind: String(payload.kind), title: String(payload.title), dueOn: payload.due as string | null }, session.email, scope(session), conn);
        return note ? { anotada: true } : { criada: true };
      });
      const id = integer(args), title = text(args, "texto"), kind = note ? "nota" : text(args, "tipo", 10) || "tarefa";
      if (title.length < 2 || !(note ? ["nota"] : ["tarefa", "ligacao", "reuniao"]).includes(kind)) throw new ToolError("Informe texto de 2 a 300 caracteres e tipo válido.");
      const due = note ? null : text(args, "para", 10) || null;
      if (due) date(due);
      const current = await state(id);
      return prepareConfirmation(this.name, session.email, { id, title, kind, due, fingerprint: current.fingerprint }, { oportunidade: current.opportunity.title, tipo: kind, texto: title, para: due }, conn);
    },
  };
}
export const FUNNEL_TOOLS: Tool[] = [
  activityTool(false), activityTool(true),
  {
    name: "funil_criar_oportunidade", title: "Criar oportunidade", item: "funil", writes: true,
    description: "Prepara uma oportunidade do próprio usuário, na primeira etapa aberta. Escolha cliente cadastrado ou informe empresa. Valida dados e pede confirmação; não cria pedido nem envia mensagem.",
    inputSchema: object({ titulo: field("Título de 2 a 120 caracteres"), cliente_id: numeric("ID de cliente, opcional se informar empresa"), empresa: field("Nome da empresa sem cadastro, 2 a 120 caracteres"), contato: field("Nome do contato"), telefone: field("Telefone do contato"), email: field("E-mail do contato"), origem: field("Origem da oportunidade"), valor: numeric("Estimativa em reais, opcional"), observacoes: field("Até 4000 caracteres"), ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const input = checkedOpportunity(payload.input as OpportunityInput);
        await conn.query("SELECT id FROM pipeline_stages FOR SHARE");
        const first = (await listStages(conn)).find((s) => s.kind === "aberta");
        if (digest(first) !== payload.stageFingerprint) throw new ToolError("As etapas mudaram. Peça nova prévia.");
        const id = await createOpportunity(input, session, conn);
        return { criada: true, oportunidade_id: id, responsavel: session.email };
      });
      const input = checkedOpportunity({ title: text(args, "titulo", 120), customerId: args.cliente_id === undefined ? null : integer(args, "cliente_id"), company: text(args, "empresa", 120) || null, contactName: text(args, "contato", 120) || null, phone: text(args, "telefone", 40) || null, email: text(args, "email", 150) || null, source: text(args, "origem", 80) || null, estimatedValue: args.valor === undefined ? null : args.valor === 0 ? 0 : money(args), notes: text(args, "observacoes", 4000) || null });
      const customer = input.customerId === null ? null : await getCustomer(input.customerId, conn);
      if (input.customerId !== null && !customer) throw new ToolError("Cliente não encontrado.");
      const first = (await listStages(conn)).find((s) => s.kind === "aberta");
      if (!first) throw new ToolError("Cadastre uma etapa aberta do funil antes de criar a oportunidade.");
      return prepareConfirmation(this.name, session.email, { input, stageFingerprint: digest(first) }, { titulo: input.title, cliente: customer?.name ?? input.company, etapa: first.name, valor_estimado: input.estimatedValue, responsavel: session.email }, conn);
    },
  },
  {
    name: "funil_mover_etapa", title: "Mover oportunidade", item: "funil", writes: true, destructive: true,
    description: "Sem argumentos lista etapas. Para mover, informe id da oportunidade e etapa_id; perda exige motivo. Prévia explicita o destino; confirmação recusa edição ou troca de responsável após a prévia. Etapa ganha não fecha pedido nem registra receita.",
    inputSchema: object({ id: numeric("ID da oportunidade"), etapa_id: numeric("ID da etapa de destino"), motivo: field("Motivo obrigatório para perda, até 300 caracteres"), ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      const state = async (id: number, stageId: number, lock = false) => {
        if (lock) await conn.query("SELECT id FROM opportunities WHERE id=$1 AND ($2::text IS NULL OR owner_email=$2) FOR UPDATE", [id, scope(session).ownerEmail]);
        const revision = await conn.query("SELECT updated_at::text AS revision FROM opportunities WHERE id=$1 AND ($2::text IS NULL OR owner_email=$2)", [id, scope(session).ownerEmail]);
        const opportunity = await getOpportunity(id, scope(session), conn);
        if (!opportunity) throw new ToolError("Oportunidade não encontrada.");
        if (lock) await conn.query("SELECT id FROM pipeline_stages WHERE id=$1 FOR SHARE", [stageId]);
        const stage = (await listStages(conn)).find((s) => s.id === stageId);
        if (!stage) throw new ToolError("Etapa não encontrada.");
        return { opportunity, stage, fingerprint: digest({ opportunity, revision: revision.rows[0], stage }) };
      };
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const current = await state(Number(payload.id), Number(payload.stageId), true);
        if (current.fingerprint !== payload.fingerprint) throw new ToolError("A oportunidade ou etapa mudou. Peça nova prévia.");
        await moveOpportunity(Number(payload.id), Number(payload.stageId), payload.reason as string | null, session.email, scope(session), conn);
        return { movida: true, oportunidade_id: payload.id, etapa: current.stage.name, situacao: current.stage.kind };
      });
      if (Object.keys(args).length === 0) return { etapas: await listStages(conn) };
      const id = integer(args), stageId = integer(args, "etapa_id"), reason = text(args, "motivo") || null;
      const current = await state(id, stageId);
      if (current.stage.kind === "perdida" && !reason) throw new ToolError("Informe o motivo da perda.");
      if (current.opportunity.stageId === stageId) throw new ToolError("A oportunidade já está nesta etapa.");
      return prepareConfirmation(this.name, session.email, { id, stageId, reason, fingerprint: current.fingerprint }, { oportunidade: current.opportunity.title, de: current.opportunity.stageName, para: current.stage.name, motivo: reason }, conn);
    },
  },
  {
    name: "tarefas_limpar_duplicadas", title: "Consolidar tarefas duplicadas", item: "funil", writes: true, destructive: true,
    description: "Prévia de tarefas pendentes com título, assunto, responsável e vencimento exatamente iguais. Mantém a mais antiga aberta e marca as demais como resolvidas por duplicidade, com autoria, sem excluir histórico ou chaves automáticas. Não inclui notas, reuniões, ligações ou tarefas já concluídas. Até 100 duplicadas por confirmação.",
    inputSchema: object({ responsavel: field("E-mail opcional para filtrar; vendedor só pode consultar a si mesmo"), ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const owner = seesAllOrders(session) ? payload.owner as string | null : session.email;
        const current = await duplicateTasksForMcp(owner, conn, true);
        if (digest(current) !== payload.fingerprint) throw new ToolError("As tarefas mudaram. Peça nova prévia.");
        for (const task of current) {
          await setActivityDone(task.id, true, session.email, { ownerEmail: owner }, conn);
          await conn.query("UPDATE opportunity_activities SET completion_note=$2 WHERE id=$1", [task.id, `Consolidada por duplicidade; mantida a tarefa #${task.manter}.`]);
        }
        return { consolidadas_por_duplicidade: current.length, tarefas: current.map((t) => ({ id: t.id, mantida: t.manter })), historico_preservado: true };
      });
      const requested = text(args, "responsavel", 150).toLowerCase();
      if (!seesAllOrders(session) && requested && requested !== session.email) throw new ToolError("Você só pode consolidar suas próprias tarefas.");
      const owner = requested || scope(session).ownerEmail;
      const duplicates = await duplicateTasksForMcp(owner, conn);
      if (!duplicates.length) return { duplicadas: [], instrucao: "Nenhuma tarefa pendente exatamente duplicada neste alcance." };
      return prepareConfirmation(this.name, session.email, { owner, fingerprint: digest(duplicates) }, { consolidar: duplicates, criterio: "A mais antiga permanece pendente. As demais ficam resolvidas por duplicidade; nenhuma tarefa é excluída." }, conn);
    },
  },
];

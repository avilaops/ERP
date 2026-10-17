import { normalizedAddress } from "@/lib/address";
import { parseCustomerForm } from "@/lib/customer-form";
import type { CustomerFieldKey } from "@/lib/customer-form";
import type { CustomerInput } from "@/lib/customer";
import { createCustomer, findCustomerByDocument, getCustomer, updateCustomer } from "@/lib/db/customers";
import { digest } from "@/lib/db/mcp-commercial";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { ToolError } from "@/lib/mcp/definition";
import type { Tool } from "@/lib/mcp/definition";
import { confirmField, confirmation, field, integer, numeric, object, text } from "@/lib/mcp/input";

const FIELDS: Record<string, CustomerFieldKey> = { documento: "document", nome: "name", fantasia: "tradeName", contato: "contactName", ie: "stateRegistration", rg: "rg", telefone: "phone", email: "email", cep: "cep", endereco: "street", numero: "streetNumber", complemento: "complement", bairro: "district", cidade: "city", uf: "uf" };
const customerFields = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, field(`${key}: dado do cliente. Vazio apaga o campo opcional; omitido preserva na atualização.`)]));
function parse(args: Record<string, unknown>, current?: CustomerInput): CustomerInput {
  const kind = current?.kind ?? text(args, "tipo", 2);
  if (kind !== "PJ" && kind !== "PF") throw new ToolError("Escolha tipo PJ ou PF.");
  const values = { ...current } as Record<string, string | null>;
  for (const [key, mapped] of Object.entries(FIELDS)) if (args[key] !== undefined) values[mapped] = text(args, key, 300);
  if (current && (args.tipo !== undefined || args.documento !== undefined)) throw new ToolError("Tipo e documento identificam o cliente e não podem ser alterados.");
  const parsed = parseCustomerForm(kind, (key) => values[key] ?? null);
  if (!parsed.ok) throw new ToolError(parsed.errors.join(" "));
  return normalizedAddress(parsed.input);
}

export const CUSTOMER_TOOLS: Tool[] = [
  {
    name: "clientes_cadastrar", title: "Cadastrar cliente", item: "clientes", writes: true,
    description: "Prepara cadastro PJ/PF com validação de CNPJ/CPF, telefone, e-mail e endereço. Não consulta nem inventa dados ausentes. Exige confirmação, não duplica documento ou repetição do código.",
    inputSchema: object({ tipo: { ...field("PJ ou PF"), enum: ["PJ", "PF"] }, ...customerFields, ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const customer = await createCustomer(payload.input as CustomerInput, session.email, conn);
        return { cadastrado: true, cliente_id: customer.id, nome: customer.name };
      });
      const input = parse(args);
      if (await findCustomerByDocument(input.document, conn)) throw new ToolError("Já existe cliente com este documento. Use clientes_atualizar.");
      return prepareConfirmation(this.name, session.email, { input }, { cadastro: input }, conn);
    },
  },
  {
    name: "clientes_atualizar", title: "Corrigir cadastro do cliente", item: "clientes", writes: true, destructive: true,
    description: "Prévia das correções: informe id e somente campos a alterar. Campos omitidos são preservados; vazio limpa opcional. Tipo/documento são imutáveis. Se alguém editar antes da confirmação, exige nova prévia.",
    inputSchema: object({ id: numeric("ID de clientes_buscar"), ...Object.fromEntries(Object.entries(customerFields).filter(([key]) => key !== "documento")), ...confirmField }),
    async run(session, conn, args) {
      const token = confirmation(args);
      if (token) return executeConfirmation(this.name, session.email, token, conn, async (payload) => {
        const state = await conn.query("SELECT updated_at::text AS revision FROM customers WHERE id=$1 FOR UPDATE", [payload.id]);
        const current = await getCustomer(Number(payload.id), conn);
        if (!current || digest({ current, state: state.rows[0] }) !== payload.fingerprint) throw new ToolError("O cadastro mudou. Peça nova prévia.");
        const updated = await updateCustomer(current.id, payload.input as CustomerInput, session.email, conn);
        return { atualizado: true, cliente_id: updated.id, nome: updated.name };
      });
      const id = integer(args);
      if (Object.keys(args).every((key) => key === "id")) throw new ToolError("Informe pelo menos um campo a corrigir.");
      const current = await getCustomer(id, conn);
      if (!current) throw new ToolError("Cliente não encontrado.");
      const state = await conn.query("SELECT updated_at::text AS revision FROM customers WHERE id=$1", [id]);
      const input = parse(args, current);
      return prepareConfirmation(this.name, session.email, { id, input, fingerprint: digest({ current, state: state.rows[0] }) }, { cliente_id: id, antes: current, depois: input }, conn);
    },
  },
];

/**
 * Fictitious data for ONE company, to see and photograph the screens with
 * content instead of empty lists:
 *
 *   npm run db:seed-demo -- --empresa <identificador>
 *
 * Only runs on a database whose name ends in `_demo`, `_dev` or `_test`, and
 * only on a company that has no customer and no order yet: it never mixes with
 * real data. Everything goes through the same functions the screens use, so
 * the data obeys the same rules. Names, CNPJs and phones are invented.
 */
import { parseTenants } from "@/lib/auth/tenants";
import { isValidCnpj } from "@/lib/customer";
import { databaseUrl, tenantSchema } from "@/lib/db/config";
import { createCustomer } from "@/lib/db/customers";
import { addActivity, createOpportunity, linkOpportunityOrder, listStages, moveOpportunity } from "@/lib/db/funnel";
import { saveGoal } from "@/lib/db/goals";
import { closeOrder, createOrder, getOrder, linkOrderCustomer, saveOrderTerms, savePayment, setOrderItemQuantity, addOrderItem } from "@/lib/db/orders";
import { listPayableCategories } from "@/lib/db/payable-categories";
import { createPayable, payPayable } from "@/lib/db/payables";
import { loadParams } from "@/lib/db/params";
import { closeTenantPools, withTenantConnection } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { latestVersion, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { listOpenReceivables, recordReceipt } from "@/lib/db/receivables";
import { createSupplier } from "@/lib/db/suppliers";
import { isoDate } from "@/lib/format";
import type { Uf } from "@/lib/pricing/states";
import { saleOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";

const USAGE = "Uso: npm run db:seed-demo -- --empresa <identificador>";
const DATABASE_SUFFIXES = ["_demo", "_dev", "_test"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
let slug: string | undefined;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--empresa") slug = args[(index += 1)];
  else if (arg.startsWith("--empresa=")) slug = arg.slice("--empresa=".length);
  else fail(`Opção desconhecida: ${arg}\n${USAGE}`);
}
const tenants = parseTenants(process.env.ERP_TENANTS);
const available = tenants.map((tenant) => tenant.slug).join(", ") || "nenhuma: ERP_TENANTS ausente";
if (!slug) fail(`Falta dizer a empresa: --empresa <identificador> (configuradas: ${available}).\n${USAGE}`);
const tenant = tenants.find((candidate) => candidate.slug === slug);
if (!tenant) fail(`Empresa desconhecida: "${slug}" (configuradas: ${available}).`);

const url = new URL(databaseUrl(process.env));
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!DATABASE_SUFFIXES.some((suffix) => databaseName.endsWith(suffix))) {
  fail(`Dados de demonstração só entram em banco com nome terminado em ${DATABASE_SUFFIXES.join(", ")} (recebido: "${databaseName}").`);
}
console.log(`Banco: ${databaseName} em ${url.host}`);
console.log(`Empresa: ${tenant.name} (${tenantSchema(tenant.slug)})`);

const DIRECTOR = "diretoria@teste.local";
// The sellers are the test users of the local sign-in (/dev/login), so each one sees their own sales.
const SELLER = { email: "vendedor@teste.local", name: "Vendedor (teste)" };
const MANAGER = { email: "gerente.comercial@teste.local", name: "Gerente comercial (teste)" };
const ALL = { sellerEmail: null };
const EVERYONE = { ownerEmail: null };

const EQUIPMENT: [code: string, name: string, cost: number][] = [
  ["DM-001", "Leg press 45° com anilhas", 14200],
  ["DM-002", "Cadeira extensora", 6100],
  ["DM-003", "Mesa flexora", 6350],
  ["DM-004", "Supino reto articulado", 8900],
  ["DM-005", "Crossover duplo", 12800],
  ["DM-006", "Puxador alto e remada baixa", 7400],
  ["DM-007", "Esteira profissional 22 km/h", 18900],
  ["DM-008", "Bicicleta ergométrica vertical", 5200],
  ["DM-009", "Smith machine com contrapeso", 11300],
  ["DM-010", "Banco regulável", 1450],
  ["DM-011", "Rack de halteres com 10 pares", 4300],
  ["DM-012", "Hack machine", 9800],
];

const CUSTOMERS: [name: string, city: string, uf: Uf, contact: string][] = [
  ["Academia Demonstração Centro", "São Paulo", "SP", "Ana Souza"],
  ["Studio Fictício Fitness", "Belo Horizonte", "MG", "Bruno Lima"],
  ["Clube Exemplo de Musculação", "Curitiba", "PR", "Carla Mendes"],
  ["Academia Modelo Norte", "São Luís", "MA", "Diego Rocha"],
  ["Box Teste Cross", "Salvador", "BA", "Elisa Prado"],
  ["Centro Esportivo Amostra", "Goiânia", "GO", "Fábio Nunes"],
  ["Academia Simulada Sul", "Porto Alegre", "RS", "Gabriela Torres"],
  ["Espaço Corpo Demonstrativo", "Rio de Janeiro", "RJ", "Henrique Alves"],
];

/** A valid, invented CNPJ: twelve digits of our own and the two check digits that make it valid. */
function cnpj(seed: number): string {
  const base = `9${String(seed).padStart(7, "0")}0001`;
  for (let check = 0; check < 100; check += 1) {
    const document = base + String(check).padStart(2, "0");
    if (isValidCnpj(document)) return document;
  }
  throw new Error(`Sem dígito verificador para ${base}.`);
}

/** Order numbers in the format of the system (AAMMDD-XXXX), fixed, so running on an empty company always gives the same ones. */
function orderNumber(index: number): string {
  const now = new Date();
  const day = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${day}-DM${String(index).padStart(2, "0")}`;
}

const daysAgo = (days: number) => isoDate(new Date(Date.now() - days * 86_400_000));

async function assertEmpty(conn: Queryable): Promise<void> {
  const { rows } = await conn.query("SELECT (SELECT count(*) FROM customers)::int AS customers, (SELECT count(*) FROM orders)::int AS orders");
  if (rows[0].customers > 0 || rows[0].orders > 0) {
    throw new Error(`A empresa já tem ${rows[0].customers} cliente(s) e ${rows[0].orders} pedido(s): os dados de demonstração só entram em empresa vazia.`);
  }
}

/** Moves the dates of one order (and what its closing created) back by `days`, as if it had been sold then. */
async function backdateOrder(number: string, days: number, conn: Queryable): Promise<void> {
  const shift = `${days} days`;
  await conn.query("UPDATE orders SET created_at = created_at - $2::interval, updated_at = updated_at - $2::interval, closed_at = closed_at - $2::interval WHERE number = $1", [number, shift]);
  await conn.query("UPDATE order_closings SET closed_at = closed_at - $2::interval WHERE order_id = (SELECT id FROM orders WHERE number = $1)", [number, shift]);
  await conn.query(
    "UPDATE receivables SET due_date = due_date - $2::interval, created_at = created_at - $2::interval WHERE order_id = (SELECT id FROM orders WHERE number = $1)",
    [number, shift],
  );
}

async function seed(conn: Queryable): Promise<string[]> {
  const done: string[] = [];
  await assertEmpty(conn);

  for (const [code, name, cost] of EQUIPMENT) await createProduct({ name, code, advisoryCost: cost, taxCredit: 0.27 }, DIRECTOR, conn);
  await createProduct({ name: "Remo seco (aguardando custo)", code: "DM-013" }, DIRECTOR, conn);
  const draft = draftPriceTable(await loadParams(conn), await listProducts({ active: true }, conn));
  const version = ((await latestVersion(conn))?.version ?? 0) + 1;
  await publishPriceTable(draft, version, DIRECTOR, conn);
  const table = await loadPublishedTable(version, conn);
  if (!table) throw new Error("A tabela publicada não foi encontrada.");
  const productId = (code: string) => {
    const item = table.items.find((candidate) => candidate.code === code);
    if (!item) throw new Error(`Equipamento ${code} fora da tabela.`);
    return item.productId;
  };
  done.push(`${EQUIPMENT.length + 1} equipamentos e a tabela de preços v${version}`);

  const customers: { id: number; uf: Uf }[] = [];
  for (const [index, [name, city, uf, contact]] of CUSTOMERS.entries()) {
    const created = await createCustomer(
      {
        kind: "PJ",
        document: cnpj(index + 1),
        name,
        tradeName: null,
        contactName: contact,
        stateRegistration: "ISENTO",
        rg: null,
        phone: `119${String(80000000 + index * 1111).padStart(8, "0")}`,
        email: `contato${index + 1}@exemplo.invalid`,
        cep: "01001000",
        street: "Rua de Demonstração",
        streetNumber: String(100 + index),
        complement: null,
        district: "Centro",
        city,
        uf,
      },
      SELLER.email,
      conn,
    );
    customers.push({ id: created.id, uf });
  }
  done.push(`${customers.length} clientes`);

  // [items, customer, seller, days ago, what happens]
  type Plan = { items: [string, number][]; customer: number; seller: typeof SELLER; daysAgo: number; outcome: "fechado" | "aprovacao" | "negociacao" };
  const plans: Plan[] = [
    { items: [["DM-001", 2], ["DM-002", 2], ["DM-003", 2]], customer: 0, seller: SELLER, daysAgo: 170, outcome: "fechado" },
    { items: [["DM-007", 4], ["DM-008", 4]], customer: 1, seller: MANAGER, daysAgo: 140, outcome: "fechado" },
    { items: [["DM-005", 1], ["DM-006", 2], ["DM-010", 4]], customer: 2, seller: SELLER, daysAgo: 110, outcome: "fechado" },
    { items: [["DM-009", 2], ["DM-011", 1]], customer: 3, seller: SELLER, daysAgo: 80, outcome: "fechado" },
    { items: [["DM-004", 3], ["DM-012", 1]], customer: 4, seller: MANAGER, daysAgo: 50, outcome: "fechado" },
    { items: [["DM-007", 6]], customer: 5, seller: SELLER, daysAgo: 25, outcome: "fechado" },
    { items: [["DM-001", 1], ["DM-010", 6]], customer: 6, seller: MANAGER, daysAgo: 8, outcome: "fechado" },
    { items: [["DM-005", 2], ["DM-009", 1]], customer: 7, seller: SELLER, daysAgo: 3, outcome: "aprovacao" },
    { items: [["DM-002", 3], ["DM-003", 3]], customer: 1, seller: SELLER, daysAgo: 2, outcome: "negociacao" },
    { items: [["DM-008", 10]], customer: 2, seller: MANAGER, daysAgo: 1, outcome: "negociacao" },
    { items: [["DM-012", 2]], customer: 4, seller: SELLER, daysAgo: 0, outcome: "negociacao" },
  ];

  const numbers: string[] = [];
  for (const [index, plan] of plans.entries()) {
    const number = await createOrder({ seller: plan.seller, version, productId: productId(plan.items[0][0]), quantity: plan.items[0][1] }, () => orderNumber(index + 1), conn);
    const scope = { sellerEmail: plan.seller.email };
    for (const [code, quantity] of plan.items.slice(1)) await addOrderItem(number, productId(code), quantity, plan.seller.email, scope, conn);
    const customer = customers[plan.customer];
    await linkOrderCustomer(number, customer.id, plan.seller.email, scope, conn);
    await saveOrderTerms(number, { discount: 0.03, deliveryUf: customer.uf, taxpayer: false, productionDays: 90, freight: 0, notes: null }, plan.seller.email, scope, conn);
    if (plan.outcome !== "negociacao") {
      const order = await getOrder(number, ALL, conn);
      if (!order) throw new Error(`Pedido ${number} não encontrado.`);
      const total = saleOf(order, table).invoiceTotal;
      // Fictitious terms belong to each demo order, never to a real company's defaults.
      await conn.query("UPDATE orders SET proposal_details = $1::jsonb WHERE id = $2", [JSON.stringify({ warranty: "12 meses contra defeitos de fabricação (demonstração fictícia).", installation: "Não inclusa (demonstração fictícia).", freightMode: "FOB" }), order.id]);
      // 70% of entrada closes within the policy; 30% sends the order to approval.
      const share = plan.outcome === "fechado" ? 0.7 : 0.3;
      await savePayment(
        number,
        { downPayment: Math.round(total * share * 100) / 100, downPaymentMethod: "PIX", downPaymentDate: null, balanceMethod: "Boleto", installmentCount: 3, firstInstallmentDays: 30, installmentIntervalDays: 30, paymentNotes: null },
        plan.seller.email,
        scope,
        conn,
      );
      const result = await closeOrder(number, plan.seller.email, scope, conn);
      if (result.missing.length > 0) throw new Error(`Pedido ${number} não fechou: ${result.missing.join(" ")}`);
    }
    // A one-off change, so the item list of the newest order is not all ones.
    if (plan.outcome === "negociacao" && index === plans.length - 1) await setOrderItemQuantity(number, productId(plan.items[0][0]), 3, plan.seller.email, scope, conn);
    if (plan.daysAgo > 0) await backdateOrder(number, plan.daysAgo, conn);
    numbers.push(number);
  }
  done.push(`${plans.length} pedidos (7 fechados, 1 aguardando aprovação, 3 em negociação)`);

  // What already came in: every receivable whose day has passed.
  const today = isoDate(new Date());
  let receipts = 0;
  for (const receivable of await listOpenReceivables(conn)) {
    if (receivable.dueDate === null || receivable.dueDate >= today) continue;
    await recordReceipt(receivable.id, { receivedOn: receivable.dueDate, method: receivable.method, note: null }, "financeiro@teste.local", today, conn);
    receipts += 1;
  }
  done.push(`${receipts} recebimentos baixados`);

  const stages = await listStages(conn);
  const stage = (kind: string, position = 0) => stages.filter((candidate) => candidate.kind === kind)[position];
  const opportunities: [title: string, company: string, value: number, owner: typeof SELLER, stageKind: string, position: number][] = [
    ["Academia nova com 40 aparelhos", "Rede Fictícia Fit", 380000, SELLER, "aberta", 0],
    ["Troca das esteiras", "Academia Modelo Norte", 120000, SELLER, "aberta", 1],
    ["Segunda unidade", "Studio Fictício Fitness", 210000, MANAGER, "aberta", 2],
    ["Área de musculação do condomínio", "Condomínio Exemplo", 65000, SELLER, "aberta", 3],
    ["Reforma do salão", "Box Teste Cross", 48000, MANAGER, "aberta", 1],
    ["Clube com piscina e academia", "Clube Demonstrativo", 155000, SELLER, "perdida", 0],
  ];
  for (const [title, company, value, owner, kind, position] of opportunities) {
    const id = await createOpportunity({ title, customerId: null, company, contactName: "Contato de demonstração", phone: null, email: null, source: "Indicação", estimatedValue: value, notes: null }, owner, conn);
    const target = stage(kind, position) ?? stage("aberta", 0);
    if (target) await moveOpportunity(id, target.id, kind === "perdida" ? "Preço acima do orçamento do cliente." : null, owner.email, EVERYONE, conn);
    await addActivity(id, { kind: "ligacao", title: `Ligar para ${company}`, dueOn: daysAgo(-((position % 3) + 1)) }, owner.email, EVERYONE, conn);
  }
  // The last order in negotiation also has its opportunity.
  const linked = await createOpportunity({ title: "Hack machine para a sala nova", customerId: customers[4].id, company: null, contactName: null, phone: null, email: null, source: "Site", estimatedValue: 30000, notes: null }, SELLER, conn);
  await linkOpportunityOrder(linked, numbers[numbers.length - 1], SELLER.email, EVERYONE, conn);
  done.push(`${opportunities.length + 1} oportunidades no funil, com atividades`);

  const suppliers = [
    await createSupplier({ kind: "EX", document: null, name: "Fábrica Exemplo de Equipamentos Ltd.", tradeName: null, contactName: "Li Wei", phone: null, email: null, country: "China", bank: {}, notes: null, active: true }, DIRECTOR, conn),
    await createSupplier({ kind: "PJ", document: cnpj(90), name: "Transportes Fictícios", tradeName: null, contactName: "Marcos", phone: null, email: null, country: null, bank: {}, notes: null, active: true }, DIRECTOR, conn),
  ];
  const categories = await listPayableCategories(conn);
  const category = (index: number) => categories[Math.min(index, categories.length - 1)];
  const bills: [description: string, supplier: number | null, category: number, amount: number, dueDaysAgo: number, paid: boolean][] = [
    ["Lote de equipamentos 1/2", 0, 0, 98000, 60, true],
    ["Lote de equipamentos 2/2", 0, 0, 98000, -20, false],
    ["Frete do contêiner", 1, 1, 14500, 35, true],
    ["Frete para Curitiba", 1, 1, 3200, 5, false],
    ["Aluguel do galpão", null, 2, 8500, 10, true],
    ["Aluguel do galpão", null, 2, 8500, -20, false],
    ["Energia", null, 3, 1350, -6, false],
  ];
  for (const [description, supplier, categoryIndex, amount, dueDaysAgo, paid] of bills) {
    const created = await createPayable({ description, supplierId: supplier === null ? null : suppliers[supplier].id, category: category(categoryIndex), amount, dueDate: daysAgo(dueDaysAgo), method: "Boleto" }, DIRECTOR, conn);
    if (paid) await payPayable(created.id, { paidOn: daysAgo(dueDaysAgo), paidAmount: amount, method: "Boleto" }, DIRECTOR, today, conn);
  }
  done.push(`${suppliers.length} fornecedores e ${bills.length} contas a pagar`);

  const month = today.slice(0, 7);
  await saveGoal(null, month, 450000, DIRECTOR, conn);
  await saveGoal(SELLER.email, month, 250000, DIRECTOR, conn);
  await saveGoal(MANAGER.email, month, 200000, DIRECTOR, conn);
  done.push("metas do mês da equipe e de cada vendedor");
  return done;
}

let exitCode = 1;
try {
  const done = await withTenantConnection(tenant.slug, async (conn) => {
    await conn.query("BEGIN");
    try {
      const lines = await seed(conn);
      await conn.query("COMMIT");
      return lines;
    } catch (error) {
      await conn.query("ROLLBACK");
      throw error;
    }
  });
  for (const line of done) console.log(`- ${line}`);
  exitCode = 0;
} catch (error) {
  console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}\nNada foi gravado.`);
} finally {
  await closeTenantPools();
}
process.exit(exitCode);

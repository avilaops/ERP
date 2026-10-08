/**
 * Batch load of the supplier's catalogue (items, measures and photos) into ONE company:
 *
 *   npm run db:import-supplier-catalog -- <arquivo.json> <pasta-das-fotos> --empresa <identificador> [--apply]
 *
 * The file is `{ equipamentos: [...] }`; each photo is looked for under the folder, as `<catálogo>/<arquivo>`.
 * Without `--apply` nothing is written: the command only checks and reports.
 * The company is always named on the command line: there is no default, so a
 * load never lands in the wrong company.
 */
import { parseTenants } from "@/lib/auth/tenants";
import { databaseUrl, tenantSchema } from "@/lib/db/config";
import { closeTenantPools, withTenantConnection } from "@/lib/db/pool";
import { runSupplierCatalogImport } from "@/lib/import/supplier-catalog";

const USAGE = "Uso: npm run db:import-supplier-catalog -- <arquivo.json> <pasta-das-fotos> --empresa <identificador> [--apply]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
let apply = false;
let slug: string | undefined;
const positional: string[] = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--apply") apply = true;
  else if (arg === "--empresa") slug = args[(index += 1)];
  else if (arg.startsWith("--empresa=")) slug = arg.slice("--empresa=".length);
  else if (arg.startsWith("--")) fail(`Opção desconhecida: ${arg}\n${USAGE}`);
  else positional.push(arg);
}
if (positional.length !== 2) fail(USAGE);

const tenants = parseTenants(process.env.ERP_TENANTS);
const available = tenants.map((tenant) => tenant.slug).join(", ") || "nenhuma: ERP_TENANTS ausente";
if (!slug) fail(`Falta dizer a empresa: --empresa <identificador> (configuradas: ${available}).\n${USAGE}`);
const tenant = tenants.find((candidate) => candidate.slug === slug);
if (!tenant) fail(`Empresa desconhecida: "${slug}" (configuradas: ${available}).`);

// Where the load goes, without the password.
const url = new URL(databaseUrl(process.env));
console.log(`Banco: ${decodeURIComponent(url.pathname.slice(1))} em ${url.host}`);
console.log(`Empresa: ${tenant.name} (${tenantSchema(tenant.slug)})`);

let exitCode = 1;
try {
  const result = await withTenantConnection(tenant.slug, (conn) =>
    runSupplierCatalogImport(positional[0], positional[1], { apply, who: "carga-catalogo-fornecedor" }, conn),
  );
  for (const line of result.lines) console.log(line);
  exitCode = result.exitCode;
} catch (error) {
  console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}\nNada foi gravado.`);
} finally {
  await closeTenantPools();
}
process.exit(exitCode);

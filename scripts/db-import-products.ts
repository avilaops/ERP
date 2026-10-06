/**
 * Batch load of equipment, descriptions and photos into ONE company:
 *
 *   npm run db:import-products -- <pasta> --empresa <identificador> [--apply]
 *
 * `<pasta>` holds `equipamentos.csv` and `fotos/<codigo>.<jpg|jpeg|png|webp>`.
 * Without `--apply` nothing is written: the command only checks and reports.
 * The company is always named on the command line: there is no default, so a
 * load never lands in the wrong company.
 */
import { parseTenants } from "@/lib/auth/tenants";
import { databaseUrl, tenantSchema } from "@/lib/db/config";
import { closeTenantPools, withTenantConnection } from "@/lib/db/pool";
import { runProductsImport } from "@/lib/import/products-folder";

const USAGE = "Uso: npm run db:import-products -- <pasta> --empresa <identificador> [--apply]";

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
if (positional.length !== 1) fail(USAGE);

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
  const result = await withTenantConnection(tenant.slug, (conn) => runProductsImport(positional[0], { apply }, conn));
  for (const line of result.lines) console.log(line);
  exitCode = result.exitCode;
} catch (error) {
  console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}\nNada foi gravado.`);
} finally {
  await closeTenantPools();
}
process.exit(exitCode);

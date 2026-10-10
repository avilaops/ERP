import { signupEnabled } from "@/lib/auth/signed-up";
import { parseTenants } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";
import { runAutomations } from "@/lib/db/automations";
import { runCadences } from "@/lib/db/cadences";
import { runCampaigns } from "@/lib/db/campaigns";
import { controlDb, provisionedCompanies } from "@/lib/db/control";
import { receiveMail } from "@/lib/db/inbox";
import { deliverPending } from "@/lib/db/integrations";
import { tenantDb } from "@/lib/db/pool";
import { runProspectLoad } from "@/lib/db/prospect-load";
import { vaultKey } from "@/lib/fiscal/certificate";
import { isoDate } from "@/lib/format";
import { fetchNewMail } from "@/lib/mail/imap";
import { sendMail } from "@/lib/mail/smtp";

/**
 * What the ERP does by itself, with nobody on a screen: the answers of the
 * customers read from the company's mailbox, the reminders of the
 * rules of each company, the steps of the cadences that fell due, the next messages of the campaigns
 * on their way and the notices to other systems that are still to be delivered. One company at a
 * time, each in its own database; a company that fails does not stop the others.
 */
/** Every company of this ERP: the ones of the configuration and, with the sign-up on, the ones that signed up. */
async function companies(env: Record<string, string | undefined>): Promise<Tenant[]> {
  let tenants: Tenant[] = parseTenants(env.ERP_TENANTS);
  if (signupEnabled(env)) {
    try {
      const known = new Set(tenants.map((tenant) => tenant.slug));
      tenants = [...tenants, ...(await provisionedCompanies(controlDb())).filter((tenant) => !known.has(tenant.slug))];
    } catch (error) {
      console.error("[rotinas] cadastro de empresas não pôde ser lido:", error instanceof Error ? error.message : error);
    }
  }
  return tenants;
}

/**
 * The work that takes hours and so runs apart from the rest: the load of
 * prospects from the open data of the Receita Federal, for the company that
 * asked for one. One company at a time; the quick routines never wait for it.
 */
export async function runLongJobs(env: Record<string, string | undefined>): Promise<void> {
  for (const tenant of await companies(env)) {
    try {
      await runProspectLoad(tenantDb(tenant.slug));
    } catch (error) {
      console.error(`[rotinas] carga de prospecção de ${tenant.slug} falhou:`, error instanceof Error ? error.message : error);
    }
  }
}

export async function runBackground(env: Record<string, string | undefined>, now: Date): Promise<void> {
  const tenants = await companies(env);
  const key = () => vaultKey(env.ERP_CERT_KEY);
  for (const tenant of tenants) {
    const conn = tenantDb(tenant.slug);
    for (const [name, job] of [
      ["lembretes", () => runAutomations(isoDate(now), conn)],
      // The answers come first: one read now stops the cadence before its next step leaves.
      ["caixa de entrada", () => receiveMail(now, { key, fetch: fetchNewMail }, conn)],
      ["cadências", () => runCadences(tenant, now, { env, key, send: sendMail }, conn)],
      ["campanhas", () => runCampaigns(tenant, now, { env, key, send: sendMail }, conn)],
      ["avisos", () => deliverPending(key, now, conn)],
    ] as const) {
      try {
        await job();
      } catch (error) {
        console.error(`[rotinas] ${name} de ${tenant.slug} falhou:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

declare global {
  var __ERP_BACKGROUND__: ReturnType<typeof setInterval> | undefined;
}

/** Every how many minutes the routine runs. */
const EVERY_MINUTES = 5;

/**
 * Starts the routine once per process, a minute after the server is up. Off
 * with `ERP_ROTINAS=0`. A run still going when the next one is due is not run
 * over: the next one is skipped.
 */
export function startBackground(env: Record<string, string | undefined>): void {
  if (env.ERP_ROTINAS?.trim() === "0" || globalThis.__ERP_BACKGROUND__) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runBackground(env, new Date());
    } catch (error) {
      console.error("[rotinas] falha:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 60_000).unref();
  globalThis.__ERP_BACKGROUND__ = setInterval(run, EVERY_MINUTES * 60_000);
  globalThis.__ERP_BACKGROUND__.unref();
  // The long work has a pace and a turn of its own.
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    try {
      await runLongJobs(env);
    } catch (error) {
      console.error("[rotinas] falha no trabalho longo:", error instanceof Error ? error.message : error);
    } finally {
      loading = false;
    }
  };
  setInterval(load, 2 * 60_000).unref();
}

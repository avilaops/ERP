import { knownTenant } from "@/lib/auth/known";
import type { Tenant } from "@/lib/auth/tenants";
import { CAPTURE_TOKEN, findCaptureForm } from "@/lib/db/capture";
import type { CaptureForm } from "@/lib/db/capture";
import { emailOfUnsubscribe, UNSUBSCRIBE_TOKEN } from "@/lib/db/optout";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/**
 * The two public doors of marketing, for people with no account in the ERP: a
 * capture form and the way out of the e-mails. As with the signing link, the
 * company comes in the address and gives nothing by itself: it has to be one
 * of the companies of this ERP, and inside it only what the rest of the same
 * address names is reached. A form takes one answer and reads nothing back;
 * an unsubscribe link stands for one e-mail address and only takes it off.
 */
export type OpenCapture = { tenant: Tenant; conn: Queryable; form: CaptureForm };

export async function openCapture(company: string, token: string, env: Record<string, string | undefined> = process.env): Promise<OpenCapture | null> {
  if (!CAPTURE_TOKEN.test(token)) return null;
  const tenant = await knownTenant(company, env);
  if (!tenant) return null;
  const conn = tenantDb(tenant.slug);
  const form = await findCaptureForm(token, conn);
  return form ? { tenant, conn, form } : null;
}

export type OpenUnsubscribe = { tenant: Tenant; conn: Queryable; token: string; email: string };

export async function openUnsubscribe(company: string, token: string, env: Record<string, string | undefined> = process.env): Promise<OpenUnsubscribe | null> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return null;
  const tenant = await knownTenant(company, env);
  if (!tenant) return null;
  const conn = tenantDb(tenant.slug);
  const email = await emailOfUnsubscribe(token, conn);
  return email ? { tenant, conn, token, email } : null;
}

import { randomBytes } from "node:crypto";
import { createOpportunity } from "@/lib/db/funnel";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { isMailAddress } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CaptureError extends Error {}

/** The shape of the end of the address of a form: 16 random bytes in base64url. */
export const CAPTURE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** What the visitor agrees to. Kept with each answer as it was read. */
export const captureConsent = (company: string) => `Concordo que ${company} use os dados acima para entrar em contato comigo sobre este pedido.`;

/** How many answers one network address may send to a form in an hour, and a form may take in a day. */
export const CAPTURE_PER_ADDRESS_HOUR = 5;
export const CAPTURE_PER_FORM_DAY = 300;

export type CaptureForm = { id: number; name: string; title: string; intro: string | null; token: string; ownerEmail: string; ownerName: string; active: boolean; answers: number };
export type CaptureFormInput = { name: string; title: string; intro: string | null; ownerEmail: string; active: boolean };

const COLUMNS = "f.id, f.name, f.title, f.intro, f.token, f.owner_email, f.owner_name, f.active, (SELECT count(*) FROM capture_submissions p WHERE p.form_id = f.id) AS answers";

function toForm(row: Record<string, unknown>): CaptureForm {
  return {
    id: Number(row.id), name: String(row.name), title: String(row.title), intro: row.intro === null ? null : String(row.intro), token: String(row.token),
    ownerEmail: String(row.owner_email), ownerName: String(row.owner_name), active: Boolean(row.active), answers: Number(row.answers),
  };
}

export async function listCaptureForms(conn: Queryable): Promise<CaptureForm[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM capture_forms f ORDER BY lower(f.name), f.id`);
  return rows.map(toForm);
}

/** The form an address opens: only one that is on. */
export async function findCaptureForm(token: string, conn: Queryable): Promise<CaptureForm | null> {
  if (!CAPTURE_TOKEN.test(token)) return null;
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM capture_forms f WHERE f.token = $1 AND f.active`, [token]);
  return rows[0] ? toForm(rows[0]) : null;
}

const NOT_FOUND = "Formulário não encontrado. Recarregue a página.";

/** Creates a form, with an address of its own, or changes the one with `id`. Who receives has to be an active user of the company. */
export async function saveCaptureForm(id: number | null, input: CaptureFormInput, who: string, conn: Queryable): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const title = input.title.trim().replace(/\s+/g, " ");
  const intro = input.intro?.replace(/\r\n?/g, "\n").trim() || null;
  const problems: string[] = [];
  if (name.length < 2 || name.length > 60) problems.push("Nome do formulário: de 2 a 60 letras.");
  if (title.length < 2 || title.length > 100) problems.push("Título da página: de 2 a 100 letras.");
  if (intro !== null && intro.length > 600) problems.push("Texto de abertura: até 600 letras.");
  const owner = await conn.query("SELECT email, name FROM users WHERE email = $1 AND active", [input.ownerEmail.trim().toLowerCase()]);
  if (owner.rows.length === 0) problems.push("Escolha quem recebe as oportunidades: uma pessoa ativa da equipe.");
  if (problems.length > 0) throw new CaptureError(problems.join(" "));
  const values = [name, title, intro, String(owner.rows[0].email), String(owner.rows[0].name), input.active, who];
  try {
    const { rows } = id === null
      ? await conn.query("INSERT INTO capture_forms (name, title, intro, owner_email, owner_name, active, updated_by, token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id", [...values, randomBytes(16).toString("base64url")])
      : await conn.query("UPDATE capture_forms SET name = $2, title = $3, intro = $4, owner_email = $5, owner_name = $6, active = $7, updated_at = now(), updated_by = $8 WHERE id = $1 RETURNING id", [id, ...values]);
    if (rows.length === 0) throw new CaptureError(NOT_FOUND);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new CaptureError("Já existe um formulário com esse nome.");
    throw error;
  }
}

/** Removes a form and the record of its answers. The opportunities it created stay in the funnel. */
export async function deleteCaptureForm(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id FROM capture_forms WHERE id = $1),
          answered AS (DELETE FROM capture_submissions p USING target WHERE p.form_id = target.id)
     DELETE FROM capture_forms f USING target WHERE f.id = target.id RETURNING f.id`,
    [id],
  );
  if (rows.length === 0) throw new CaptureError(NOT_FOUND);
}

export type CaptureAnswer = { name: string; company: string; email: string; phone: string; message: string; agreed: boolean };

/**
 * One answer of a visitor: becomes an opportunity in the first stage of the
 * funnel, of the person the form names, with the record of what was agreed.
 * Returns the id of the opportunity, or `null` when the same address had
 * already answered this form in the last day: then nothing new is created and
 * the visitor is thanked all the same.
 */
export async function submitCapture(form: CaptureForm, answer: CaptureAnswer, company: string, ip: string | null, now: Date, conn: Queryable): Promise<number | null> {
  const name = answer.name.trim().replace(/\s+/g, " ");
  const firm = answer.company.trim().replace(/\s+/g, " ");
  const email = answer.email.trim().toLowerCase();
  const phone = answer.phone.trim();
  const message = answer.message.replace(/\r\n?/g, "\n").trim();
  const problems: string[] = [];
  if (name.length < 2 || name.length > 120) problems.push("Informe o seu nome.");
  if (firm.length > 120) problems.push("Nome da empresa: até 120 letras.");
  if (!isMailAddress(email)) problems.push("Informe um e-mail válido.");
  if (phone !== "" && !/^[0-9 ()+.-]{8,25}$/.test(phone)) problems.push("Telefone inválido.");
  if (message.length > 2000) problems.push("Mensagem: até 2.000 letras.");
  if (!answer.agreed) problems.push("Marque que concorda com o uso dos dados para o contato.");
  if (problems.length > 0) throw new CaptureError(problems.join(" "));

  const load = await conn.query(
    `SELECT count(*) FILTER (WHERE created_at > $2::timestamptz - interval '24 hours') AS day,
            count(*) FILTER (WHERE ip = $3 AND created_at > $2::timestamptz - interval '1 hour') AS address,
            count(*) FILTER (WHERE email = $4 AND created_at > $2::timestamptz - interval '24 hours') AS same
       FROM capture_submissions WHERE form_id = $1`,
    [form.id, now, ip, email],
  );
  if (Number(load.rows[0].address) >= CAPTURE_PER_ADDRESS_HOUR || Number(load.rows[0].day) >= CAPTURE_PER_FORM_DAY) throw new CaptureError("Muitos envios em pouco tempo. Tente de novo mais tarde.");
  if (Number(load.rows[0].same) > 0) return null;

  const id = await createOpportunity(
    {
      title: `Contato pelo formulário: ${firm || name}`.slice(0, 120), customerId: null, company: firm.length >= 2 ? firm : name, contactName: name, phone: phone || null, email,
      source: `Formulário: ${form.name}`.slice(0, 80), estimatedValue: null, notes: message || null,
    },
    { email: form.ownerEmail, name: form.ownerName },
    conn,
  );
  await conn.query("INSERT INTO capture_submissions (form_id, opportunity_id, email, consent, ip, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [form.id, id, email, captureConsent(company), ip, now]);
  return id;
}

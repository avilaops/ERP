import { isValidCnpj, normalizeDocument } from "@/lib/customer";
import type { Queryable } from "@/lib/db/pool";
import { readCertificate, sealCertificate } from "@/lib/fiscal/certificate";
import type { CertificateInfo } from "@/lib/fiscal/certificate";
import { UFS } from "@/lib/pricing/states";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class FiscalError extends Error {}

/** What the invoice says about who issues it. Every field may be blank until the company fills it in. */
export type FiscalSettings = {
  legalName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  /** 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime normal. */
  taxRegime: 1 | 2 | 3 | null;
  street: string | null;
  streetNumber: string | null;
  district: string | null;
  city: string | null;
  /** IBGE code of the city, seven digits. */
  cityCode: string | null;
  uf: string | null;
  cep: string | null;
  series: number;
  nextNumber: number;
  environment: "homologacao" | "producao";
};

export const TAX_REGIMES = [
  [1, "Simples Nacional"],
  [2, "Simples Nacional, com excesso de sublimite"],
  [3, "Regime normal (Lucro Presumido ou Real)"],
] as const;

const NO_ROW = "Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.";
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);
const digits = (value: string | null) => (value ?? "").replace(/\D/g, "") || null;

export async function loadFiscalSettings(conn: Queryable): Promise<FiscalSettings> {
  const { rows } = await conn.query(
    `SELECT legal_name, cnpj, state_registration, tax_regime, street, street_number, district, city, city_code, uf, cep,
            nfe_series, nfe_next_number, nfe_environment
       FROM company_settings`,
  );
  const row = rows[0];
  if (!row) throw new Error(NO_ROW);
  return {
    legalName: text(row.legal_name),
    cnpj: text(row.cnpj),
    stateRegistration: text(row.state_registration),
    taxRegime: row.tax_regime === null ? null : (Number(row.tax_regime) as 1 | 2 | 3),
    street: text(row.street),
    streetNumber: text(row.street_number),
    district: text(row.district),
    city: text(row.city),
    cityCode: text(row.city_code),
    uf: text(row.uf),
    cep: text(row.cep),
    series: Number(row.nfe_series),
    nextNumber: Number(row.nfe_next_number),
    environment: row.nfe_environment === "producao" ? "producao" : "homologacao",
  };
}

/** What is still missing for an invoice to be issued, in the words of the screen. */
export function missingFiscalData(settings: FiscalSettings): string[] {
  const fields: [keyof FiscalSettings, string][] = [
    ["legalName", "Razão social"], ["cnpj", "CNPJ"], ["stateRegistration", "Inscrição estadual"], ["taxRegime", "Regime tributário"],
    ["street", "Endereço"], ["streetNumber", "Número"], ["district", "Bairro"], ["city", "Cidade"], ["cityCode", "Código IBGE da cidade"], ["uf", "UF"], ["cep", "CEP"],
  ];
  return fields.filter(([key]) => settings[key] === null).map(([, label]) => label);
}

/** Writes the fiscal data. Blank fields are allowed, wrong ones are not. */
export async function saveFiscalSettings(input: FiscalSettings, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando os dados fiscais.");
  // Letters are part of a CNPJ since July 2026 (NT 2026.004): only the punctuation is dropped.
  const cnpj = normalizeDocument(input.cnpj ?? "") || null;
  if (cnpj !== null && !isValidCnpj(cnpj)) throw new FiscalError("CNPJ inválido. Confira os números.");
  const registration = digits(input.stateRegistration);
  if (registration !== null && (registration.length < 2 || registration.length > 14)) throw new FiscalError("Inscrição estadual: só os números, de 2 a 14 dígitos.");
  if (input.taxRegime !== null && ![1, 2, 3].includes(input.taxRegime)) throw new FiscalError("Escolha o regime tributário da lista.");
  const cityCode = digits(input.cityCode);
  if (cityCode !== null && cityCode.length !== 7) throw new FiscalError("Código IBGE da cidade: são 7 dígitos.");
  const uf = blank(input.uf)?.toUpperCase() ?? null;
  if (uf !== null && !(UFS as readonly string[]).includes(uf)) throw new FiscalError("UF: escolha um estado da lista.");
  const cep = digits(input.cep);
  if (cep !== null && cep.length !== 8) throw new FiscalError("CEP: são 8 dígitos.");
  if (!Number.isInteger(input.series) || input.series < 1 || input.series > 999) throw new FiscalError("Série: informe um número inteiro de 1 a 999.");
  if (!Number.isInteger(input.nextNumber) || input.nextNumber < 1 || input.nextNumber > 999999999) {
    throw new FiscalError("Próximo número da nota: informe um número inteiro maior que zero.");
  }
  if (input.environment !== "homologacao" && input.environment !== "producao") throw new FiscalError("Escolha o ambiente da lista.");

  const { rows } = await conn.query(
    `UPDATE company_settings
        SET legal_name = $1, cnpj = $2, state_registration = $3, tax_regime = $4, street = $5, street_number = $6, district = $7,
            city = $8, city_code = $9, uf = $10, cep = $11, nfe_series = $12, nfe_next_number = $13, nfe_environment = $14,
            updated_at = now(), updated_by = $15
      RETURNING id`,
    [
      blank(input.legalName), cnpj, registration, input.taxRegime, blank(input.street), blank(input.streetNumber), blank(input.district),
      blank(input.city), cityCode, uf, cep, input.series, input.nextNumber, input.environment, updatedBy,
    ],
  );
  if (rows.length === 0) throw new Error(NO_ROW);
}

/** The certificate on file, as the screen shows it: who, until when and who sent it. Never the file. */
export type StoredCertificate = CertificateInfo & { uploadedAt: Date; uploadedBy: string };

export async function loadCertificateInfo(conn: Queryable): Promise<StoredCertificate | null> {
  const { rows } = await conn.query(
    "SELECT subject, holder_cnpj, valid_from, valid_until, fingerprint, uploaded_at, uploaded_by FROM fiscal_certificates",
  );
  const row = rows[0];
  if (!row) return null;
  return {
    subject: String(row.subject),
    holderCnpj: text(row.holder_cnpj),
    validFrom: row.valid_from as Date,
    validUntil: row.valid_until as Date,
    fingerprint: String(row.fingerprint),
    uploadedAt: row.uploaded_at as Date,
    uploadedBy: String(row.uploaded_by),
  };
}

/**
 * Stores the company's A1 certificate, replacing the one on file. The file is
 * opened first, with the password given: one that does not open, has no private
 * key, is expired, or belongs to another CNPJ than the company's is refused.
 * What goes to the database is sealed with `key`, which is not in the database.
 */
export async function saveCertificate(
  pfx: Uint8Array,
  password: string,
  key: Buffer,
  uploadedBy: string,
  now: Date,
  conn: Queryable,
): Promise<CertificateInfo> {
  if (uploadedBy.trim() === "") throw new Error("Falta dizer quem está enviando o certificado.");
  const info = readCertificate(pfx, password);
  if (info.validUntil.getTime() <= now.getTime()) throw new FiscalError("Este certificado já venceu. Envie o certificado em vigor.");
  if (info.validFrom.getTime() > now.getTime()) throw new FiscalError("Este certificado ainda não começou a valer.");
  const { cnpj } = await loadFiscalSettings(conn);
  if (cnpj !== null && info.holderCnpj !== null && cnpj !== info.holderCnpj) {
    throw new FiscalError("O CNPJ deste certificado não é o da empresa cadastrada nos dados fiscais.");
  }

  const sealed = sealCertificate(pfx, password, key);
  await conn.query(
    `INSERT INTO fiscal_certificates (id, ciphertext, iv, auth_tag, subject, holder_cnpj, valid_from, valid_until, fingerprint, uploaded_by)
     VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag, subject = EXCLUDED.subject,
            holder_cnpj = EXCLUDED.holder_cnpj, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
            fingerprint = EXCLUDED.fingerprint, uploaded_at = now(), uploaded_by = EXCLUDED.uploaded_by`,
    [sealed.ciphertext, sealed.iv, sealed.authTag, info.subject, info.holderCnpj, info.validFrom, info.validUntil, info.fingerprint, uploadedBy],
  );
  return info;
}

/** The certificate as it is stored, sealed. Opening it takes the key of the vault, which is not in the database. */
export async function loadSealedCertificate(conn: Queryable): Promise<{ ciphertext: Buffer; iv: Buffer; authTag: Buffer; validUntil: Date } | null> {
  const { rows } = await conn.query("SELECT ciphertext, iv, auth_tag, valid_until FROM fiscal_certificates");
  const row = rows[0];
  if (!row) return null;
  return { ciphertext: row.ciphertext as Buffer, iv: row.iv as Buffer, authTag: row.auth_tag as Buffer, validUntil: row.valid_until as Date };
}

/** Takes the certificate off the system. Without it no invoice is signed. */
export async function removeCertificate(conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("DELETE FROM fiscal_certificates RETURNING id");
  return rows.length > 0;
}

/** The fiscal data of one equipment. */
export type ProductFiscal = { ncm: string | null; origin: number | null; cest: string | null; unit: string };

export const PRODUCT_ORIGINS = [
  [0, "0 · Nacional"],
  [1, "1 · Estrangeira, importação direta"],
  [2, "2 · Estrangeira, adquirida no mercado interno"],
  [3, "3 · Nacional, com conteúdo de importação acima de 40%"],
  [4, "4 · Nacional, conforme processos produtivos básicos"],
  [5, "5 · Nacional, com conteúdo de importação até 40%"],
  [6, "6 · Estrangeira, importação direta, sem similar nacional"],
  [7, "7 · Estrangeira, mercado interno, sem similar nacional"],
  [8, "8 · Nacional, com conteúdo de importação acima de 70%"],
] as const;

export async function loadProductFiscal(productId: number, conn: Queryable): Promise<ProductFiscal | null> {
  const { rows } = await conn.query("SELECT ncm, origin, cest, unit FROM products WHERE id = $1", [productId]);
  const row = rows[0];
  if (!row) return null;
  return { ncm: text(row.ncm), origin: row.origin === null ? null : Number(row.origin), cest: text(row.cest), unit: String(row.unit) };
}

export async function saveProductFiscal(productId: number, input: ProductFiscal, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando os dados fiscais do equipamento.");
  const ncm = digits(input.ncm);
  if (ncm !== null && ncm.length !== 8) throw new FiscalError("NCM: são 8 dígitos.");
  if (input.origin !== null && (!Number.isInteger(input.origin) || input.origin < 0 || input.origin > 8)) throw new FiscalError("Origem: escolha da lista.");
  const cest = digits(input.cest);
  if (cest !== null && cest.length !== 7) throw new FiscalError("CEST: são 7 dígitos.");
  const unit = input.unit.trim().toUpperCase() || "UN";
  if (!/^[A-Z0-9]{1,6}$/.test(unit)) throw new FiscalError("Unidade: até 6 letras ou números (ex.: UN, PC, CJ).");
  const { rows } = await conn.query(
    "UPDATE products SET ncm = $2, origin = $3, cest = $4, unit = $5, updated_at = now(), updated_by = $6 WHERE id = $1 RETURNING id",
    [productId, ncm, input.origin, cest, unit, updatedBy],
  );
  if (rows.length === 0) throw new FiscalError("Equipamento não encontrado.");
}

/** From which date of issue the DANFE is printed in the layout of the tax reform (NT 2026.010). `AAAA-MM-DD`. */
export async function loadDanfeReformDate(conn: Queryable): Promise<string> {
  const { rows } = await conn.query("SELECT nfe_danfe_reform_from::text AS day FROM company_settings");
  return String(rows[0]?.day ?? "2026-12-01");
}

export async function saveDanfeReformDate(day: string, updatedBy: string, conn: Queryable): Promise<void> {
  const date = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day || day < "2026-01-01" || day > "2099-12-31") {
    throw new FiscalError("Data do DANFE da reforma: informe uma data válida, de 2026 em diante.");
  }
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando.");
  await conn.query("UPDATE company_settings SET nfe_danfe_reform_from = $1::date", [day]);
}

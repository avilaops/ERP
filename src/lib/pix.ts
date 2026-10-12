import { isValidCnpj, isValidCpf } from "@/lib/customer";

/**
 * The "PIX copia e cola" of a charge: the BR Code of the Central Bank (EMV
 * merchant-presented QR), static, with the key of the company, the amount and
 * an identifier. No bank is called: the code only says where the money goes,
 * and the receipt is still recorded by hand when it arrives.
 */
export type PixKey = { kind: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria"; key: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The key as the banks expect it, or `null` when what was typed is none of the five kinds. */
export function pixKey(typed: string): PixKey | null {
  const text = typed.trim();
  if (UUID.test(text.toLowerCase())) return { kind: "aleatoria", key: text.toLowerCase() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 77) return { kind: "email", key: text.toLowerCase() };
  // A phone is written with the country: `+5517999990000`. Typed without it, a mobile or a landline of Brazil gets the +55.
  if (/^\+\d{12,14}$/.test(text.replace(/[\s().-]/g, ""))) return { kind: "telefone", key: text.replace(/[\s().-]/g, "") };
  const digits = text.replace(/[\s./()-]/g, "");
  // Eleven digits may be a CPF or a mobile: the way it was typed says which, and a CPF has to be a valid one.
  const likeCpf = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(text);
  const likePhone = /^\(\d{2}\)/.test(text);
  if (!likePhone && /^\d{11}$/.test(digits) && isValidCpf(digits)) return { kind: "cpf", key: digits };
  if (/^[0-9A-Z]{12}\d{2}$/.test(digits.toUpperCase()) && isValidCnpj(digits.toUpperCase())) return { kind: "cnpj", key: digits.toUpperCase() };
  if (!likeCpf && /^[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digits)) return { kind: "telefone", key: `+55${digits}` };
  return null;
}

/** Letters without accents and what the code accepts in a name: the banks reject anything else. */
export const pixText = (text: string, max: number) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** CRC-16/CCITT-FALSE, in four hexadecimal digits, as the BR Code asks. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

export type PixCharge = { key: string; name: string; city: string; /** In reais; `null` leaves the payer to type it. */ amount: number | null; /** Letters and digits, up to 25. */ identifier: string | null };

export function pixCode(charge: PixCharge): string {
  const identifier = (charge.identifier ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body =
    field("00", "01") +
    field("26", field("00", "br.gov.bcb.pix") + field("01", charge.key)) +
    field("52", "0000") +
    field("53", "986") +
    (charge.amount !== null && charge.amount > 0 ? field("54", charge.amount.toFixed(2)) : "") +
    field("58", "BR") +
    field("59", pixText(charge.name, 25)) +
    field("60", pixText(charge.city, 15)) +
    field("62", field("05", identifier)) +
    "6304";
  return body + crc16(body);
}

/** The four ERP profiles. They are decided inside the ERP, never by the SSO `papel`. */
export const ROLES = ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR", "FINANCEIRO"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  DIRETORIA: "Diretoria",
  GERENTE_COMERCIAL: "Gerente comercial",
  VENDEDOR: "Vendedor",
  FINANCEIRO: "Financeiro",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

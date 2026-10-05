export type DbEnv = Record<string, string | undefined>;

/** The only connection variable of the system. Tests read ERP_TEST_DATABASE_URL instead. */
export const DATABASE_URL_VAR = "DATABASE_URL";

function isPostgresUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    return (protocol === "postgres:" || protocol === "postgresql:") && hostname !== "";
  } catch {
    return false;
  }
}

/** The connection string, or an error naming the variable. Never echoes the value: it holds a password. */
export function databaseUrl(env: DbEnv): string {
  const raw = env[DATABASE_URL_VAR]?.trim() ?? "";
  if (raw === "") throw new Error(`${DATABASE_URL_VAR} ausente`);
  if (!isPostgresUrl(raw)) {
    throw new Error(`${DATABASE_URL_VAR} inválida (esperado postgres://… ou postgresql://…)`);
  }
  return raw;
}

/** Fail closed: production does not start without a database to talk to. */
export function assertDatabaseConfig(env: DbEnv): void {
  if (env.NODE_ENV === "production") databaseUrl(env);
}

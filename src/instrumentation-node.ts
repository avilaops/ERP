import { assertAuthConfig, isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import { assertDatabaseConfig } from "@/lib/db/config";

/** Every start-up problem at once, so one failed boot shows all that is missing. */
export function startupProblems(env: AuthEnv): string[] {
  if (!isProduction(env)) return [];
  const problems: string[] = [];
  for (const check of [assertAuthConfig, assertDatabaseConfig]) {
    try {
      check(env);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems;
}

/**
 * Next logs an error thrown in `register()` but keeps the process up answering
 * 500, which a process manager reads as "running". Exiting makes the failure
 * visible; the message names every variable that is missing or invalid.
 */
export function assertConfigOrExit(env: AuthEnv): void {
  const problems = startupProblems(env);
  if (problems.length === 0) return;
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

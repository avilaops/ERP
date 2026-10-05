import { assertAuthConfig, isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";

/**
 * Next logs an error thrown in `register()` but keeps the process up answering
 * 500, which a process manager reads as "running". Exiting makes the failure
 * visible; the message names every variable that is missing or invalid.
 */
export function assertAuthConfigOrExit(env: AuthEnv): void {
  if (!isProduction(env)) return;
  try {
    assertAuthConfig(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

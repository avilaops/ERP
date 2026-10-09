/**
 * Fail closed: production does not start without a valid login configuration
 * and a database to talk to. The check lives in a Node-only module, loaded
 * only by the Node server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertConfigOrExit } = await import("@/instrumentation-node");
    assertConfigOrExit(process.env);
    // The routines of the companies (reminders, cadences, notices) run only on the production server.
    const { isProduction } = await import("@/lib/auth/config");
    if (isProduction(process.env)) {
      const { startBackground } = await import("@/lib/background");
      startBackground(process.env);
    }
  }
}

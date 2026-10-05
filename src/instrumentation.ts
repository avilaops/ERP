/**
 * Fail closed: production does not start without a valid login configuration
 * and a database to talk to. The check lives in a Node-only module, loaded
 * only by the Node server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertConfigOrExit } = await import("@/instrumentation-node");
    assertConfigOrExit(process.env);
  }
}

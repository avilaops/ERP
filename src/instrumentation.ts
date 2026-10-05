/**
 * Fail closed: production does not start without a valid login configuration.
 * The check lives in a Node-only module, loaded only by the Node server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertAuthConfigOrExit } = await import("@/instrumentation-node");
    assertAuthConfigOrExit(process.env);
  }
}

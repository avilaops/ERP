/**
 * What the deploy checks after starting the container: the process answers, and
 * with the revision that was just sent. Public on purpose and with nothing to
 * hide: no company, no configuration, no database.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, commit: process.env.GIT_SHA ?? "dev", builtAt: process.env.BUILT_AT ?? null });
}

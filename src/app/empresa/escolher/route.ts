import { cookies } from "next/headers";
import { listCompanies, TENANT_COOKIE } from "@/lib/auth";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";

/**
 * Remembers which company to work in. The value is only accepted when it is one
 * of the companies the signed-in person belongs to; on every request the choice
 * is checked again against the directory, so the cookie alone opens nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const asked = (await request.formData()).get("tenant");
  const companies = await listCompanies();
  const chosen = companies.find((company) => company.slug === asked);
  if (!chosen) return new Response("Empresa inválida", { status: 400 });

  const store = await cookies();
  store.set(TENANT_COOKIE, chosen.slug, { httpOnly: true, sameSite: "lax", path: "/" });

  // The local sign-in (development only) carries the company in its own cookie.
  const local = localProvider(process.env);
  if (local.available) {
    const user = local.userFromCookie(store.get(LOCAL_COOKIE)?.value);
    if (user) store.set(LOCAL_COOKIE, `${user.role}@${chosen.slug}`, { httpOnly: true, sameSite: "lax", path: "/" });
  }

  return new Response(null, { status: 303, headers: { Location: "/" } });
}

import { cookies } from "next/headers";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";
import { tenantForHost } from "@/lib/auth/tenants";

/** Writes the local sign-in cookie. Without the local provider (see `isLocalProviderEnabled`) it does not exist. */
export async function POST(request: Request): Promise<Response> {
  const provider = localProvider(process.env);
  if (!provider.available) return new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  // `PERFIL` or `PERFIL@empresa`: the provider checks both against what is configured.
  const value = [text("role"), text("tenant")].filter(Boolean).join("@");
  // On a company's own domain the sign-in is for that company, whatever was asked.
  const hostTenant = tenantForHost(provider.tenants, request.headers.get("host"));
  const user = provider.userFromCookie(value, hostTenant);
  if (!user) return new Response("Perfil ou empresa inválidos", { status: 400 });

  const store = await cookies();
  store.set(LOCAL_COOKIE, `${user.role}@${user.tenant.slug}`, { httpOnly: true, sameSite: "lax", path: "/" });

  return new Response(null, { status: 303, headers: { Location: "/" } });
}

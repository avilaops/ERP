import { cookies } from "next/headers";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";

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
  const user = provider.userFromCookie(value);
  if (!user) return new Response("Perfil ou empresa inválidos", { status: 400 });

  const store = await cookies();
  store.set(LOCAL_COOKIE, `${user.role}@${user.tenant.slug}`, { httpOnly: true, sameSite: "lax", path: "/" });

  return new Response(null, { status: 303, headers: { Location: "/" } });
}

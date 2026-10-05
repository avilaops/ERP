import { cookies } from "next/headers";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";

/** Writes the local sign-in cookie. Without the local provider (see `isLocalProviderEnabled`) it does not exist. */
export async function POST(request: Request): Promise<Response> {
  const provider = localProvider(process.env);
  if (!provider.available) return new Response("Not Found", { status: 404 });

  const role = (await request.formData()).get("role");
  const user = provider.userFromCookie(typeof role === "string" ? role : undefined);
  if (!user) return new Response("Perfil inválido", { status: 400 });

  const store = await cookies();
  store.set(LOCAL_COOKIE, user.role, { httpOnly: true, sameSite: "lax", path: "/" });

  return new Response(null, { status: 303, headers: { Location: "/" } });
}

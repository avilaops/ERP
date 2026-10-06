import { redirect } from "next/navigation";
import { getSession, requirePermission } from "@/lib/auth";
import { menuOf } from "@/lib/auth/permissions";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect(menuOf(session)[0].href);

  // No session: this never allows, it sends to the login or to "sem acesso".
  await requirePermission("dashboard", "/");
  redirect("/sem-acesso");
}

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("aprovacoes").label} · ERP Ludus` };

export default async function AprovacoesPage() {
  await requirePermission("aprovacoes");
  return <PlaceholderPage title={menuItem("aprovacoes").label} />;
}

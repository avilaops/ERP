import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("tabela-precos").label} · ERP Ludus` };

export default async function TabelaPrecosPage() {
  await requirePermission("tabela-precos");
  return <PlaceholderPage title={menuItem("tabela-precos").label} />;
}

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("clientes").label} · ERP Ludus` };

export default async function ClientesPage() {
  await requirePermission("clientes");
  return <PlaceholderPage title={menuItem("clientes").label} />;
}

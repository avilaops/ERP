import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("pedidos").label} · ERP Ludus` };

export default async function PedidosPage() {
  await requirePermission("pedidos");
  return <PlaceholderPage title={menuItem("pedidos").label} />;
}

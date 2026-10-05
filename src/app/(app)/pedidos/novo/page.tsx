import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Novo pedido · ERP Ludus" };

export default async function NovoPedidoPage() {
  await requirePermission("pedidos", "/pedidos/novo");
  return <PlaceholderPage title="Novo pedido" />;
}

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("produtos").label} · ERP Ludus` };

export default async function ProdutosPage() {
  await requirePermission("produtos");
  return <PlaceholderPage title={menuItem("produtos").label} />;
}

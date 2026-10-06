import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("fornecedores").label} · ERP` };

export default async function FornecedoresPage() {
  await requirePermission("fornecedores");
  return <PlaceholderPage title={menuItem("fornecedores").label} />;
}

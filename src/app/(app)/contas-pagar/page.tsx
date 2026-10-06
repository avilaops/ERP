import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("contas-pagar").label} · ERP` };

export default async function ContasPagarPage() {
  await requirePermission("contas-pagar");
  return <PlaceholderPage title={menuItem("contas-pagar").label} />;
}

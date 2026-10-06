import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("comissoes").label} · ERP` };

export default async function ComissoesPage() {
  await requirePermission("comissoes");
  return <PlaceholderPage title={menuItem("comissoes").label} />;
}

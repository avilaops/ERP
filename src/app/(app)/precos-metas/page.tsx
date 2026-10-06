import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("precos-metas").label} · ERP` };

export default async function PrecosMetasPage() {
  await requirePermission("precos-metas");
  return <PlaceholderPage title={menuItem("precos-metas").label} />;
}

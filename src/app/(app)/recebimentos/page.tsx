import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("recebimentos").label} · ERP Ludus` };

export default async function RecebimentosPage() {
  await requirePermission("recebimentos");
  return <PlaceholderPage title={menuItem("recebimentos").label} />;
}

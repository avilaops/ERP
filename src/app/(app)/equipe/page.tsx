import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("equipe").label} · ERP` };

export default async function EquipePage() {
  await requirePermission("equipe");
  return <PlaceholderPage title={menuItem("equipe").label} />;
}

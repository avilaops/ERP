import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("simulador").label} · ERP Ludus` };

export default async function SimuladorPage() {
  await requirePermission("simulador");
  return <PlaceholderPage title={menuItem("simulador").label} />;
}

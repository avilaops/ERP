import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("dashboard").label} · ERP Ludus` };

export default async function DashboardPage() {
  await requirePermission("dashboard");
  return <PlaceholderPage title={menuItem("dashboard").label} />;
}

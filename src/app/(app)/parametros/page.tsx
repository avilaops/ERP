import { PlaceholderPage } from "@/components/PlaceholderPage";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";

export const metadata = { title: `${menuItem("parametros").label} · ERP Ludus` };

export default async function ParametrosPage() {
  await requirePermission("parametros");
  return <PlaceholderPage title={menuItem("parametros").label} />;
}

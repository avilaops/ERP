import { requirePermission } from "@/lib/auth";
import PublicacaoPage, { metadata } from "../../produtos/publicacao/page";

export { metadata };
export const dynamic = "force-dynamic";

export default async function CustosPublicacaoPage(props: Parameters<typeof PublicacaoPage>[0]) {
  await requirePermission("custos");
  return PublicacaoPage(props);
}

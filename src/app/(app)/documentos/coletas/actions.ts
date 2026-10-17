"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { retryDocumentJob } from "@/lib/db/documents";

export async function retryAction(formData: FormData): Promise<void> {
  const session = await requirePermission("documentos");
  if (session.role !== "DIRETORIA") throw new Error("Somente a diretoria gerencia coletas.");
  await retryDocumentJob(String(formData.get("id") ?? ""), tenantDb(session.tenant.slug));
  revalidatePath("/documentos/coletas");
}

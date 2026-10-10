import { json, preflight, protectedResource } from "@/lib/mcp/http";

/** Where an assistant learns who gives the keys of the ERP. The same answer with or without the path of the resource after it. */
export function GET(): Response {
  return json(protectedResource());
}

export function OPTIONS(): Response {
  return preflight();
}

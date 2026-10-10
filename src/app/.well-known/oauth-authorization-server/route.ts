import { authorizationServer, json, preflight } from "@/lib/mcp/http";

/** How an application asks a person of the ERP for access. */
export function GET(): Response {
  return json(authorizationServer());
}

export function OPTIONS(): Response {
  return preflight();
}

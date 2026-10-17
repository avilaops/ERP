import type { Session } from "@/lib/auth/access";
import type { MenuItemKey } from "@/lib/auth/permissions";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the assistant can explain to the person. */
export class ToolError extends Error {}
export type Schema = { type: "object"; properties: Record<string, { type: string; description: string; enum?: string[] }>; required?: string[]; additionalProperties: false };
export type Tool = {
  name: string;
  title: string;
  description: string;
  item: MenuItemKey;
  writes?: boolean;
  available?(session: Session): boolean;
  inputSchema: Schema;
  run(session: Session, conn: Queryable, args: Record<string, unknown>): Promise<unknown>;
};

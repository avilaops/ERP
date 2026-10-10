import type { DirectoryUser } from "@/lib/auth/directory";
import { allows, menuFor } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

export type Session = {
  email: string;
  name: string;
  role: Role;
  /** The screens left to this person inside the profile; `null` is all of the profile's. */
  items: string[] | null;
  /** The powers of the type that the person's profile of the company gave up. Empty for the four types as they are. */
  denied: string[];
  /** Name of the profile of the company the person has, or `null` for one of the four types. */
  profile: string | null;
  /** The company this request is for. Every read and write of the request happens in its database. */
  tenant: { slug: string; name: string };
  /** How many companies the person belongs to: with more than one they may switch. */
  companies: number;
};

/** What we know about the visitor before looking at any permission. */
export type Identity = {
  /** Proved who they are (valid central auth token, or local sign-in in dev). */
  authenticated: boolean;
  /** Their ERP user in the company of this request, when the e-mail belongs to it. */
  user: DirectoryUser | null;
  /** How many companies the e-mail belongs to. */
  companies?: number;
  /** Name from the sign-in, preferred over the directory's. */
  displayName?: string;
};

export type AccessDecision =
  | { kind: "allow"; session: Session }
  | { kind: "login" }
  | { kind: "no-access" };

export function sessionFrom(identity: Identity): Session | null {
  if (!identity.authenticated || !identity.user) return null;
  const { email, name, role, tenant, items, denied, profile, off } = identity.user;
  // A module the company turned off leaves the screens of everyone, whatever the profile says.
  const left = off?.length ? (items ?? menuFor(role).map((item) => item.key)).filter((key) => !off.includes(key)) : (items ?? null);
  return {
    email,
    name: identity.displayName ?? name,
    role,
    items: left,
    denied: denied ?? [],
    profile: profile ?? null,
    tenant: { slug: tenant.slug, name: tenant.name },
    companies: identity.companies ?? 1,
  };
}

/**
 * The whole access rule, with no I/O: not signed in goes to the login; signed
 * in but unknown to the ERP, or without the item, goes to "sem acesso".
 */
export function decideAccess(identity: Identity, item: MenuItemKey): AccessDecision {
  if (!identity.authenticated) return { kind: "login" };
  const session = sessionFrom(identity);
  if (!session || !allows(session, item)) return { kind: "no-access" };
  return { kind: "allow", session };
}

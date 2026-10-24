import type { ReactNode } from "react";

/** All parts of one order remain visible on the same page. */
export function OrderParts({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

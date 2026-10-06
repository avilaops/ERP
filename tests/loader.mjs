/**
 * Test resolver. Two translations on top of the command-line one:
 *
 * 1. `next/headers` only exists inside the Next server. The stand-in reads and
 *    writes cookies in `globalThis.__TEST_COOKIES__` (a Map), so a test decides
 *    which cookies the "request" carries.
 * 2. `next/navigation`: `redirect()` and `notFound()` throw in Next; here they
 *    throw a plain object the test can inspect.
 *
 * Everything else, including the `@/…` alias, is left to `scripts/loader.mjs`,
 * so the rule lives in one place.
 */
import { resolve as resolveAlias } from "../scripts/loader.mjs";

const inline = (source) => "data:text/javascript," + encodeURIComponent(source);

const HEADERS_STUB = inline(`
  const jar = () => (globalThis.__TEST_COOKIES__ ??= new Map());
  export const cookies = async () => ({
    get: (name) => (jar().has(name) ? { name, value: jar().get(name) } : undefined),
    set: (name, value) => void jar().set(name, value),
    delete: (name) => void jar().delete(name),
  });
  export const headers = async () => new Map();
`);

const NAVIGATION_STUB = inline(`
  export const redirect = (url) => { throw { redirect: url }; };
  export const notFound = () => { throw { notFound: true }; };
`);

export function resolve(specifier, context, next) {
  if (specifier === "next/headers") return { url: HEADERS_STUB, shortCircuit: true };
  if (specifier === "next/navigation") return { url: NAVIGATION_STUB, shortCircuit: true };
  return resolveAlias(specifier, context, next);
}

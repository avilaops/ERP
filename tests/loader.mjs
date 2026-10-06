/**
 * Test resolver. Three translations Node does not do by itself:
 *
 * 1. `@/…` is the tsconfig alias for `src/…`.
 * 2. `next/headers` only exists inside the Next server. The stand-in reads and
 *    writes cookies in `globalThis.__TEST_COOKIES__` (a Map), so a test decides
 *    which cookies the "request" carries; headers come from
 *    `globalThis.__TEST_HEADERS__` the same way.
 * 3. `next/navigation`: `redirect()` and `notFound()` throw in Next; here they
 *    throw a plain object the test can inspect.
 */
const ROOT = new URL("../src/", import.meta.url).href;

const inline = (source) => "data:text/javascript," + encodeURIComponent(source);

const HEADERS_STUB = inline(`
  const jar = () => (globalThis.__TEST_COOKIES__ ??= new Map());
  export const cookies = async () => ({
    get: (name) => (jar().has(name) ? { name, value: jar().get(name) } : undefined),
    set: (name, value) => void jar().set(name, value),
    delete: (name) => void jar().delete(name),
  });
  export const headers = async () => (globalThis.__TEST_HEADERS__ ??= new Map());
`);

const NAVIGATION_STUB = inline(`
  export const redirect = (url) => { throw { redirect: url }; };
  export const notFound = () => { throw { notFound: true }; };
`);

export function resolve(specifier, context, next) {
  if (specifier === "next/headers") return { url: HEADERS_STUB, shortCircuit: true };
  if (specifier === "next/navigation") return { url: NAVIGATION_STUB, shortCircuit: true };
  if (specifier.startsWith("@/")) return next(ROOT + specifier.slice(2) + ".ts", context);
  return next(specifier, context);
}

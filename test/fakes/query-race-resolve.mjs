import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const fake = new URL("./queryRace.ts", import.meta.url).href;
const root = new URL("../../", import.meta.url);
const mocks = new Set(["react", "@/lib/supabase/client", "@/lib/clientErrors", "@/lib/loadErrors"]);
export async function resolve(specifier, context, nextResolve) {
  if (mocks.has(specifier)) return { url: fake, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const url = new URL(`src/${specifier.slice(2)}.ts`, root);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

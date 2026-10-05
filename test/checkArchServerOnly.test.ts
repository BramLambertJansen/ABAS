import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const gate = resolve("scripts/check-arch.mjs");
const baseline: Record<string, string> = {
  "src/lib/supabase/admin.ts": 'import "server-only"; export const f = 1;',
  "src/lib/supabase/server.ts": 'import "server-only";',
  "src/lib/supabase/portalServer.ts": 'import "server-only";',
  "src/lib/barLogin.ts": 'import { f } from "@/lib/supabase/admin"; export { f };',
  "src/lib/barLoginTypes.ts": 'export const y = 1;',
  "src/features/x/Ok.tsx": '"use client"; import type { T } from "@/lib/barLogin"; import { y } from "@/lib/barLoginTypes";',
};
function check(changes: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), "abas-arch-"));
  try {
    for (const [name, source] of Object.entries({ ...baseline, ...changes })) {
      if (source === null) continue;
      const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, source);
    }
    return spawnSync(process.execPath, [gate], { cwd: root, encoding: "utf8", timeout: 10000 });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("server-only gate allows server usage, type-only imports and comments", () => {
  const result = check({ "src/features/x/I.tsx": '"use client"; // import { f } from "@/lib/barLogin"\n/* require("@/lib/supabase/admin") */' });
  assert.equal(result.status, 0, result.stderr);
});
const imports = [
  ["src/features/x/A.tsx", 'import { f } from "@/lib/barLogin";', "src/lib/barLogin.ts"],
  ["src/components/B.tsx", 'import { f } from "../lib/barLogin.ts";', "src/lib/barLogin.ts"],
  ["src/features/x/D.tsx", 'const m = await import("@/lib/barLogin");', "src/lib/barLogin.ts"],
  ["src/features/x/E.tsx", 'require("@/lib/supabase/server");', "src/lib/supabase/server.ts"],
  ["src/features/x/F.tsx", 'import "@/lib/barLogin";', "src/lib/barLogin.ts"],
  ["src/app/x/G.tsx", '"use client"; import { f } from "@/lib/barLogin";', "src/lib/barLogin.ts"],
  ["src/features/x/H.tsx", 'import { type T, f } from "@/lib/barLogin";', "src/lib/barLogin.ts"],
];
for (const [path, source, via] of imports) test(`server-only gate rejects ${path}`, () => {
  const result = check({ [path]: source });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`${path}: reaches server-only`), result.stderr);
  assert.ok(result.stderr.includes(via), result.stderr);
});
test("server-only gate follows relative reexports, aliases, index files and cycles", () => {
  const result = check({
    "src/lib/reexport/index.ts": 'export * from "../supabase/admin.ts"; export * from "../cycle";',
    "src/lib/cycle.ts": 'export * from "./reexport";',
    "src/hooks/queries/useC.ts": 'import { f } from "@/lib/reexport";',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /useC.ts: reaches server-only src\/lib\/supabase\/admin.ts via src\/lib\/reexport\/index.ts/);
  assert.equal(result.stderr.match(/useC.ts: reaches/g)?.length, 1);
});
test("mandatory marker must be the first statement and the file must exist", () => {
  for (const source of ['export const f = 1;', 'export const f = 1; import "server-only";']) {
    const result = check({ "src/lib/supabase/admin.ts": source });
    assert.equal(result.status, 1); assert.match(result.stderr, /must start with import "server-only"/);
  }
  const missing = check({ "src/lib/supabase/portalServer.ts": null });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /portalServer.ts: required.*missing/);
});
test("gate rejects computed imports and secret reads in unmarked modules", () => {
  for (const source of ['await import(p)', 'require(`template`)', 'import("x", { with: { type: "json" } })']) {
    const result = check({ "src/lib/x.ts": source });
    assert.equal(result.status, 1); assert.match(result.stderr, /non-literal import\(\)\/require\(\)/);
  }
  const secret = check({ "src/lib/y.ts": 'process.env.SUPABASE_SECRET_KEY' });
  assert.equal(secret.status, 1); assert.match(secret.stderr, /SUPABASE_SECRET_KEY may only/);
});
test("type-only reexports do not reach server modules; client-marked modules fail", () => {
  assert.equal(check({ "src/features/x/Types.ts": 'export type { T } from "@/lib/barLogin";' }).status, 0);
  const result = check({ "src/features/x/Marked.ts": 'import "server-only";' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Marked.ts: reaches server-only/);
});

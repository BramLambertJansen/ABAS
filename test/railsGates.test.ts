import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Aanscherpingen uit ADR 0025: check:arch volgt de Supabase-clientmodules op
 * het opgeloste pad (ook relatief), check:policy vangt .from("…")/.rpc() op
 * elke ontvanger. End-to-end tegen een minimale src/-boom, zoals
 * checkArchServerOnly.test.ts.
 */
const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

function run(script: string, tree: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "rails-gates-"));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return spawnSync(process.execPath, [join(SCRIPTS, script)], { cwd: dir, encoding: "utf8" });
}

const BASIS = {
  "src/lib/supabase/admin.ts": 'import "server-only";\nexport const a = 1;\n',
  "src/lib/supabase/server.ts": 'import "server-only";\nexport const s = 1;\n',
  "src/lib/supabase/portalServer.ts": 'import "server-only";\nexport const p = 1;\n',
  "src/lib/supabase/client.ts": "export const createClient = () => 1;\n",
  "src/hooks/queries/useX.ts": 'import { createClient } from "../../lib/supabase/client";\nexport const useX = createClient;\n',
};

test("check:arch: hook in de datalaag mag de client importeren", () => {
  const r = run("check-arch.mjs", BASIS);
  assert.equal(r.status, 0, r.stderr);
});

test("check:arch: feature importeert de client via een relatief pad", () => {
  const r = run("check-arch.mjs", {
    ...BASIS,
    "src/features/x/Db.ts": 'import { createClient } from "../../lib/supabase/client";\nexport const db = createClient;\n',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /src\/lib\/supabase\/client is private to the data layer/);
});

test("check:arch: component importeert de client via de alias", () => {
  const r = run("check-arch.mjs", {
    ...BASIS,
    "src/components/X.tsx": 'import { createClient } from "@/lib/supabase/client";\nexport const X = createClient;\n',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /private to the data layer/);
});

test("check:policy: .from(\"tabel\") op een willekeurige variabele buiten de datalaag", () => {
  const r = run("check-policy.mjs", { "src/features/x/Q.ts": 'export const q = (db: any) => db.from("orders").select();\n' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\.from\("…"\)\/\.rpc\(\) outside/);
});

test("check:policy: admin.rpc( buiten de datalaag", () => {
  const r = run("check-policy.mjs", { "src/features/x/R.ts": 'export const r = (admin: any) => admin.rpc("top_up");\n' });
  assert.equal(r.status, 1);
});

test("check:policy: Array.from en Buffer.from tellen niet", () => {
  const r = run("check-policy.mjs", {
    "src/features/x/A.ts": 'export const a = Array.from(new Set([1]));\nexport const b = Buffer.from("x");\n',
  });
  assert.equal(r.status, 0, r.stderr);
});

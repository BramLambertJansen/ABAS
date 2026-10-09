import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const dirs: string[] = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function check(script: string, files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "framework-bypass-")); dirs.push(dir);
  const tree = { "src/lib/supabase/admin.ts": 'import "server-only";', "src/lib/supabase/server.ts": 'import "server-only";', "src/lib/supabase/portalServer.ts": 'import "server-only";', ...files };
  for (const [file, source] of Object.entries(tree)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), source);
  }
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, `../scripts/${script}.mjs`)], { cwd: dir, encoding: "utf8" });
}
test("relatieve imports respecteren shell- en featuregrenzen", () => {
  const result = check("check-arch", {
    "src/shells/bar/x.ts": 'import "../portal/y";', "src/shells/portal/y.ts": "export const y = 1;",
    "src/features/x.ts": 'import "../shells/bar/x";',
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /shells\/bar must not import/); assert.match(result.stderr, /features\/ must stay shell-agnostic/);
});
for (const bridge of ['export { createClient } from "./supabase/client";', 'import { createClient as client } from "./supabase/client"; export { client };', 'import client = require("./supabase/client"); export { client };', "import * as clients from \"./supabase/client\"; export const createClient = clients.createClient;", "import * as clients from \"./supabase/client\"; export const createClient = clients[\"createClient\"];", "import * as clients from \"./supabase/client\"; export default clients[`createClient`];", "import * as clients from \"./supabase/client\"; const factory = (clients.createClient as typeof clients.createClient); const alias = factory; export { alias };", "import * as clients from \"./supabase/client\"; const { createClient } = clients; export { createClient };", "import clients = require(\"./supabase/client\"); export const createClient = clients.createClient;"]) {
  test(`client-re-export blijft privé: ${bridge}`, () => {
    const result = check("check-arch", {
      "src/lib/supabase/client.ts": "export const createClient = () => 1;", "src/lib/bridge.ts": bridge,
      "src/lib/second.ts": 'export * from "./bridge";', "src/features/x.ts": 'import * as db from "../lib/second";',
      "src/hooks/queries/usePortalX.ts": 'import * as db from "../../lib/second";',
    });
    assert.equal(result.status, 1); assert.match(result.stderr, /re-exported client is private/); assert.match(result.stderr, /cookie isolation/);
  });
}
test("een hook die intern leest is geen client-re-export", () => {
  const result = check("check-arch", { "src/lib/supabase/client.ts": "export const createClient = () => 1;", "src/hooks/queries/useX.ts": 'import { createClient } from "../../lib/supabase/client"; export function useX() { return createClient(); }', "src/features/x.ts": 'import { useX } from "../hooks/queries/useX";' });
  assert.equal(result.status, 0, result.stderr);
});
for (const call of ['db["rpc"](name)', 'db[`rpc`](name)', 'db.from(table)', 'db["storage"]["from"](bucket)']) {
  test(`query buiten datalaag geweigerd: ${call}`, () => {
    const result = check("check-policy", { "src/features/x.ts": `${call};` });
    assert.equal(result.status, 1); assert.match(result.stderr, /outside src\/hooks\/queries/);
  });
}
test("AST telt voorbeeldtekst niet als query en laat Array.from toe", () => {
  const result = check("check-policy", { "src/features/x.ts": 'const example = "db.rpc(name)"; // db.from(table)\nArray.from([1]); Buffer.from("x");' });
  assert.equal(result.status, 0, result.stderr);
});

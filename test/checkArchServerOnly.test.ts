import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `check:arch` → server-only-regels (docs/features/server-only-afscherming.md
 * → Testplan 1, ADR 0021). Draait het echte script end-to-end tegen een
 * minimale `src/`-boom in een tijdelijke map. De fixtures staan hier als
 * strings, niet als bestanden in de repo — anders pakken tsc, lint en
 * check:arch zelf ze op.
 */

const CHECK_ARCH = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-arch.mjs");

const BASE: Record<string, string> = {
  "src/lib/supabase/admin.ts": 'import "server-only";\nexport function createAdminClient() { return 1; }\n',
  "src/lib/supabase/server.ts": 'import "server-only";\nexport async function createClient() { return 1; }\n',
  "src/lib/supabase/portalServer.ts": 'import "server-only";\nexport async function createClient() { return 1; }\n',
  "src/lib/barLogin.ts":
    'import { createAdminClient } from "@/lib/supabase/admin";\nexport type T = number;\nexport function f() { return createAdminClient(); }\n',
  "src/lib/barLoginTypes.ts": "export const y = 1;\n",
  "src/features/x/Ok.tsx":
    '"use client";\nimport type { T } from "@/lib/barLogin";\nimport { y } from "@/lib/barLoginTypes";\nexport const ok: T = y;\n',
};

const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

function runCheckArch(changes: Record<string, string | null>) {
  const dir = mkdtempSync(join(tmpdir(), "check-arch-server-only-"));
  tmpDirs.push(dir);
  const tree: Record<string, string | null> = { ...BASE, ...changes };
  for (const [rel, content] of Object.entries(tree)) {
    if (content === null) continue;
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const r = spawnSync(process.execPath, [CHECK_ARCH], { cwd: dir, encoding: "utf8" });
  return { status: r.status, stderr: r.stderr };
}

function expectFailure(changes: Record<string, string | null>, ...expected: string[]) {
  const { status, stderr } = runCheckArch(changes);
  assert.equal(status, 1, `verwacht exit 1, stderr:\n${stderr}`);
  for (const e of expected) assert.ok(stderr.includes(e), `melding bevat niet "${e}":\n${stderr}`);
}

test("basisboom: type-only import uit een server-only module en losse typesmodule zijn toegestaan", () => {
  const { status, stderr } = runCheckArch({});
  assert.equal(status, 0, stderr);
});

test("1: use client-module bereikt admin.ts via barLogin.ts", () => {
  expectFailure(
    { "src/features/x/A.tsx": '"use client";\nimport { f } from "@/lib/barLogin";\nexport const a = f;\n' },
    "src/features/x/A.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

test("2: module in een clientmap zonder directive, relatieve import met extensie", () => {
  expectFailure(
    { "src/components/B.tsx": 'import { f } from "../lib/barLogin.ts";\nexport const b = f;\n' },
    "B.tsx: reaches server-only src/lib/supabase/admin.ts"
  );
});

test("3: re-export met extensie wordt gevolgd", () => {
  expectFailure(
    {
      "src/lib/reexport.ts": 'export * from "./supabase/admin.ts";\n',
      "src/hooks/queries/useC.ts": 'import { createAdminClient } from "@/lib/reexport";\nexport const c = createAdminClient;\n',
    },
    "useC.ts: reaches server-only src/lib/supabase/admin.ts via src/lib/reexport.ts"
  );
});

test("4: dynamische import", () => {
  expectFailure(
    { "src/features/x/D.tsx": '"use client";\nexport async function d() { const m = await import("@/lib/barLogin"); return m; }\n' },
    "D.tsx: reaches"
  );
});

test("5: require", () => {
  expectFailure(
    { "src/features/x/E.tsx": '"use client";\nexport const e = require("@/lib/supabase/server");\n' },
    "E.tsx: reaches server-only src/lib/supabase/server.ts"
  );
});

test("6: kale side-effect-import", () => {
  expectFailure({ "src/features/x/F.tsx": '"use client";\nimport "@/lib/barLogin";\n' }, "F.tsx: reaches");
});

test("7: use client-bestand buiten de clientmappen", () => {
  expectFailure(
    { "src/app/x/G.tsx": '"use client";\nimport { f } from "@/lib/barLogin";\nexport const g = f;\n' },
    "G.tsx: reaches"
  );
});

test("8: inline type telt niet als type-only", () => {
  expectFailure(
    { "src/features/x/H.tsx": '"use client";\nimport { type T, f } from "@/lib/barLogin";\nexport const h: T = f() as T;\n' },
    "H.tsx: reaches"
  );
});

test("9: verplichte markering ontbreekt", () => {
  expectFailure(
    { "src/lib/supabase/admin.ts": "export function createAdminClient() { return 1; }\n" },
    'src/lib/supabase/admin.ts: must start with import "server-only"'
  );
});

test("9b: markering niet als eerste statement", () => {
  expectFailure(
    {
      "src/lib/supabase/server.ts":
        'export const z = 1;\nimport "server-only";\nexport async function createClient() { return 1; }\n',
    },
    'src/lib/supabase/server.ts: must start with import "server-only"'
  );
});

test("9c: markering na comments en een directive telt als eerste statement", () => {
  const { status, stderr } = runCheckArch({
    "src/lib/supabase/server.ts":
      '// uitleg\n/* meer uitleg */\n"use strict";\nimport "server-only";\nexport async function createClient() { return 1; }\n',
  });
  assert.equal(status, 0, stderr);
});

test("10: verplicht bestand ontbreekt", () => {
  expectFailure(
    { "src/lib/supabase/portalServer.ts": null },
    "src/lib/supabase/portalServer.ts: listed in REQUIRED_SERVER_ONLY but missing"
  );
});

test("11: niet-letterlijke import", () => {
  expectFailure(
    { "src/lib/x.ts": 'export async function x() { const p = "a"; return await import(p); }\n' },
    "non-literal import()/require()"
  );
});

test("12: SUPABASE_SECRET_KEY buiten admin.ts", () => {
  expectFailure({ "src/lib/y.ts": "export const k = process.env.SUPABASE_SECRET_KEY;\n" }, "SUPABASE_SECRET_KEY");
});

test("13: import alleen in een comment telt niet", () => {
  const { status, stderr } = runCheckArch({
    "src/features/x/I.tsx": '"use client";\n// import { f } from "@/lib/barLogin"\nexport const i = 1;\n',
  });
  assert.equal(status, 0, stderr);
});

test("14: type-export zonder puntkomma slokt de volgende echte import niet op", () => {
  expectFailure(
    {
      "src/features/x/J.tsx":
        '"use client"\ntype Q = number\nexport type { Q }\nimport { f } from "@/lib/barLogin"\nexport const j = f\n',
    },
    "J.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

test("15: type-import zonder puntkomma slokt de volgende re-export niet op", () => {
  expectFailure(
    {
      "src/features/x/K.tsx":
        '"use client"\nimport type { T } from "@/lib/barLogin"\nexport type { T }\nexport { f } from "@/lib/barLogin"\n',
    },
    "K.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

test("16: type-export zonder puntkomma, gevolgd door side-effect-import, require en dynamische import", () => {
  expectFailure(
    {
      "src/features/x/L.tsx": '"use client"\ntype Q = number\nexport type { Q }\nimport "@/lib/barLogin"\n',
      "src/features/x/M.tsx":
        '"use client"\ntype Q = number\nexport type { Q }\nexport const m = require("@/lib/barLogin")\n',
      "src/features/x/N.tsx":
        '"use client"\ntype Q = number\nexport type { Q }\nexport const n = () => import("@/lib/barLogin")\n',
    },
    "L.tsx: reaches",
    "M.tsx: reaches",
    "N.tsx: reaches"
  );
});

test("17: map-import met trailing slash en index.js wordt gevolgd", () => {
  expectFailure(
    {
      "src/lib/pkg/index.js": 'export { f } from "../barLogin";\n',
      "src/features/x/O.tsx": '"use client";\nimport { f } from "@/lib/pkg/";\nexport const o = f;\n',
    },
    "O.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/pkg/index.js → src/lib/barLogin.ts"
  );
});

test("18: Server Component en route handler mogen server.ts en barLogin importeren", () => {
  const { status, stderr } = runCheckArch({
    "src/app/x/page.tsx":
      'import { createClient } from "@/lib/supabase/server";\nimport { f } from "@/lib/barLogin";\nexport default async function Page() { await createClient(); f(); return null; }\n',
    "src/app/api/x/route.ts":
      'import { createClient } from "@/lib/supabase/server";\nimport { f } from "@/lib/barLogin";\nexport async function POST() { await createClient(); f(); return new Response(null); }\n',
  });
  assert.equal(status, 0, stderr);
});

test("21: import/export zonder witruimte voor {, * of de string", () => {
  expectFailure(
    {
      "src/features/x/U.tsx": '"use client";\nimport{f}from"@/lib/barLogin";\nexport const u = f;\n',
      "src/features/x/V.tsx": '"use client";\nimport*as n from"@/lib/barLogin";\nexport const v = n;\n',
      "src/features/x/W.tsx": '"use client";\nexport{f}from"@/lib/barLogin";\n',
      "src/features/x/X.tsx": '"use client";\nexport*from"@/lib/barLogin";\n',
    },
    "U.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts",
    "V.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts",
    "W.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts",
    "X.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

test("22: default- en namespace-binding met niet-ASCII identifier", () => {
  expectFailure(
    {
      "src/features/x/Y.tsx": '"use client";\nimport Ä from "@/lib/barLogin";\nexport const y = Ä;\n',
      "src/features/x/Z.tsx": '"use client";\nimport * as Ö from "@/lib/barLogin";\nexport const z = Ö;\n',
    },
    "Y.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts",
    "Z.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

test("23: block-comment tussen keyword en binding scheidt de tokens", () => {
  expectFailure(
    { "src/features/x/AA.tsx": '"use client";\nimport/**/f from "@/lib/barLogin";\nexport const aa = f;\n' },
    "AA.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts"
  );
});

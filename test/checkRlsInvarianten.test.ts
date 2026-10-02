import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * check:rls eist dat de twee database-invarianten van ADR 0019 bestaan en
 * hun kern nog bevatten (docs/features/tabelrechten-api-rollen.md → Gates →
 * check:rls). Dat is een negatieve eis: deze tests bewijzen dat het script
 * rood wordt als een invariant ontbreekt, leeggemaakt is, of zijn kern
 * alleen nog in commentaar noemt.
 *
 * Elk geval draait het echte script tegen een kopie van supabase/ in een
 * tijdelijke map (het script leest vanaf process.cwd()), zodat de repo zelf
 * nooit verandert.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const script = join(repoRoot, "scripts", "check-rls.mjs");

const TABELRECHTEN = "tabelrechten_api_rollen.test.sql";
const BUCKETS = "storage_bucket_limieten.test.sql";

function withCopy(mutate: (testsDir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "check-rls-"));
  try {
    cpSync(join(repoRoot, "supabase", "migrations"), join(dir, "supabase", "migrations"), {
      recursive: true,
    });
    cpSync(join(repoRoot, "supabase", "tests"), join(dir, "supabase", "tests"), {
      recursive: true,
    });
    const testsDir = join(dir, "supabase", "tests");
    mutate(testsDir);
    const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function replaceIn(testsDir: string, file: string, from: string | RegExp, to: string) {
  const path = join(testsDir, file);
  const before = readFileSync(path, "utf8");
  const after = before.replace(from, to);
  assert.notEqual(after, before, `de mutatie veranderde ${file} niet: de test zelf klopt niet meer`);
  writeFileSync(path, after);
}

test("check:rls is groen op de ongewijzigde kopie (anders bewijzen de rode gevallen niets)", () => {
  const { status, output } = withCopy(() => {});
  assert.equal(status, 0, output);
  assert.match(output, /2 invariants checked/);
});

for (const file of [TABELRECHTEN, BUCKETS]) {
  test(`check:rls faalt als ${file} ontbreekt`, () => {
    const { status, output } = withCopy((testsDir) => rmSync(join(testsDir, file)));
    assert.equal(status, 1, output);
    assert.match(output, new RegExp(`supabase/tests/${file}: ontbreekt`));
  });

  test(`check:rls faalt als ${file} leeg is`, () => {
    const { status, output } = withCopy((testsDir) => writeFileSync(join(testsDir, file), ""));
    assert.equal(status, 1, output);
    assert.match(output, new RegExp(`supabase/tests/${file}: noemt .* niet meer`));
  });

  test(`check:rls faalt als ${file} alleen nog commentaar is`, () => {
    // De kern staat er nog letterlijk, maar alleen achter `--`: dan toetst
    // de database niets meer, en dat moet het script zien.
    const { status, output } = withCopy((testsDir) => {
      const path = join(testsDir, file);
      const commented = readFileSync(path, "utf8")
        .split("\n")
        .map((line) => `-- ${line}`)
        .join("\n");
      writeFileSync(path, commented);
    });
    assert.equal(status, 1, output);
    assert.match(output, new RegExp(`supabase/tests/${file}: noemt .* niet meer`));
  });
}

test("check:rls faalt als de sequence-assertie uit de tabelrechten-invariant verdwijnt", () => {
  const { status, output } = withCopy((testsDir) =>
    replaceIn(testsDir, TABELRECHTEN, /has_sequence_privilege/g, "has_table_privilege")
  );
  assert.equal(status, 1, output);
  assert.match(output, /noemt has_sequence_privilege niet meer/);
});

test("check:rls faalt als de storage-guard uit de tabelrechten-invariant verdwijnt", () => {
  const { status, output } = withCopy((testsDir) =>
    replaceIn(testsDir, TABELRECHTEN, /forbid_api_role_truncate/g, "iets_anders")
  );
  assert.equal(status, 1, output);
  assert.match(output, /noemt forbid_api_role_truncate niet meer/);
});

test("check:rls faalt als 'TRUNCATE' uit de tabelrechten-invariant verdwijnt", () => {
  const { status, output } = withCopy((testsDir) =>
    replaceIn(testsDir, TABELRECHTEN, /'TRUNCATE'/g, "'SELECT'")
  );
  assert.equal(status, 1, output);
  assert.match(output, /noemt 'TRUNCATE' niet meer/);
});

test("check:rls faalt als de mime-type-assertie uit de bucket-invariant verdwijnt", () => {
  const { status, output } = withCopy((testsDir) =>
    replaceIn(testsDir, BUCKETS, /allowed_mime_types/g, "public")
  );
  assert.equal(status, 1, output);
  assert.match(output, /noemt allowed_mime_types niet meer/);
});

test("check:rls faalt als de bestaanscheck op product-images uit de bucket-invariant verdwijnt", () => {
  // Zonder die check is de tellende assertie stil groen op een lege
  // storage.buckets (spec → Gates, invariant 2).
  const { status, output } = withCopy((testsDir) =>
    replaceIn(testsDir, BUCKETS, /product-images/g, "iets-anders")
  );
  assert.equal(status, 1, output);
  assert.match(output, /noemt product-images niet meer/);
});

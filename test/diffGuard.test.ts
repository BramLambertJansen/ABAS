// Diff-guard (scripts/kit/diff-guard.mjs, ADR 0025): gate-wijziging of een
// bestaande test aanpassen vraagt het label; een nieuwe test toevoegen niet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const guard = path.resolve(import.meta.dirname, "../scripts/kit/diff-guard.mjs");
const GATES = JSON.stringify({ gates: ["^scripts/check-", "^supabase/tests/"], jsonGates: { "package.json": ["scripts"] } });

function repo(wijzig: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "diffguard-"));
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir });
  const schrijf = (rel: string, inhoud: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), inhoud);
  };
  git("init", "-q");
  schrijf("gates.json", GATES);
  schrijf("src/a.ts", "a");
  schrijf("test/a.test.ts", "a");
  schrijf("scripts/check-x.mjs", "a");
  schrijf("package.json", JSON.stringify({ scripts: { test: "node --test" }, dependencies: { a: "1" } }));
  git("add", ".");
  git("commit", "-qm", "basis");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  wijzig(dir);
  git("add", ".");
  git("commit", "-qm", "pr", "--allow-empty");
  return { dir, base };
}
const draai = (dir: string, base: string, labels: string[] = []) =>
  spawnSync("node", [guard, base, "HEAD", path.join(dir, "gates.json")], { cwd: dir, encoding: "utf8", env: { ...process.env, PR_LABELS: JSON.stringify(labels) } });

test("diff-guard: alleen bron gewijzigd → ok", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "src/a.ts"), "b"));
  assert.equal(draai(dir, base).status, 0);
});

test("diff-guard: nieuwe test toevoegen → ok zonder label", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "test/b.test.ts"), "b"));
  assert.equal(draai(dir, base).status, 0);
});

test("diff-guard: bestaande test aanpassen → label nodig", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "test/a.test.ts"), "b"));
  const r = draai(dir, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /M test\/a\.test\.ts/);
  assert.equal(draai(dir, base, ["gate-wijziging"]).status, 0);
});

test("diff-guard: gate-script wijzigen → label nodig", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "scripts/check-x.mjs"), "b"));
  assert.equal(draai(dir, base).status, 1);
});

test("diff-guard: een script in package.json wijzigen → label nodig", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "package.json"), JSON.stringify({ scripts: { test: "true" }, dependencies: { a: "1" } })));
  const r = draai(dir, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /package\.json → scripts/);
});

test("diff-guard: alleen een dependency in package.json wijzigen → ok", () => {
  const { dir, base } = repo((d) => writeFileSync(path.join(d, "package.json"), JSON.stringify({ scripts: { test: "node --test" }, dependencies: { a: "2" } })));
  assert.equal(draai(dir, base).status, 0);
});

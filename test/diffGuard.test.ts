// Diff-guard (scripts/kit/diff-guard.mjs, ADR 0025): gate-wijziging of een
// bestaande test aanpassen vraagt het label; een nieuwe test toevoegen niet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const guard = path.resolve(import.meta.dirname, "../scripts/kit/diff-guard.mjs");
const GATES = JSON.stringify({ gates: ["^scripts/check-"], testpaden: ["^supabase/tests/", "^test/", "^e2e/", "^integration/"], goedkeurders: ["reviewer"], jsonGates: { "package.json": ["scripts"] } });

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
const draai = (dir: string, base: string, labels: string[] = [], akkoord = false) => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  const reviews = path.join(dir, "reviews.json");
  writeFileSync(reviews, JSON.stringify(akkoord ? [{ id: 1, state: "APPROVED", commit_id: head, user: { login: "reviewer" } }] : []));
  return spawnSync("node", [guard, base, head, path.join(dir, "gates.json"), reviews], { cwd: dir, encoding: "utf8", env: { ...process.env, PR_AUTHOR: "agent", PR_LABELS: JSON.stringify(labels) } });
};

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
  assert.equal(draai(dir, base, ["gate-wijziging"]).status, 1);
  assert.equal(draai(dir, base, [], true).status, 1);
  assert.equal(draai(dir, base, ["gate-wijziging"], true).status, 0);
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

for (const folder of ["test", "e2e", "integration", "supabase/tests"]) {
  test(`diff-guard: bestaande ${folder}-test blijft beschermd bij Unicode, rename en delete`, () => {
    // De basis van de tweede repo bevat de nieuwe test uit de eerste commit.
    const first = repo((dir) => {
      mkdirSync(path.join(dir, folder), { recursive: true });
      writeFileSync(path.join(dir, folder, "één.test.ts"), "fixture");
    });
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: first.dir, encoding: "utf8" }).trim();
    writeFileSync(path.join(first.dir, folder, "één.test.ts"), "changed");
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "change"], { cwd: first.dir });
    assert.equal(draai(first.dir, base).status, 1);
    renameSync(path.join(first.dir, folder, "één.test.ts"), path.join(first.dir, "src/renamed.ts"));
    execFileSync("git", ["add", "."], { cwd: first.dir });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "rename"], { cwd: first.dir });
    assert.equal(draai(first.dir, base).status, 1);
    rmSync(path.join(first.dir, "src/renamed.ts"));
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "delete"], { cwd: first.dir });
    assert.equal(draai(first.dir, base).status, 1);
  });
}

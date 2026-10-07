// check:migrations (ADR 0025): append-only t.o.v. de basis, en een nieuwe
// migratie moet boven de hoogste op de huidige basis-tip komen — niet boven
// die van de merge-base (Codex-review op #184).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const script = path.resolve(import.meta.dirname, "../scripts/check-migrations.mjs");

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "migraties-"));
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, stdio: "pipe" });
  const migratie = (naam: string, inhoud = "select 1;") => {
    mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
    writeFileSync(path.join(dir, "supabase/migrations", naam), inhoud);
  };
  git("init", "-q", "-b", "main");
  migratie("0001_init.sql");
  git("add", ".");
  git("commit", "-qm", "basis");
  return { dir, git, migratie };
}
const draai = (dir: string) => spawnSync("node", [script], { cwd: dir, encoding: "utf8", env: { ...process.env, MIGRATIONS_BASE: "main" } });

test("check:migrations: nieuwe migratie onder de hoogste op de basis-tip faalt", () => {
  const { dir, git, migratie } = repo();
  git("checkout", "-qb", "feature");
  migratie("0002_feature.sql");
  git("add", ".");
  git("commit", "-qm", "feature");
  git("checkout", "-q", "main");
  migratie("0003_main.sql");
  git("add", ".");
  git("commit", "-qm", "main gaat door");
  git("checkout", "-q", "feature");
  const r = draai(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /versie 0002 is nieuw maar niet hoger dan 0003/);
});

test("check:migrations: bestaande migratie wijzigen faalt", () => {
  const { dir, git, migratie } = repo();
  git("checkout", "-qb", "feature");
  migratie("0001_init.sql", "select 2;");
  const r = draai(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /0001_init\.sql: gewijzigd/);
});

test("check:migrations: nieuwe migratie boven de basis-tip is ok", () => {
  const { dir, git, migratie } = repo();
  git("checkout", "-qb", "feature");
  migratie("0002_feature.sql");
  assert.equal(draai(dir).status, 0);
});

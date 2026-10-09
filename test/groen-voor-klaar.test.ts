// Groen vóór klaar (.claude/hooks/groen-voor-klaar.mjs, ADR 0025): ook een schone
// werkboom met rode check:fast → decision "block".
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const hook = path.resolve(import.meta.dirname, "../.claude/hooks/groen-voor-klaar.mjs");

function nepRepo(checkFast: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "gvk-"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { "check:fast": checkFast } }));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"], { cwd: dir });
  return dir;
}
const draai = (dir: string) =>
  spawnSync("node", [hook], { input: JSON.stringify({ agent_type: "developer", cwd: dir }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

test("groen-voor-klaar: schone werkboom met rode check blokkeert", () => {
  const r = draai(nepRepo("exit 1"));
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).decision, "block");
});

test("groen-voor-klaar: rode check:fast blokkeert met reden", () => {
  const dir = nepRepo("echo kapot-xyz && exit 1");
  writeFileSync(path.join(dir, "nieuw.txt"), "x");
  const r = draai(dir);
  assert.equal(r.status, 0);
  const uit = JSON.parse(r.stdout);
  assert.equal(uit.decision, "block");
  assert.match(uit.reason, /kapot-xyz/);
});

test("groen-voor-klaar: groene check:fast laat stoppen toe", () => {
  const dir = nepRepo("exit 0");
  writeFileSync(path.join(dir, "nieuw.txt"), "x");
  const r = draai(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

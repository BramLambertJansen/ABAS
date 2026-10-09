import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Voer de echte workflow-shellblokken uit. Alleen GitHub-API en git fetch
// zijn doubles; de commitboom, diff-guard en goedkeuringscontrole zijn echt.
const root = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(root, ".github/workflows/diff-guard.yml"), "utf8");
const dirs: string[] = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function block(marker: string) {
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflowstap ontbreekt: ${marker}`);
  const script = /run: \|\n((?: {10}[^\n]*\n)+)/.exec(workflow.slice(start));
  assert.ok(script, `shellblok ontbreekt: ${marker}`);
  return script[1].replace(/^ {10}/gm, "");
}
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "diff-guard-workflow-")); dirs.push(dir);
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), content);
  };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  for (const file of ["scripts/kit/diff-guard.mjs", "scripts/kit/goedkeuring.mjs", ".claude/hooks/rolhek.lokaal.json"]) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); copyFileSync(path.join(root, file), path.join(dir, file));
  }
  write("scripts/check-fixture.mjs", "old gate"); write("src/a.ts", "old source");
  git("add", "."); git("commit", "-qm", "main"); const main = git("rev-parse", "HEAD");
  write("scripts/check-fixture.mjs", "weakened gate"); git("commit", "-qam", "alternate base"); const alternate = git("rev-parse", "HEAD");
  write("src/a.ts", "new source"); git("commit", "-qam", "head"); const head = git("rev-parse", "HEAD");
  write("bin/gh", `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const endpoint = args.find((arg) => arg.startsWith("repos/"));
if (endpoint.includes("/statuses/")) { fs.appendFileSync(process.env.STATUS_LOG, JSON.stringify(args) + "\\n"); console.log("{}"); }
else if (endpoint.includes("/reviews")) console.log("[[]]");
else console.log(process.env.FIXTURE_PR);
`);
  write("bin/git", `#!/usr/bin/env node
const fs = require("node:fs");
const cp = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "fetch") fs.appendFileSync(process.env.FETCH_LOG, JSON.stringify(args) + "\\n");
else cp.execFileSync("git", args, { stdio: "inherit", env: { ...process.env, PATH: process.env.ORIGINAL_PATH } });
`);
  execFileSync("chmod", ["+x", path.join(dir, "bin/gh"), path.join(dir, "bin/git")]);
  mkdirSync(path.join(dir, "runner"));
  write("statuses.log", ""); write("fetch.log", ""); write("output", "");
  const env = { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, ORIGINAL_PATH: process.env.PATH,
    GITHUB_REPOSITORY: "owner/repo", DEFAULT_BRANCH: "main", PR: "1", GH_TOKEN: "fixture",
    RUNNER_TEMP: path.join(dir, "runner"), GITHUB_OUTPUT: path.join(dir, "output"),
    STATUS_LOG: path.join(dir, "statuses.log"), FETCH_LOG: path.join(dir, "fetch.log"), GITHUB_RUN_ID: "1" };
  const pr = (base = main, ref = "main") => ({ state: "open", user: { login: "agent" }, labels: [], base: { sha: base, ref, repo: { full_name: "owner/repo" } }, head: { sha: head } });
  const run = (marker: string, extra: Record<string, string>) => spawnSync("bash", ["-e", "-o", "pipefail", "-c", block(marker)], { cwd: dir, encoding: "utf8", env: { ...env, ...extra } });
  const statuses = () => readFileSync(path.join(dir, "statuses.log"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[]);
  return { dir, main, alternate, head, env, pr, run, statuses };
}
test("andere PR-basis met dezelfde head kan de failure voor main niet overschrijven", () => {
  const f = fixture();
  assert.match(workflow, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  const preflight = f.run("id: pr", { FIXTURE_PR: JSON.stringify(f.pr()) });
  assert.equal(preflight.status, 0, preflight.stderr);
  const guard = f.run("id: guard", {});
  assert.equal(guard.status, 1); assert.match(guard.stderr, /scripts\/check-fixture/);
  const published = f.run("name: Publiceer status", { HEAD_SHA: f.head, RESULT: "failure" });
  assert.equal(published.status, 0, published.stderr);
  const before = f.statuses();
  assert.deepEqual(before.map((args) => args.find((arg) => arg.startsWith("state="))), ["state=pending", "state=failure"]);
  writeFileSync(f.env.GITHUB_OUTPUT, "");
  const alternate = f.run("id: pr", { FIXTURE_PR: JSON.stringify(f.pr(f.alternate, "alternate")) });
  assert.notEqual(alternate.status, 0);
  assert.equal(readFileSync(f.env.GITHUB_OUTPUT, "utf8"), ""); // geen head-output: final always-stap slaat over
  assert.deepEqual(f.statuses(), before); // geen pending/success op dezelfde head
});
for (const invalid of ["closed", "foreign-repo", "invalid-sha"]) {
  test(`workflow weigert ${invalid} vóór statuspublicatie`, () => {
    const f = fixture(); const pr = f.pr();
    if (invalid === "closed") pr.state = "closed";
    if (invalid === "foreign-repo") pr.base.repo.full_name = "other/repo";
    if (invalid === "invalid-sha") pr.head.sha = "HEAD";
    const result = f.run("id: pr", { FIXTURE_PR: JSON.stringify(pr) });
    assert.notEqual(result.status, 0); assert.deepEqual(f.statuses(), []);
    assert.equal(readFileSync(f.env.GITHUB_OUTPUT, "utf8"), "");
    assert.equal(readFileSync(f.env.FETCH_LOG, "utf8"), "");
  });
}
test("defaultbranch is configuratie: een PR naar trunk wordt geaccepteerd", () => {
  const f = fixture();
  const result = f.run("id: pr", { DEFAULT_BRANCH: "trunk", FIXTURE_PR: JSON.stringify(f.pr(f.main, "trunk")) });
  assert.equal(result.status, 0, result.stderr); assert.equal(f.statuses().length, 1);
  assert.match(readFileSync(f.env.GITHUB_OUTPUT, "utf8"), new RegExp(`head=${f.head}`));
});

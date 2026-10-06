import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { checkReleaseCi } = await import(pathToFileURL(`${process.cwd()}/scripts/check-release-ci.mjs`).href);
const sha = "a".repeat(40), env = { GITHUB_TOKEN: "private", GITHUB_SHA: sha, GITHUB_REPOSITORY: "BramLambertJansen/ABAS" };
const run = { head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success" };
const response = (value: unknown) => new Response(JSON.stringify(value));
test("release requires full successful CI for current main SHA", async () => {
  await checkReleaseCi(env, async (url: string) => response(url.includes("branches/") ? { commit: { sha } } : { workflow_runs: [run] }));
});
test("release rejects missing, running, skipped, stale and failed CI", async () => {
  for (const candidate of [null, { ...run, conclusion: "failure" }, { ...run, conclusion: "skipped" }, { ...run, status: "in_progress" }, { ...run, head_sha: "b".repeat(40) }, { ...run, event: "pull_request" }]) {
    await assert.rejects(checkReleaseCi(env, async (url: string) => response(url.includes("branches/") ? { commit: { sha } } : { workflow_runs: candidate ? [candidate] : [] })), /has not succeeded/);
  }
  await assert.rejects(checkReleaseCi(env, async () => response({ commit: { sha: "b".repeat(40) } })), /current main/);
});
test("release fails closed without credentials or on API failure", async () => {
  await assert.rejects(checkReleaseCi({}), /configuration/);
  await assert.rejects(checkReleaseCi(env, async () => new Response("private", { status: 403 })), /HTTP 403/);
});

#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/** Deployment guard: latest main push CI for this exact SHA must succeed. */
export async function checkReleaseCi(env = process.env, request = fetch) {
  const { GITHUB_TOKEN: token, GITHUB_SHA: sha, GITHUB_REPOSITORY: repo } = env;
  if (!token || !/^[a-f0-9]{40}$/.test(sha ?? "") || repo !== "BramLambertJansen/ABAS") throw new Error("release CI configuration is invalid");
  async function get(path) {
    let response;
    try { response = await request(`https://api.github.com/repos/${repo}/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, redirect: "error", signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error("release CI request failed"); }
    if (!response.ok) throw new Error(`release CI request returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error("release CI response is invalid"); }
  }
  if ((await get("branches/main")).commit?.sha !== sha) throw new Error("release SHA is no longer the current main commit");
  const runs = await get(`actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sha}&per_page=1`);
  const run = runs.workflow_runs?.[0];
  if (!run || run.head_sha !== sha || run.head_branch !== "main" || run.event !== "push" || run.status !== "completed" || run.conclusion !== "success") throw new Error("latest main CI for the release SHA has not succeeded");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkReleaseCi(); console.log("check:release: current main SHA has successful full CI"); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

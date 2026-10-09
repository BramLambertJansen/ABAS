#!/usr/bin/env node
// Read-only diagnose; geen onderdeel van offline check:fast. Geen secrets lezen.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export const VERPLICHTE_CHECKS = ["check-all", "diff-guard", "osv-scanner", "betterleaks"];
export function beoordeelInrichting(repo, branch, protection, identity, goedkeurders) {
  const fouten = [];
  if (!branch?.protected) fouten.push("main heeft geen bewezen branch protection");
  if (!protection) fouten.push("branch protection is niet leesbaar; inrichting onbewezen");
  else {
    const required = protection.required_status_checks;
    const contexts = new Set([...(required?.contexts ?? []), ...(required?.checks ?? []).map((check) => check.context)]);
    for (const name of VERPLICHTE_CHECKS) if (!contexts.has(name)) fouten.push(`verplichte check ontbreekt: ${name}`);
    for (const name of VERPLICHTE_CHECKS) {
      if (!required?.checks?.some((check) => check.context === name && check.app_id === 15368)) fouten.push(`checkbron moet GitHub Actions zijn: ${name}`);
    }
    if (!required?.strict) fouten.push("checks moeten op actuele basisbranch slagen");
    const reviews = protection.required_pull_request_reviews;
    if (!reviews?.require_code_owner_reviews || !reviews.dismiss_stale_reviews || !(reviews.required_approving_review_count >= 1)) fouten.push("actuele Code Owner-review ontbreekt");
    if (!protection.enforce_admins?.enabled) fouten.push("administratorbypass staat nog open");
    if (protection.allow_force_pushes?.enabled || protection.allow_deletions?.enabled) fouten.push("force-push of branchverwijdering toegestaan");
    if (!protection.required_conversation_resolution?.enabled) fouten.push("reviewgesprekken hoeven niet opgelost te zijn");
  }
  if (!identity?.login || goedkeurders.some((name) => name.toLowerCase() === identity.login.toLowerCase()) || repo?.permissions?.admin) fouten.push("gebruik een aparte beperkte agentidentiteit, niet het reviewer-/adminaccount");
  return fouten;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.argv[2];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) {
    console.error("Gebruik: node scripts/kit/controleer-inrichting.mjs owner/repo"); process.exit(1);
  }
  const get = (endpoint) => {
    try { return JSON.parse(execFileSync("gh", ["api", endpoint], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
    catch { console.error(`Onleesbaar: ${endpoint} (controleer API-rechten)`); return null; }
  };
  const repo = get(`repos/${repository}`);
  const branch = get(`repos/${repository}/branches/main`);
  const protection = get(`repos/${repository}/branches/main/protection`);
  const identity = get("user");
  const config = JSON.parse(readFileSync(new URL("../../.claude/hooks/rolhek.lokaal.json", import.meta.url)));
  const fouten = beoordeelInrichting(repo, branch, protection, identity, config.goedkeurders);
  console.log(`Repository: ${repository}; visibility: ${repo?.visibility ?? "onbekend"}; identiteit: ${identity?.login ?? "onbekend"}`);
  for (const fout of fouten) console.error(`FAIL: ${fout}`);
  console.log("Handmatig verifiëren: credentialpermissies (geen Workflows/Administration/Checks/Statuses write), actieve runtimehooks en bescherming van release-environment. Deze diagnose bewijst die niet.");
  process.exitCode = fouten.length ? 1 : 0;
}

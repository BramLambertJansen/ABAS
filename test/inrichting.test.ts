import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { beoordeelInrichting, VERPLICHTE_CHECKS } = await import(pathToFileURL(`${process.cwd()}/scripts/kit/controleer-inrichting.mjs`).href);
const protection = { required_status_checks: { strict: true, checks: VERPLICHTE_CHECKS.map((context: string) => ({ context, app_id: 15368 })) }, required_pull_request_reviews: { require_code_owner_reviews: true, dismiss_stale_reviews: true, required_approving_review_count: 1 }, enforce_admins: { enabled: true }, required_conversation_resolution: { enabled: true } };
test("onleesbare bescherming en gedeelde eigenaaridentiteit worden niet groen", () => {
  const errors = beoordeelInrichting({ permissions: { admin: true } }, { protected: false }, null, { login: "bram" }, ["Bram"]);
  assert.equal(errors.length, 3);
});
test("volledige branchregels en aparte auteur voldoen aan controleerbare voorwaarden", () => {
  assert.deepEqual(beoordeelInrichting({ permissions: { admin: false } }, { protected: true }, protection, { login: "agent" }, ["Bram"]), []);
  const incomplete = { ...protection, required_status_checks: { strict: false, contexts: ["check-all"] } };
  assert.equal(beoordeelInrichting({}, { protected: true }, incomplete, { login: "agent" }, ["Bram"]).length, 8);
});

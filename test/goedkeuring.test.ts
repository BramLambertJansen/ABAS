import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { heeftGoedkeuring } = await import(pathToFileURL(`${process.cwd()}/scripts/kit/goedkeuring.mjs`).href);

const head = "a".repeat(40);
const review = (id: number, state: string, commit = head, login = "bram") => ({ id, state, commit_id: commit, user: { login } });
const akkoord = (reviews: unknown[], auteur = "agent") => heeftGoedkeuring(reviews, head, auteur, ["Bram"]);

test("alleen aangewezen onafhankelijke reviewer op actuele SHA", () => {
  assert.equal(akkoord([review(1, "APPROVED")]), true);
  assert.equal(akkoord([review(1, "APPROVED", "b".repeat(40))]), false);
  assert.equal(akkoord([review(1, "APPROVED", head, "ander")]), false);
  assert.equal(akkoord([review(1, "APPROVED")], "BRAM"), false);
  assert.equal(akkoord([]), false);
});

test("laatste beslissende review telt, commentaar vervangt geen beslissing", () => {
  assert.equal(akkoord([review(2, "CHANGES_REQUESTED"), review(1, "APPROVED")]), false);
  assert.equal(akkoord([review(1, "APPROVED"), review(2, "DISMISSED")]), false);
  assert.equal(akkoord([review(2, "COMMENTED"), review(1, "APPROVED")]), true);
  assert.equal(akkoord([review(1, "CHANGES_REQUESTED"), review(2, "APPROVED")]), true);
  assert.equal(akkoord([null, {}, review(1, "PENDING")]), false);
});

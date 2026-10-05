import { test } from "node:test";
import assert from "node:assert/strict";
import { runMoneyRequest, type IntentEnvironment } from "../src/lib/moneyRequest.ts";

function fixture() {
  const storage = new Map<string, string>();
  let sequence = 0, actor = "actor-one";
  let response: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: { message: "network" } };
  const calls: Record<string, unknown>[] = [];
  const environment: IntentEnvironment = {
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: (key) => { storage.delete(key); } },
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    lock: async (_key, work) => work(),
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: actor } } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, ...args }); return response; },
  };
  return { storage, calls, environment, client, actor: (value: string) => { actor = value; }, response: (value: typeof response) => { response = value; } };
}
const args = { p_member_id: "member", p_amount_cents: 100 };
test("lost response, remount, reset and reload reuse a persisted UUID", async () => {
  const f = fixture();
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  await runMoneyRequest(f.client, "top_up", args, { ...f.environment });
  assert.equal(f.calls[0].p_request_id, f.calls[1].p_request_id);
  assert.equal(f.calls[0].name, "top_up_once");
  f.response({ data: { id: "booking" }, error: null });
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.equal(f.storage.size, 0);
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.notEqual(f.calls[2].p_request_id, f.calls[3].p_request_id);
});
test("changed inputs cannot silently replace an unresolved money action", async () => {
  const f = fixture();
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  const result = await runMoneyRequest(f.client, "top_up", { ...args, p_amount_cents: 200 }, f.environment);
  assert.equal(result.error?.message, "pending_request"); assert.equal(f.calls.length, 1);
});
test("actor and operation partition intents; no automatic retry after login", async () => {
  const f = fixture();
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  f.actor("actor-two");
  assert.equal(f.calls.length, 1);
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.notEqual(f.calls[0].p_request_id, f.calls[1].p_request_id);
  f.actor("actor-one");
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.equal(f.calls[0].p_request_id, f.calls[2].p_request_id);
});
test("session failures keep intent, definite transactional rejection clears it", async () => {
  const f = fixture();
  f.response({ data: null, error: { message: "session_ended", code: "P0001" } });
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.equal(f.storage.size, 1);
  f.response({ data: null, error: { message: "invalid_amount", code: "P0001" } });
  await runMoneyRequest(f.client, "top_up", args, f.environment);
  assert.equal(f.storage.size, 0);
});
test("unavailable or corrupted persistence blocks requests before transmission", async () => {
  const f = fixture();
  f.environment.storage.setItem = () => { throw new Error("quota"); };
  await assert.rejects(runMoneyRequest(f.client, "top_up", args, f.environment), /request_storage_unavailable/);
  assert.equal(f.calls.length, 0);
});
test("overlapping requests acquire the same intent before either response arrives", async () => {
  const f = fixture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  f.client.rpc = async (name, args) => { f.calls.push({ name, ...args }); await pending; return { data: { id: "one" }, error: null }; };
  const one = runMoneyRequest(f.client, "top_up", args, f.environment);
  const two = runMoneyRequest(f.client, "top_up", args, f.environment);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release(); await Promise.all([one, two]);
  assert.equal(f.calls[0].p_request_id, f.calls[1].p_request_id);
  assert.equal(f.storage.size, 0);
});

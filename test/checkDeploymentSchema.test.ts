import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { validateSchema, checkDeploymentSchema, REQUIRED_RPCS } = await import(pathToFileURL(`${process.cwd()}/scripts/check-deployment-schema.mjs`).href);
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test" };
function schema() {
  const value = { definitions: {
    products: { properties: { image_path: { type: "string" } } },
    members: { properties: { invited_auth_user_id: { type: "string" } } },
  }, paths: {
    "/rpc/set_product_image": { post: { parameters: [{ in: "body", schema: { properties: { p_product_id: {}, p_image_path: {} } } }] } },
    "/rpc/mark_member_invite_sent": { post: { parameters: [{ in: "body", schema: { properties: { p_member_id: {}, p_auth_user_id: {} } } }] } },
  } };
  for (const [name, args] of Object.entries(REQUIRED_RPCS) as [string, string[]][]) {
    if (name in value.paths) continue;
    (value.paths as Record<string, unknown>)[`/rpc/${name}`] = { post: { parameters: [{ in: "body", schema: { properties: Object.fromEntries(args.map((arg) => [arg, {}])) } }] } };
  }
  return value;
}
test("deployment contract accepts compatible schema and rejects absent columns", () => {
  const good = schema();
  assert.deepEqual(validateSchema(good), []);
  delete (good.definitions.products.properties as Record<string, unknown>).image_path;
  assert.match(validateSchema(good).join(";"), /products.image_path/);
});
test("deployment contract rejects the old invitation RPC and missing image RPC", () => {
  const bad = schema();
  delete (bad.paths["/rpc/mark_member_invite_sent"].post.parameters[0].schema.properties as Record<string, unknown>).p_auth_user_id;
  delete (bad.paths as Record<string, unknown>)["/rpc/set_product_image"];
  assert.equal(validateSchema(bad).length, 2);
});
test("deployment request uses only read-only OpenAPI, blocks redirects and has a timeout", async () => {
  await checkDeploymentSchema(env, async (url: URL, options: RequestInit) => {
    assert.equal(url.href, "https://example.supabase.co/rest/v1/");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    assert.equal((options.headers as Record<string, string>).Authorization, undefined);
    return new Response(JSON.stringify(schema()));
  });
});
test("legacy local service-role key uses bearer auth", async () => {
  await checkDeploymentSchema({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "legacy.jwt.key" }, async (_url: URL, options: RequestInit) => {
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer legacy.jwt.key");
    return new Response(JSON.stringify(schema()));
  });
});
test("deployment check fails closed on missing config, auth errors and malformed API responses", async () => {
  await assert.rejects(checkDeploymentSchema({}), /are required/);
  await assert.rejects(checkDeploymentSchema({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" }), /HTTPS/);
  await assert.rejects(checkDeploymentSchema(env, async () => new Response("sensitive backend error", { status: 401 })), /HTTP 401/);
  await assert.rejects(checkDeploymentSchema(env, async () => new Response("{}")), /not a PostgREST/);
  await assert.rejects(checkDeploymentSchema(env, async () => new Response("not JSON")), /not JSON/);
  await assert.rejects(checkDeploymentSchema(env, async () => { throw new Error("secret sb_secret_test"); }), /network, timeout or redirect/);
});

test("preview cannot reach production and production cannot build with a staging URL", async () => {
  const never = async () => { throw new Error("request must not run"); };
  await assert.rejects(checkDeploymentSchema({ ...env, VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://zlyysbywrvaolpslcbid.supabase.co" }, never), /separate Supabase/);
  await assert.rejects(checkDeploymentSchema({ ...env, VERCEL_ENV: "production" }, never), /production Supabase/);
  await checkDeploymentSchema({ ...env, VERCEL_ENV: "preview" }, async () => new Response(JSON.stringify(schema())));
});

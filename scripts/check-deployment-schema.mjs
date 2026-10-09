#!/usr/bin/env node
// Read-only contract check: no member data or mutating RPC calls.
// This checks API compatibility, not migration history or every RLS policy.
import { pathToFileURL } from "node:url";

export const PRODUCTION_PROJECT_REF = "zlyysbywrvaolpslcbid";

export const REQUIRED_COLUMNS = {
  products: ["image_path"],
  members: ["invited_auth_user_id"],
};
export const REQUIRED_RPCS = {
  caller_session_alive: [],
  inspect_money_request: ["p_request_id", "p_operation", "p_payload", "p_cancel"],
  place_order_once: ["p_request_id", "p_shift_id", "p_member_id", "p_lines", "p_served_by"],
  top_up_once: ["p_request_id", "p_shift_id", "p_member_id", "p_amount_cents", "p_method", "p_served_by"],
  create_member_once: ["p_request_id", "p_name", "p_starting_balance_cents", "p_email"],
  set_product_image: ["p_product_id", "p_image_path"],
  mark_member_invite_sent: ["p_member_id", "p_auth_user_id"],
};

export function validateSchema(schema) {
  const problems = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      if (!schema.definitions?.[table]?.properties?.[column]) problems.push(`missing column ${table}.${column}`);
    }
  }
  for (const [name, args] of Object.entries(REQUIRED_RPCS)) {
    const body = schema.paths?.[`/rpc/${name}`]?.post?.parameters?.find((p) => p.in === "body")?.schema;
    const definition = body?.$ref ? schema.definitions?.[body.$ref.split("/").at(-1)] : body;
    const actual = Object.keys(definition?.properties ?? {}).sort();
    if (!schema.paths?.[`/rpc/${name}`]?.post || actual.join(",") !== [...args].sort().join(",")) problems.push(`missing or incompatible RPC ${name}`);
  }
  return problems;
}

export async function checkDeploymentSchema(env = process.env, request = fetch) {
  const { NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SECRET_KEY: key } = env;
  if (!base || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  let url;
  try { url = new URL("/rest/v1/", base); } catch { throw new Error("invalid Supabase URL"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("Supabase URL must use HTTPS (except localhost)");
  if (url.username || url.password) throw new Error("Supabase URL must not contain credentials");
  const production = url.origin === `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  if (env.VERCEL_ENV === "preview" && production) throw new Error("preview must use a separate Supabase project");
  if (env.VERCEL_ENV === "production" && !production) throw new Error("production must use the ABAS production Supabase project");
  const headers = { apikey: key, Accept: "application/openapi+json" };
  // Modern sb_secret keys are opaque API keys, not JWT bearer tokens.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response;
  try {
    response = await request(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error("Supabase schema request failed (network, timeout or redirect)");
  }
  if (!response.ok) throw new Error(`Supabase schema request returned HTTP ${response.status}`);
  let schema;
  try { schema = await response.json(); } catch { throw new Error("Supabase schema response is not JSON"); }
  if (!schema || typeof schema !== "object" || !schema.paths || !schema.definitions) throw new Error("Supabase response is not a PostgREST OpenAPI schema");
  const problems = validateSchema(schema);
  if (problems.length) throw new Error(problems.join("; "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkDeploymentSchema();
    console.log("check:deployment: required columns and RPC signatures are present");
  } catch (error) {
    console.error(`check:deployment failed: ${error.message}`);
    process.exitCode = 1;
  }
}

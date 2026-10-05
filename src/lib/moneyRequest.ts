/** Pending financial intent survives remount/reload. Server receipts decide money. */
import { isSessionErrorCode } from "./barSessie.ts";

export const PENDING_REQUEST_MESSAGE =
  "Een eerdere actie heeft nog geen bevestigde uitkomst. Rond die eerst af met dezelfde invoer; controleer zo nodig het logboek.";
export const REQUEST_STORAGE_MESSAGE =
  "Veilig opslaan is niet beschikbaar in deze browser. Schakel lokale opslag in en gebruik een ondersteunde browser.";
export type MoneyRequestErrorCode = "pending_request" | "request_storage_unavailable" | "request_id_conflict" | "invalid_request_id" | "request_cancelled";
export function isMoneyRequestError(value: unknown): value is MoneyRequestErrorCode {
  return ["pending_request", "request_storage_unavailable", "request_id_conflict", "invalid_request_id", "request_cancelled"].includes(value as string);
}
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type Client = {
  auth: { getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};
export type IntentEnvironment = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  uuid(): string;
  lock<T>(name: string, work: () => Promise<T>): Promise<T>;
};
type Intent = { id: string; payload: string };
export type MoneyOperation = "place_order" | "top_up" | "create_member";
export const MONEY_OPERATIONS: MoneyOperation[] = ["place_order", "top_up", "create_member"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function browserEnvironment(): IntentEnvironment {
  try {
    if (typeof window === "undefined" || !navigator.locks || !crypto.randomUUID) throw new Error();
    return { storage: window.localStorage, uuid: () => crypto.randomUUID(),
      lock: async (name, work) => await navigator.locks.request(name, work) };
  } catch { throw new Error("request_storage_unavailable"); }
}

function readIntent(environment: IntentEnvironment, key: string): Intent | null {
  try {
    const raw = environment.storage.getItem(key);
    if (raw === null) return null;
    const intent = JSON.parse(raw) as Intent;
    if (!UUID.test(intent.id) || typeof intent.payload !== "string") throw new Error();
    return intent;
  } catch { throw new Error("request_storage_unavailable"); }
}

export function pendingMoneyRequests(actor: string, environment = browserEnvironment()) {
  return MONEY_OPERATIONS.flatMap((operation) => {
    const intent = readIntent(environment, `abas:money:v1:${actor}:${operation}`);
    if (!intent) return [];
    let args: unknown;
    try { args = JSON.parse(intent.payload); } catch { throw new Error("request_storage_unavailable"); }
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("request_storage_unavailable");
    return [{ operation, args: args as Record<string, unknown> }];
  });
}

const PAYLOAD_KEYS = {
  place_order: ["p_shift_id", "p_member_id", "p_lines", "p_served_by"],
  top_up: ["p_shift_id", "p_member_id", "p_amount_cents", "p_method", "p_served_by"],
  create_member: ["p_name", "p_starting_balance_cents", "p_email"],
};

/** Terminal server proof is required to release a pending intent. An absent
 * receipt by itself proves nothing about a delayed request. Explicit cancellation
 * creates a server tombstone that also rejects those delayed requests. */
export async function inspectPendingMoneyRequest(client: Client, operation: MoneyOperation, cancel = false,
  environment?: IntentEnvironment): Promise<RpcResult> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user.id) return { data: null, error: { message: "no_bar_session", code: "P0001" } };
  const context = environment ?? browserEnvironment();
  const key = `abas:money:v1:${data.session.user.id}:${operation}`;
  return context.lock(key, async () => {
    const intent = readIntent(context, key);
    if (!intent) return { data: null, error: null };
    const args = JSON.parse(intent.payload) as Record<string, unknown>;
    const result = await client.rpc("inspect_money_request", { p_request_id: intent.id, p_operation: operation,
      p_payload: PAYLOAD_KEYS[operation].map((name) => args[name] ?? null), p_cancel: cancel });
    const status = (result.data as { status?: string } | null)?.status;
    if (!result.error && ["completed", "cancelled"].includes(status ?? "")) {
      try { context.storage.removeItem(key); } catch { /* Stale storage remains safe. */ }
    }
    return result;
  });
}
function writeIntent(environment: IntentEnvironment, key: string, intent: Intent): void {
  try {
    const raw = JSON.stringify(intent);
    environment.storage.setItem(key, raw);
    if (environment.storage.getItem(key) !== raw) throw new Error();
  } catch { throw new Error("request_storage_unavailable"); }
}

export async function runMoneyRequest(client: Client, operation: "place_order" | "top_up" | "create_member",
  args: Record<string, unknown>, environment?: IntentEnvironment): Promise<RpcResult> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user.id) return { data: null, error: { message: "no_bar_session", code: "P0001" } };
  const context = environment ?? browserEnvironment();
  const key = `abas:money:v1:${data.session.user.id}:${operation}`;
  // A click queued behind inspection/cancellation belongs to the intent it
  // observed, even if another tab confirms and clears that intent meanwhile.
  const observed = readIntent(context, key);
  const intent = await context.lock(key, async () => {
    const payload = JSON.stringify(args);
    const pending = readIntent(context, key) ?? observed;
    if (pending && pending.payload !== payload) return null;
    const intent = pending ?? { id: context.uuid(), payload };
    if (!UUID.test(intent.id)) throw new Error("request_storage_unavailable");
    writeIntent(context, key, intent); // Before any network side effect.
    return intent;
  });
  if (!intent) return { data: null, error: { message: "pending_request", code: "P0001" } };
  const result = await client.rpc(`${operation}_once`, { ...args, p_request_id: intent.id });
  const definiteRejection = result.error?.code === "P0001" &&
    !isSessionErrorCode(result.error.message) && result.error.message !== "request_id_conflict";
  if ((!result.error && result.data != null) || definiteRejection) {
    await context.lock(key, async () => {
      if (readIntent(context, key)?.id !== intent.id) return;
      try { context.storage.removeItem(key); }
      catch { /* A stale key safely replays the result; it never books twice. */ }
    });
  }
  return result;
}

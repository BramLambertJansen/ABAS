export { isMoneyRequestError } from "../../src/lib/moneyRequest.ts";
import { runMoneyRequest as realRequest, type IntentEnvironment } from "../../src/lib/moneyRequest.ts";
// Each legacy hook test gets an isolated environment. Recovery is tested with
// persistent shared storage separately in moneyRequest.test.ts.
export function runMoneyRequest(...args: Parameters<typeof realRequest>) {
  const storage = new Map<string, string>();
  const environment: IntentEnvironment = {
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: (key) => { storage.delete(key); } },
    uuid: () => crypto.randomUUID(), lock: async (_key, work) => work(),
  };
  return realRequest(args[0], args[1], args[2], environment);
}

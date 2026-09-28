import { fakeMoney } from "./moneyHookCalls.ts";

/**
 * Nep-vervanger van src/lib/clientErrors.ts voor
 * test/moneyHooksFoutlogging.test.ts: registreert alleen wélke hook met
 * wélke fout zou melden. De echte helper is apart getest in
 * test/clientErrors.test.ts.
 */
export function reportClientError(client: unknown, hook: string, err: unknown): void {
  fakeMoney().reports.push({ hook, err, clientIsFactory: typeof client === "function" });
}

export function logLocalError(): void {}

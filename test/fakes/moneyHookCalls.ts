/**
 * Gedeelde registratie voor test/moneyHooksFoutlogging.test.ts: wat de
 * nep-Supabase-client op de volgende `rpc()` doet, en welke
 * `reportClientError`-aanroepen de hook deed. Op globalThis, zodat de test
 * en de via de resolve-hook geladen nep-modules zeker hetzelfde object zien
 * (zelfde vorm als authCalls.ts).
 */
export type RpcOutcome =
  | { kind: "result"; data: unknown; error: { message: string; code?: string } | null }
  | { kind: "throw"; error: unknown };

export type ReportCall = { hook: string; err: unknown; clientIsFactory: boolean };

export type FakeMoneyState = {
  rpcCalls: { fn: string; args: unknown }[];
  next: RpcOutcome;
  reports: ReportCall[];
  /** De sessiecodes die een hook aan de centrale afhandeling doorgaf
   *  (`notifySessionCode`, dienst-per-sessie). */
  notifications: string[];
  /** De opties van elke `auth.signOut()` (useEndBarSession). */
  signOuts: unknown[];
};

const KEY = "__abasFakeMoneyHooks";

export function fakeMoney(): FakeMoneyState {
  const holder = globalThis as unknown as Record<string, FakeMoneyState | undefined>;
  holder[KEY] ??= {
    rpcCalls: [],
    next: { kind: "result", data: null, error: null },
    reports: [],
    notifications: [],
    signOuts: [],
  };
  return holder[KEY];
}

export function resetFakeMoney(): void {
  const state = fakeMoney();
  state.rpcCalls = [];
  state.next = { kind: "result", data: null, error: null };
  state.reports = [];
  state.notifications = [];
  state.signOuts = [];
}

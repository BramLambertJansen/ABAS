import { fakeMoney } from "./moneyHookCalls.ts";

/**
 * Nep-vervanger van src/lib/supabase/client.ts voor
 * test/moneyHooksFoutlogging.test.ts — zie test/fakes/money-hooks-resolve.mjs.
 */
export function createClient() {
  const state = fakeMoney();
  return {
    auth: {
      async signOut(options: unknown) {
        state.signOuts.push(options);
        return { error: null };
      },
    },
    async rpc(fn: string, args: unknown) {
      state.rpcCalls.push({ fn, args });
      const next = state.next;
      if (next.kind === "throw") throw next.error;
      return { data: next.data, error: next.error };
    },
  };
}

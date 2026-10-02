import { fakeProductImage } from "./productImageState.ts";

/**
 * Nep-vervanger van src/lib/supabase/server.ts voor test/productImage.test.ts:
 * de sessie-gebonden client van de server-actie (actorcheck en RPC's).
 */
export async function createClient() {
  const state = fakeProductImage();
  return {
    auth: {
      async getUser() {
        return { data: { user: state.user } };
      },
    },
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve(
            state.actorError ? { data: null, error: state.actorError } : { data: state.actor, error: null }
          ),
      };
      return builder;
    },
    async rpc(fn: string, args?: unknown) {
      state.calls.push(`rpc:${fn}`);
      state.rpcArgs.push({ fn, args });
      const result = state.rpc[fn] ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
}

import { fakeInviteMember } from "./inviteMemberState.ts";

/**
 * Nep-vervanger van src/lib/supabase/server.ts voor test/inviteMember.test.ts:
 * de sessie-gebonden client van de invite-actie (actorcheck en RPC's).
 */
export async function createClient() {
  const state = fakeInviteMember();
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
        maybeSingle: () => Promise.resolve({ data: state.actor, error: null }),
      };
      return builder;
    },
    async rpc(fn: string) {
      state.calls.push(`rpc:${fn}`);
      const result = state.rpc[fn] ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
}

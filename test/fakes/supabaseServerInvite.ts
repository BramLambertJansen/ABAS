import { fakeInviteMember } from "./inviteMemberState.ts";

/**
 * Nep-vervanger van src/lib/supabase/server.ts voor test/inviteMember.test.ts:
 * de sessie-gebonden client van de invite-actie (actorcheck en RPC's).
 *
 * `mark_member_invite_sent` eist, zoals de echte RPC sinds 0040 (ADR 0020),
 * een `p_auth_user_id`: hier moet dat het id zijn dat de nep-
 * `inviteUserByEmail` teruggaf, anders `invite_account_mismatch`.
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
    async rpc(fn: string, args?: Record<string, unknown>) {
      state.calls.push(`rpc:${fn}`);
      if (
        fn === "mark_member_invite_sent" &&
        args?.p_auth_user_id !== state.invitedAuthUserId
      ) {
        return { data: null, error: { message: "invite_account_mismatch" } };
      }
      const result = state.rpc[fn] ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
}

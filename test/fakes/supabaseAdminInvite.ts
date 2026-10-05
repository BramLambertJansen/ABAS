import { fakeInviteMember } from "./inviteMemberState.ts";

/**
 * Nep-vervanger van src/lib/supabase/admin.ts voor test/inviteMember.test.ts:
 * de service-role-client met alleen wat src/lib/inviteMember.ts gebruikt.
 */
export function createAdminClient() {
  const state = fakeInviteMember();
  return {
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: state.member, error: null }),
      };
      return builder;
    },
    auth: {
      admin: {
        async inviteUserByEmail() {
          state.calls.push("inviteUserByEmail");
          return { data: { user: { id: state.invitedAuthUserId } }, error: null };
        },
      },
    },
  };
}

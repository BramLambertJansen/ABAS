import { fakeBarLogin } from "./barLoginState.ts";

/**
 * Nep-vervanger van src/lib/supabase/admin.ts voor test/barLogin.test.ts: de
 * service-role-client met alleen wat src/lib/barLogin.ts gebruikt.
 */
export function createAdminClient() {
  const state = fakeBarLogin();
  return {
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => Promise.resolve({ data: state.namen, error: null }),
        maybeSingle: () => Promise.resolve({ data: state.member, error: null }),
      };
      return builder;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      const handler = state.rpc[fn];
      const result = handler ? handler(args) : { data: null, error: null };
      return { data: result.data ?? null, error: result.error ?? null };
    },
    auth: {
      admin: {
        async getUserById() {
          return { data: { user: state.email ? { email: state.email } : null }, error: null };
        },
        async generateLink() {
          return {
            data: { properties: state.link.token ? { hashed_token: state.link.token } : {} },
            error: null,
          };
        },
      },
      async resetPasswordForEmail(email: string, options: { redirectTo: string }) {
        state.resets.push({ email, redirectTo: options.redirectTo });
        return { error: null };
      },
    },
  };
}

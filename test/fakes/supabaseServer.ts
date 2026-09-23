import { fakeAuth } from "./authCalls.ts";

/**
 * Nep-vervanger van src/lib/supabase/server.ts voor
 * test/beheerCallback.test.ts — zie test/fakes/resolve-hooks.mjs.
 */
export async function createClient() {
  const state = fakeAuth();
  const result = () => ({ error: state.nextError ? { message: state.nextError } : null });
  return {
    auth: {
      async verifyOtp(args: { token_hash: string; type: string }) {
        state.calls.push({ method: "verifyOtp", args });
        return result();
      },
      async exchangeCodeForSession(code: string) {
        state.calls.push({ method: "exchangeCodeForSession", args: code });
        return result();
      },
    },
  };
}

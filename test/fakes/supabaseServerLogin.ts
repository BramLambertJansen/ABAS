import { fakeBarLogin } from "./barLoginState.ts";

/**
 * Nep-vervanger van src/lib/supabase/server.ts voor test/barLogin.test.ts: de
 * cookie-gebonden server-client van de loginflow.
 */
export async function createClient() {
  const state = fakeBarLogin();
  return {
    auth: {
      async signInWithPassword(args: { email: string; password: string }) {
        state.signInCalls.push(args);
        if (state.signIn.error) return { data: { session: null }, error: state.signIn.error };
        return { data: { session: { access_token: state.signIn.accessToken } }, error: null };
      },
      async verifyOtp() {
        if (state.otp.error) return { data: { session: null }, error: state.otp.error };
        return { data: { session: { access_token: state.otp.accessToken } }, error: null };
      },
      async signOut(options: unknown) {
        state.signOuts.push(options);
        return { error: null };
      },
    },
  };
}

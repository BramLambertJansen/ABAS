import { fakeBarLogin } from "./barLoginState.ts";

/** Nep-`next/headers` voor test/barLogin.test.ts: alleen `cookies()`. */
export async function cookies() {
  const state = fakeBarLogin();
  return {
    get(name: string) {
      const value = state.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options: Record<string, unknown>) {
      state.cookieSets.push({ name, value, options });
      state.cookies.set(name, value);
    },
  };
}

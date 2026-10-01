/**
 * Gedeelde registratie voor test/barLogin.test.ts: wat de nep-clients
 * antwoorden en wat de loginflow vroeg. Op globalThis, zodat de test en de
 * via de resolve-hook geladen nep-modules zeker hetzelfde object zien (zelfde
 * vorm als authCalls.ts).
 */
export type FakeBarLogin = {
  /** Antwoorden per RPC-naam; een functie mag per aanroep verschillen. */
  rpc: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }>;
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  member: { id: string; role: string; archived: boolean; auth_user_id: string | null } | null;
  namen: { id: string; name: string; role: string }[];
  email: string | null;
  signIn: { error: { message?: string; code?: string; status?: number } | null; accessToken: string };
  otp: { error: { message: string } | null; accessToken: string };
  link: { token: string | null };
  signOuts: unknown[];
  signInCalls: { email: string; password: string }[];
  cookies: Map<string, string>;
  cookieSets: { name: string; value: string; options: Record<string, unknown> }[];
  resets: { email: string; redirectTo: string }[];
};

const KEY = "__abasFakeBarLogin";

function nieuw(): FakeBarLogin {
  return {
    rpc: {},
    rpcCalls: [],
    member: { id: "m1", role: "bardienst", archived: false, auth_user_id: "u1" },
    namen: [],
    email: "tom@example.nl",
    signIn: { error: null, accessToken: "" },
    otp: { error: null, accessToken: "" },
    link: { token: "hashed-token" },
    signOuts: [],
    signInCalls: [],
    cookies: new Map(),
    cookieSets: [],
    resets: [],
  };
}

export function fakeBarLogin(): FakeBarLogin {
  const holder = globalThis as unknown as Record<string, FakeBarLogin | undefined>;
  holder[KEY] ??= nieuw();
  return holder[KEY];
}

export function resetFakeBarLogin(): void {
  (globalThis as unknown as Record<string, FakeBarLogin>)[KEY] = nieuw();
}

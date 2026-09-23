/**
 * Gedeelde registratie voor de nep-modules in test/fakes/: wat de
 * callback-route aan Supabase Auth vroeg, en wat de nep-client antwoordt.
 * Op globalThis, zodat de test en de via de resolve-hook geladen
 * nep-modules zeker hetzelfde object zien.
 */
export type AuthCall =
  | { method: "verifyOtp"; args: { token_hash: string; type: string } }
  | { method: "exchangeCodeForSession"; args: string }
  | { method: "linkInvitedMemberAccount" };

export type FakeAuthState = {
  calls: AuthCall[];
  /** `null` = de auth-call slaagt; anders de foutmelding die hij teruggeeft. */
  nextError: string | null;
};

const KEY = "__abasFakeAuth";

export function fakeAuth(): FakeAuthState {
  const holder = globalThis as unknown as Record<string, FakeAuthState | undefined>;
  holder[KEY] ??= { calls: [], nextError: null };
  return holder[KEY];
}

export function resetFakeAuth(): void {
  const state = fakeAuth();
  state.calls = [];
  state.nextError = null;
}

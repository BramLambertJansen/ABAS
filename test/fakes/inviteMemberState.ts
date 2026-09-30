/**
 * Gedeelde registratie voor test/inviteMember.test.ts: wat de nep-clients
 * antwoorden en welke aanroepen de invite-actie deed, in volgorde. Op
 * globalThis, zodat de test en de via de resolve-hook geladen nep-modules
 * zeker hetzelfde object zien (zelfde vorm als barLoginState.ts).
 */
export type FakeInviteMember = {
  user: { id: string } | null;
  actor: { id: string; role: string } | null;
  member: { id: string; role: string; email: string | null; auth_user_id: string | null } | null;
  /** Antwoorden per RPC-naam van de sessie-gebonden client. */
  rpc: Record<string, { data?: unknown; error?: { message: string } | null }>;
  /** Alle aanroepen, in volgorde: `rpc:<naam>` of `inviteUserByEmail`. */
  calls: string[];
};

const KEY = "__abasFakeInviteMember";

function nieuw(): FakeInviteMember {
  return {
    user: { id: "u-beheerder" },
    actor: { id: "m-beheerder", role: "beheerder" },
    member: { id: "m-doel", role: "bardienst", email: "doel@example.nl", auth_user_id: null },
    rpc: {},
    calls: [],
  };
}

export function fakeInviteMember(): FakeInviteMember {
  const holder = globalThis as unknown as Record<string, FakeInviteMember | undefined>;
  holder[KEY] ??= nieuw();
  return holder[KEY];
}

export function resetFakeInviteMember(): void {
  (globalThis as unknown as Record<string, FakeInviteMember>)[KEY] = nieuw();
}

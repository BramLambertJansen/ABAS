/**
 * Gedeelde registratie voor test/productImage.test.ts: wat de nep-clients
 * antwoorden en welke aanroepen de server-actie deed, in volgorde. Op
 * globalThis, zodat de test en de via de resolve-hook geladen nep-modules
 * zeker hetzelfde object zien (zelfde vorm als inviteMemberState.ts).
 */
export type FakeProductImage = {
  user: { id: string } | null;
  actor: { id: string; role: string } | null;
  /** Fout van de actor-query (`members`), standaard geen. */
  actorError: { message: string } | null;
  /** Antwoorden per RPC-naam van de sessie-gebonden client. */
  rpc: Record<string, { data?: unknown; error?: { message: string } | null }>;
  uploadError: { message: string } | null;
  /** Fout per verwijderd pad (`storage.remove`). */
  removeError: Record<string, { message: string }>;
  /** Alle aanroepen, in volgorde: `rpc:<naam>`, `upload:<pad>`, `remove:<pad>`. */
  calls: string[];
  /** De argumenten per RPC-aanroep, in volgorde. */
  rpcArgs: { fn: string; args: unknown }[];
  /** Wat er geüpload werd, per pad. */
  uploads: Record<string, { body: Uint8Array; options: unknown }>;
};

const KEY = "__abasFakeProductImage";

function nieuw(): FakeProductImage {
  return {
    user: { id: "u-beheerder" },
    actor: { id: "m-beheerder", role: "beheerder" },
    actorError: null,
    rpc: {},
    uploadError: null,
    removeError: {},
    calls: [],
    rpcArgs: [],
    uploads: {},
  };
}

export function fakeProductImage(): FakeProductImage {
  const holder = globalThis as unknown as Record<string, FakeProductImage | undefined>;
  holder[KEY] ??= nieuw();
  return holder[KEY];
}

export function resetFakeProductImage(): void {
  (globalThis as unknown as Record<string, FakeProductImage>)[KEY] = nieuw();
}

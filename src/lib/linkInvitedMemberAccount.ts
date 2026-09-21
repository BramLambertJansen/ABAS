import type { createClient } from "@/lib/supabase/server";

/**
 * Roept `link_invited_member_account()` aan — docs/features/
 * lid-account-invite.md → "Koppelmechanisme bij acceptatie", RPC's punt 2;
 * ADR 0006 → Aanvulling. Uitsluitend aangeroepen vanuit
 * src/app/(bar)/beheer/callback/route.ts, ná een geslaagde
 * `exchangeCodeForSession()` — de route.ts zelf mag geen rechtstreekse
 * `supabase.rpc()`-aanroep bevatten (check:policy, ADR 0006 → Beslissing
 * punt 4). Neemt de al bestaande sessie-gebonden client als parameter aan
 * (in plaats van er zelf een nieuwe te maken via `createClient()`) — de
 * sessie die `exchangeCodeForSession()` net zette leeft in het geheugen van
 * die specifieke clientinstantie; een nieuwe `createClient()`-aanroep binnen
 * hetzelfde request zou de nog niet naar de response geschreven
 * sessie-cookies mogelijk niet terugzien.
 *
 * Best-effort, nooit blokkerend: elke fout wordt gelogd, nooit gegooid —
 * deze RPC draait op elke geslaagde /beheer-login, niet alleen
 * invite-acceptaties, en mag de bestaande redirect-flow nooit verstoren.
 */
export async function linkInvitedMemberAccount(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  const { error } = await supabase.rpc("link_invited_member_account");

  if (error) {
    console.error("linkInvitedMemberAccount:", error.message);
  }
}

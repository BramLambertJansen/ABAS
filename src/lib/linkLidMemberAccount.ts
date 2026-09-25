import type { createClient } from "@/lib/supabase/server";

/**
 * Roept `link_lid_member_account()` aan — docs/features/portal-login.md →
 * "Ledenkoppeling voor rol `lid`", analoog aan `linkInvitedMemberAccount.ts`.
 * Uitsluitend aangeroepen vanuit `src/app/auth/callback/route.ts`, ná een
 * geslaagde sessie-uitwisseling — samen met, en onafhankelijk van, het
 * bestaande `linkInvitedMemberAccount()` (beide worden altijd allebei
 * geprobeerd, ongeacht `?next=`, zie de spec → Schermflow → `/auth/callback`
 * — `next` is alleen een UX-vertakking, geen autorisatiebeslissing; elke RPC
 * bepaalt zelf, via zijn eigen harde `role`-filter, of er iets te koppelen
 * valt).
 *
 * Neemt de al bestaande sessie-gebonden client als parameter aan — dezelfde
 * client waarmee `/auth/callback` de sessie zojuist uitwisselde
 * (`server.ts` bij `next=bar`, `portalServer.ts` bij `next=portal`; het type
 * hier verwijst naar `server.ts` puur voor de vorm — beide clients zijn
 * structureel identiek, `@supabase/ssr`'s `createServerClient()` zonder
 * generics, zie ADR 0009 → Aanvulling). Een nieuwe `createClient()`-aanroep
 * binnen hetzelfde request zou de nog niet naar de response geschreven
 * sessie-cookies mogelijk niet terugzien.
 *
 * Best-effort, nooit blokkerend: elke fout wordt gelogd, nooit gegooid —
 * deze RPC draait op elke geslaagde `/auth/callback`-aanroep, niet alleen
 * verse portal-invite-acceptaties, en mag de bestaande redirect-flow nooit
 * verstoren.
 */
export async function linkLidMemberAccount(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  const { error } = await supabase.rpc("link_lid_member_account");

  if (error) {
    console.error("linkLidMemberAccount:", error.message);
  }
}

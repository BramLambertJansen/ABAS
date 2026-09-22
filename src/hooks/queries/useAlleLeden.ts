"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** A row from `members`, projected for ledenbeheer — eigen hook, geen
 *  uitbreiding van useMembers() (zie docs/features/ledenbeheer.md →
 *  Leeshook): useMembers() is gebouwd voor de verkoop-ledenzoeker (alleen
 *  niet-gearchiveerde leden, geen role/archived-veld). Ledenbeheer heeft het
 *  tegenovergestelde nodig — elk lid, archived of niet, mét role en
 *  archived — vandaar een eigen type in plaats van MemberOption. */
export type LedenbeheerLid = {
  id: string;
  name: string;
  role: "lid" | "bardienst" | "beheerder";
  balanceCents: number;
  archived: boolean;
  /** `auth_user_id is not null` — heeft dit lid een gekoppeld
   *  wachtwoordaccount. Alleen-lezen weergaveveld voor
   *  `LidBeherenOverlay.tsx`'s "Inloggegevens"-sectie
   *  (docs/features/auth-methode-per-lid.md → Datamodel) — geschreven wordt
   *  dit veld nooit via deze hook of overlay, alleen handmatig (Supabase
   *  Studio) of door het lid zelf (self-service e-mailkoppeling, buiten
   *  scope, zie de spec). */
  hasAccount: boolean;
  /** `has_pin` (`pin_hash is not null`, generated column,
   *  0010_pin_hash_kolombeveiliging.sql) — heeft dit lid een
   *  PIN-snelkoppeling aan staan. Alleen-lezen, zelfde reden als hasAccount
   *  — de schrijfactie is zelfbediening via `set_own_pin` ("Mijn account"),
   *  niet iets een beheerder hier namens dit lid doet. De ruwe `pin_hash`-
   *  kolom zelf is column-level REVOKEd voor `authenticated` en wordt hier
   *  niet meer gelezen. */
  hasPin: boolean;
  /** `members.email` (0008_ledenbeheer_email.sql) — PII, alleen leesbaar
   *  via `list_members_admin()` (ADR 0004 → PII-kolommen,
   *  0009_ledenbeheer_email_rpc_gated_read.sql), niet via een directe
   *  select. */
  email: string | null;
  /** `members.invited_at` (0012_lid_account_uitnodigen.sql) — ISO-timestamp
   *  van de laatste geslaagde handmatige invite, of `null` als er nog nooit
   *  een is verstuurd. Geen PII (docs/features/lid-account-invite.md →
   *  Datamodel), gebruikt door `LidBeherenOverlay.tsx`'s statusregel/
   *  knoplabel. */
  invitedAt: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; members: LedenbeheerLid[] };

/** Foutcodes die `list_members_admin()` zelf gooit (0009/0011/0012) —
 *  dezelfde twee die elke andere ADR-0002-actorcheck in deze codebase
 *  gebruikt. Zonder deze mapping viel een rechtenweigering samen met een
 *  netwerkfout in één generieke "controleer de verbinding"-melding, wat de
 *  verkeerde oorzaak aanwijst: een bardienst-lid dat via ModusKeuze op de
 *  Beheer-tegel klikt (ADR 0003 → Beslissing 4 filtert die tegel bewust
 *  niet op rol) komt hier gegarandeerd op `no_admin_role` uit, en ging op
 *  die melding zijn wifi controleren. De schrijf-hooks in deze map mapten
 *  deze codes al wél — zie useUpdateMemberName.ts e.a., en
 *  LidBeherenOverlay.tsx voor dezelfde copy. */
function errorMessageFor(rpcErrorMessage: string | undefined): string {
  switch (rpcErrorMessage) {
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    default:
      return "Kan de ledenlijst niet laden. Controleer de verbinding.";
  }
}

/** Elk lid (archived of niet — anders is een gearchiveerd lid niet terug te
 *  vinden om terug te zetten), alfabetisch op naam. Writes gaan via
 *  create_member/update_member_name/set_member_archived/set_member_role,
 *  nooit een directe insert/update — `members` is REVOKEd voor
 *  `authenticated` sinds 0001_init.sql.
 *
 *  Lezen via de `list_members_admin()`-RPC, geen directe
 *  `.from("members").select(...)` (ADR 0004, docs/features/
 *  ledenbeheer-email.md → RPC's): `members.email` is PII en sinds
 *  migratie 0009 column-level REVOKEd voor `authenticated` — de brede
 *  `members_select`-policy geldt voor élke ingelogde sessie, inclusief de
 *  gedeelde bar-tablet-sessie, dus een directe select zou de kolom niet meer
 *  teruggeven. De RPC draait `security definer` met een beheerder-
 *  actorcheck en sorteert zelf al op naam.
 *
 *  `pin_hash` komt niet mee in de respons: `list_members_admin()` selecteert
 *  sinds 0011_list_members_admin_pin_hash_scrub.sql een expliciete
 *  kolommenlijst met `null::text as pin_hash` op die positie. Dat wás een
 *  restbeperking — een `security definer`-functie is niet onderhevig aan de
 *  column-level REVOKEs uit 0009/0010, dus het oorspronkelijke `select *
 *  from members` gaf de ruwe bcrypt-hash terug aan elke beheerder-sessie die
 *  de Ledentab opende. Sinds 0011 is dat aan de bron dicht, niet alleen in
 *  de mapping hieronder. (Deze alinea beschreef die restbeperking nog als
 *  open; gecorrigeerd bij de app-review van 2026-09-21.) */
export function useAlleLeden(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_members_admin");

      if (error) {
        // Niet `throw error`: een PostgrestError is een plain object, geen
        // Error-instantie, dus in de catch hieronder zou `err.message`
        // (en daarmee de foutcode) niet meer typeveilig te bereiken zijn
        // en zou elke rechtenweigering als verbindingsfout eindigen.
        // Zelfde vorm als de schrijf-hooks in deze map, die de
        // `error`-tak ook naast de catch afhandelen.
        console.error("useAlleLeden:", error);
        setState({ status: "error", message: errorMessageFor(error.message) });
        return;
      }

      const members: LedenbeheerLid[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        name: row.name as string,
        role: row.role as LedenbeheerLid["role"],
        balanceCents: row.balance_cents as number,
        archived: row.archived as boolean,
        hasAccount: row.auth_user_id !== null,
        hasPin: row.has_pin as boolean,
        email: row.email as string | null,
        invitedAt: row.invited_at as string | null,
      }));

      setState({ status: "ready", members });
    } catch (err) {
      // Alles wat hier belandt is een echte throw (createClient() zonder
      // Supabase-config, netwerkfout) — geen RPC-foutcode, die is hierboven
      // al afgehandeld. Nooit de rauwe fout tonen op een bar-tablet: loggen
      // voor wie debugt, vaste Nederlandse boodschap, zelfde patroon als
      // useMembers/useAlleProducten.
      console.error("useAlleLeden:", err);
      setState({
        status: "error",
        message: errorMessageFor(undefined),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}

# 0007 — Een sessie met rol `lid` leest alleen de eigen rijen; de brede select-policy geldt alleen nog voor bar- en device-sessies

Status: **gebouwd**

Toelichting: **geïmplementeerd** (app-review 2026-09-21, migratie
`0015_lid_leest_alleen_eigen_rijen.sql`, negatieve tests in
`supabase/tests/rls_lid_eigen_rijen.test.sql`). Besloten door Bram bij die
review, inclusief de reikwijdte (welke tabellen wel en niet). Vult ADR 0004
aan — dat deed hetzelfde voor één PII-kolom, dit doet het voor hele rijen —
en vervangt niets.

**Deels vervangen (2026-10-05) door
[ADR 0019](0019-leestoegang-is-een-allowlist-op-actieve-bar-rol.md):**
Beslissing 1 ("strikt beperkend", de `not caller_is_lid()`-tak voor elke
niet-lid-sessie) en de alinea over `archived` gelden niet meer. Brede
leestoegang is een allowlist op een actieve bar-rol (`caller_has_bar_role()`);
een account zonder lid ziet niets, een gearchiveerde bar-rol alleen de eigen
rijen. Reikwijdte (punt 3), gastverkoop (punt 4) en de `SECURITY DEFINER`-
helpers (punt 2) blijven staan.

## Context

`0001_init.sql` gaf elke tabel een select-policy van de vorm
`to authenticated using (true)`, met een expliciete motivering erbij:

> Read access: single-tenant, so any authenticated session (today: the one
> per-tablet device account) can read everything. Tighten per-row (e.g. a
> portal member reading only their own row) when the portal shell is
> actually specced — not yet.

Die redenering klopte toen. De enige accounts die bestonden waren de
gedeelde bar-tablet-device-sessie en, later, de individuele
bardienst/beheerder-sessies van ADR 0002/0003. Geen van die drie soorten
sessies hoort iets *niet* te zien: het verkoopscherm leest per definitie
alle leden (de ledenzoeker), alle producten en alle bestellingen van de
lopende dienst.

Wat sindsdien veranderde, is dat de machinerie om een lid wél een eigen
account te geven inmiddels bestaat. `0012_lid_account_uitnodigen.sql` bracht
`members.invited_at`, `mark_member_invite_sent` en
`link_invited_member_account`; `src/app/(bar)/beheer/callback/route.ts`
koppelt een geaccepteerde uitnodiging aan `members.auth_user_id`. Dat pad
staat vandaag alleen open voor `bardienst`/`beheerder`, maar die beperking
leeft in applicatiecode — één `eligible`-conditie in
`src/lib/inviteMember.ts` (regel ~113), niet in de database.

Daarmee stond er nog precies één regel TypeScript tussen "gedeferd" en "elk
lid met een account leest elk saldo, elke bestelling en elke opwaardering
van de hele vereniging". Dat is te weinig marge voor iets wat CLAUDE.md →
Domein niet als implementatiedetail maar als domeinregel formuleert:

> **Lid** — ziet eigen saldo en transacties. Verder niets.

De directe aanleiding was de app-review van 2026-09-21, niet een incident:
er is vandaag geen enkel `lid`-account in productie, dus er is nooit iets
gelekt.

## Beslissing

De vier geldgerelateerde select-policies worden herschreven naar de vorm:

```sql
using (not caller_is_lid() or <de eigen rij>)
```

met drie `SECURITY DEFINER STABLE`-helpers — `caller_member_id()`,
`caller_is_lid()` en `caller_owns_order()` — in
`0015_lid_leest_alleen_eigen_rijen.sql`.

Vier eigenschappen van die vorm zijn de beslissing, niet de implementatie:

1. **Strikt beperkend, nul gedragswijziging vandaag.** Alleen een aanroeper
   die daadwerkelijk naar een `members`-rij met rol `lid` herleidt wordt
   beperkt. Een bardienst/beheerder-sessie en de device-sessie (die
   überhaupt geen `members`-rij heeft) vallen in de `not caller_is_lid()`-tak
   en zien exact wat ze eerder zagen. Geen bestaande hook, RPC of e2e-flow
   verandert van gedrag — vastgelegd in de blokken 2 en 3 van
   `supabase/tests/rls_lid_eigen_rijen.test.sql`.

2. **`SECURITY DEFINER` is hier geen keuze maar een noodzaak.** Een policy
   óp `members` die zelf `members` bevraagt om de rol van de aanroeper te
   bepalen roept zichzelf op; Postgres weigert zo'n query met 42P17
   (infinite recursion). Een `SECURITY DEFINER`-functie draait als de
   tabel-eigenaar en is daarmee niet onderhevig aan RLS op `members`, wat de
   recursie breekt. Zelfde mechanisme als `is_shift_member` (0001) al
   binnen `place_order`/`top_up` gebruikt.

3. **Reikwijdte: `members`, `orders`, `order_lines`, `top_ups`.**
   `shifts`/`shift_members` blijven ook voor een lid leesbaar — wie welke
   dienst draaide is binnen de vereniging geen privégegeven — en
   `products`/`app_settings` sowieso: de prijslijst en de saldolimiet zijn
   publiek binnen de club, en de portal heeft ze straks nodig om überhaupt
   iets te kunnen tonen. Die drie uitzonderingen zijn een expliciete keuze
   van Bram, geen restant; ze staan als assertie in de testsuite zodat een
   latere dichtzetting een zichtbare beslissing is en geen stille regressie.

4. **Een gastverkoop (`orders.member_id is null`) hoort bij niemand** en is
   daarmee voor géén enkel lid zichtbaar. Volgt gratis uit de
   `member_id = caller_member_id()`-vergelijking (`null = null` is nooit
   waar), maar staat als eigen assertie in de suite omdat het gedrag anders
   alleen per ongeluk klopt.

`caller_is_lid()` eist bewust géén `not archived`, in tegenstelling tot de
actorcheck in de beheerder-RPC's: een gearchiveerd lid dat nog een sessie
heeft moet de eigen historie kunnen inzien. Zou `archived` hier meetellen,
dan zou zo'n lid juist uit de beperkende tak vallen en méér gaan zien.

## Reikwijdte van deze beslissing

Dit ADR gaat **niet** over het afschermen van de gedeelde
bar-tablet-device-sessie. Die houdt volle leestoegang, en dat is gewenst
gedrag: het hele verkoopscherm hangt eraan. Het afschermen daarvan hangt aan
[#15](https://github.com/BramLambertJansen/ABAS/issues/15) (portal-login),
samen met de al eerder genoteerde cookie-scoping — zie
`docs/ARCHITECTURE.md` → "Deferred: device cookie isn't scoped away from
`shells/portal`". Wie de device-credentials heeft, heeft nog steeds alles.

Het gaat ook niet over schrijven: `members`/`orders`/`order_lines`/`top_ups`
zijn sinds 0001 blanket-`REVOKE`d voor `authenticated`, en elke mutatie loopt
al via een RPC met een eigen actorcheck. Er is geen insert/update/delete-pad
dat deze policies zouden moeten afdekken.

## Gevolgen

- De portal (#15) begint met een database die de domeinregel al afdwingt, in
  plaats van met een migratie die eerst nog geschreven moet worden onder
  tijdsdruk van een feature die live moet.
- Een toekomstige lees-hook voor de portal hoeft geen eigen RPC te zijn om
  veilig te zijn: een gewone `.from("orders").select(...)` geeft een lid
  vanzelf alleen de eigen rijen. Dat is een andere keuze dan ADR 0004 maakte
  voor `members.email`, en om een andere reden: daar ging het om één kolom
  die zelfs de bar-sessie niet mag zien, hier om hele rijen waarvan de
  zichtbaarheid van de rol van de aanroeper afhangt.
- Drie nieuwe functies in `public` die door een policy worden aangeroepen.
  `authenticated` heeft `EXECUTE` nodig (een policy-expressie wordt met de
  rechten van de aanroeper geëvalueerd), dus de grant hoort bij de migratie
  en niet bij de aanroepende code.
- `supabase/tests/rls_lid_eigen_rijen.test.sql` is het eerste testbestand in
  deze repo dat een *lees*-policy toetst in plaats van een `REVOKE` of een
  RPC-actorcheck. Dat vereist `set local role authenticated`: RLS-policies
  worden voor een superuser helemaal niet geëvalueerd, dus zonder rolwissel
  zou elke assertie slagen, ook met de policies verwijderd. Dat patroon is
  nieuw en bedoeld om hergebruikt te worden zodra er meer leespolicies zijn.

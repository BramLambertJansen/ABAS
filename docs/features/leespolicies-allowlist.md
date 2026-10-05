# Leespolicies als allowlist: brede leestoegang alleen voor een actieve bar-rol

**Status: gebouwd (PR #156, migratie `0039`, gemerged 2026-10-05).** Bram heeft de keuzes voor deze opdracht
bij de Architect gelegd: de spec geldt als goedgekeurd zodra hij geschreven
is, en elke keuze staat hieronder met reden. Item A van de review van
2026-10-05. Architectuurbeslissing:
[ADR 0019](../adr/0019-leestoegang-is-een-allowlist-op-actieve-bar-rol.md).

## Aanleiding (geverifieerd in de code)

- `0015_lid_leest_alleen_eigen_rijen.sql:122-152` (`members_select`,
  `orders_select`, `order_lines_select`, `top_ups_select`) en
  `0020_bestelling_terugdraaien.sql:43-47` (`order_reversals_select`)
  gebruiken `not caller_is_lid() or <eigen rij>`.
- `caller_is_lid()` (`0015:70`) is onwaar als er geen `members`-rij bij
  `auth.uid()` hoort. Elk `authenticated`-account zonder gekoppeld lid
  (verkeerd uitgenodigd adres, self-signup via de portal, oud device-account)
  leest daardoor alle namen, saldi, bestellingen, bestelregels,
  opwaarderingen en terugdraaiingen.
- `caller_is_lid()` negeert `archived`. Een gearchiveerde bardienst of
  beheerder valt in de brede tak; de portal-login blijft werken, dus zo'n lid
  leest nog alles.
- De rechtvaardiging, de gedeelde device-sessie zonder `members`-rij, is
  sinds ADR 0016 (`0027`) vervallen.
- `supabase/tests/rls_lid_eigen_rijen.test.sql:248-268` ("Blok 3") legt het
  gat vast als gewenst gedrag.

Overige plekken waar `caller_is_lid()` als denylist werd gebruikt:

- De zes bar-RPC's uit `0023` (`if caller_is_lid() then raise`). Alle zes zijn
  in `0029` opnieuw gedefinieerd met `require_shift_session` en zonder
  `caller_is_lid()`. **Hier hoeft niets.** Na `0039` gebruikt geen enkele
  functie of policy de helper nog.
- `bar_sessions_select`, `shift_sessions_select` en
  `admin_notifications_select` (`0027:177-206`) zijn al een allowlist (rol,
  `not archived`) en dienen als voorbeeld. Ze gebruiken een subquery op
  `members` voor de eigen rij; die blijft na `0039` zichtbaar via de
  eigen-rij-tak van `members_select`, dus ze blijven werken. **Hier hoeft
  niets** (zie Buiten scope).
- RPC's die als `SECURITY DEFINER` lezen (`list_own_transactions`,
  `list_members_admin`, `my_bar_state`, alle bar- en beheer-RPC's) worden
  niet door RLS geraakt.

## Doel

Een account leest uit `members`, `orders`, `order_lines`, `top_ups` en
`order_reversals` alleen nog wat het nodig heeft:

| Aanroeper | Ziet |
|---|---|
| Actieve bardienst of beheerder (gekoppeld, niet gearchiveerd) | alles, zoals nu |
| Lid (ook gearchiveerd) | eigen rijen, zoals nu |
| Gearchiveerde bardienst of beheerder | **eigen rijen** (was: alles) |
| Account zonder gekoppelde `members`-rij | **niets** (was: alles) |

## Betrokken shell

Geen UI-wijziging. Alleen database (migratie `0039`) en tests.

- `shells/bar`: een actieve bardienst/beheerder ziet exact wat hij nu ziet.
  Een gearchiveerde bar-rol kon de bar al niet gebruiken (`require_session`
  → `no_bar_role`; `set_member_archived` beëindigt de bar-sessies, `0029`).
- `shells/portal`: alle portal-leeshooks filteren al expliciet op de eigen
  rij (ADR 0012 → Beslissing 2: `usePortalSession`, `usePortalBalance`,
  `usePortalProfiel` op `auth_user_id`; `usePortalTransactions` via
  `list_own_transactions()` plus een afgeleide `order_lines`-read op eigen
  order-id's). Die blijven werken via de eigen-rij-tak, voor elke rol en ook
  gearchiveerd.
- Server-side actorchecks met de sessieclient (`src/lib/inviteMember.ts`,
  `src/lib/productImage.ts`) en `useBeheerSession.ts` lezen alleen de eigen
  `members`-rij (`.eq("auth_user_id", user.id)`), dus die werken onveranderd.
  `src/lib/barLogin.ts` leest met de service-role-client en wordt niet
  geraakt.

## Geldlaag en attributie

Raakt de geldlaag niet. Geen RPC wijzigt, geen bedrag, geen `served_by`. Het
gaat alleen om leesrechten op geldtabellen. Schrijven blijft
blanket-`REVOKE`d (`0001`, `0020`); de twee kernbeslissingen (geld alleen via
RPC, attributie via de bezetting) blijven ongewijzigd.

## Keuzes

### 1. Allowlist op rol + niet gearchiveerd, géén actieve bar-sessie vereist

De brede tak vraagt een gekoppelde `members`-rij met rol `bardienst` of
`beheerder` en `not archived`: dezelfde rol- en archiefcheck als
`require_session` (`0028`).

Ik eis **geen** actieve `bar_sessions`-rij. Redenen:

- Een lezing raakt de hartslag niet. Met een sessie-eis zou een barscherm na
  60 minuten inactiviteit stil lege lijsten tonen in plaats van een fout. De
  bar handelt nu `session_inactive` af als RPC-fout; lege SELECT-resultaten
  zijn geen fout. Dat vraagt een eigen UX-beslissing.
- Het raakt elke bar- en beheer-leeshook en vraagt per scherm een
  gedragsanalyse. De opdracht is: houd het klein.
- Het restgat (een geldig access token na afmelden/inactiviteit, en de
  portal-sessie van een bar-rol die via RLS breed leest) hoort bij het
  aparte, latere item "JWT na afmelden". Een sessie-gebonden allowlist is
  sinds `0027` technisch mogelijk (de `session_id`-claim staat in
  `bar_sessions.auth_session_id`). Die optie staat in ADR 0019 → Verworpen
  alternatieven, zodat dat item er direct op kan voortbouwen.

### 2. De eigen-rij-tak geldt voor iedereen, niet alleen voor `lid`

Een gearchiveerd lid, een gearchiveerde bardienst/beheerder en een lid dat
van bardienst naar `lid` ging, zien hun eigen historie in de portal. Dat was
de bedoeling van ADR 0007 (`0015:65-69`) en de portal-gate laat gearchiveerde
leden al toe (ADR 0012). De eigen rij is per tabel ongewijzigd ten opzichte
van `0015`/`0020`:

- `members`: `auth_user_id = auth.uid()`
- `orders`, `top_ups`: `member_id = caller_member_id()` (gastverkoop,
  `member_id is null`, blijft voor niemand zichtbaar)
- `order_lines`, `order_reversals`: `caller_owns_order(order_id)`

Een bardienst ziet in de eigen-rij-tak **niet** de bestellingen die hij zelf
bediende (`served_by`). Niemand heeft dat nodig: een gearchiveerde bar-rol
heeft geen bar-functie meer.

### 3. Eén nieuwe helper `caller_has_bar_role()`, `SECURITY DEFINER STABLE`

Zelfde vorm en reden als de helpers uit `0015`: een policy op `members` kan
`members` niet zelf bevragen (42P17), en vijf policies laten afhangen van wat
`members_select` toevallig toelaat is fragiel (`0015:86-91`). Parameterloos en
`STABLE`. Een `STABLE` functie in een policy-qual wordt nog steeds per rij
aangeroepen; de policies schrijven de aanroep daarom als
`(select caller_has_bar_role())`, zodat Postgres hem als initplan één keer per
statement evalueert. Geen guard: de helper zegt
alleen iets over de aanroeper zelf, net als `caller_member_id()`.

### 4. `caller_is_lid()` wordt gedropt

Na `0039` gebruikt niets haar nog. Een helper waarvan de enige zinnige
toepassing de denylist-vorm is, nodigt uit tot hergebruik. `caller_member_id()`
en `caller_owns_order()` blijven: die gebruiken de nieuwe policies en
`list_own_transactions`.

### 5. Een gate in plaats van een regel in CLAUDE.md

"Leespolicies zijn een allowlist" is een terugkerende regel voor elke nieuwe
tabel. Volgens CLAUDE.md → "Regel over regels" hoort hij in een gate. Een
pgTAP-test op `pg_policies` is betrouwbaar (de werkelijke policy-expressie,
geen regex over migraties waarin de oude vorm historisch blijft staan) en past
naast `rpc_catalogus` in `db:test`.

### 6. Globale tabellen blijven `using (true)`

`products`, `app_settings`, `shifts`, `shift_members`, `activity_types` blijven
voor elk `authenticated`-account leesbaar, ook zonder gekoppeld lid. ADR 0007 →
Reikwijdte is een expliciete keuze van Bram, en deze tabellen bevatten geen
namen of bedragen per lid: `shifts`/`shift_members` alleen uuid's en
tijdstippen, die zonder `members` niets over een persoon zeggen. Ze dichtzetten
voor ongekoppelde accounts is mogelijk, maar wijzigt een eerdere beslissing van
Bram zonder aanleiding uit deze bevinding. De gate legt de lijst vast, zodat
een uitbreiding een zichtbare keuze is.

## Datamodel

Geen tabel- of kolomwijziging.

## Migratie `0039_leespolicies_allowlist.sql`

De volgorde is van belang: eerst de nieuwe helper, dan de policies vervangen,
dan pas `caller_is_lid()` droppen. Postgres registreert de afhankelijkheid van
een policy op een functie, dus de drop faalt als er nog een policy naar
verwijst. Dat is gewenst: geen `cascade`.

```sql
-- Leespolicies van denylist naar allowlist (docs/features/leespolicies-allowlist.md,
-- ADR 0019). Kop: waarom, verwijzing naar 0015/0020 en de vervallen
-- device-sessie-rechtvaardiging (ADR 0016).

create or replace function caller_has_bar_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid()
      and not archived
      and role in ('bardienst', 'beheerder')
  );
$$;

comment on function caller_has_bar_role() is
  'True als de aanroepende sessie naar een niet-gearchiveerde members-rij met rol bardienst of beheerder herleidt. Allowlist voor de brede tak van de leespolicies (ADR 0019); dezelfde rol- en archiefcheck als require_session. Eist geen actieve bar-sessie.';

grant execute on function caller_has_bar_role() to authenticated;
revoke execute on function caller_has_bar_role() from public;
revoke execute on function caller_has_bar_role() from anon;

drop policy members_select on members;
create policy members_select on members for select to authenticated
  using ((select caller_has_bar_role()) or auth_user_id = auth.uid());

drop policy orders_select on orders;
create policy orders_select on orders for select to authenticated
  using ((select caller_has_bar_role()) or member_id = caller_member_id());

drop policy order_lines_select on order_lines;
create policy order_lines_select on order_lines for select to authenticated
  using ((select caller_has_bar_role()) or caller_owns_order(order_id));

drop policy top_ups_select on top_ups;
create policy top_ups_select on top_ups for select to authenticated
  using ((select caller_has_bar_role()) or member_id = caller_member_id());

drop policy order_reversals_select on order_reversals;
create policy order_reversals_select on order_reversals for select to authenticated
  using ((select caller_has_bar_role()) or caller_owns_order(order_id));

drop function caller_is_lid();

-- Comment van caller_member_id() bijwerken: noemt nog "de gedeelde
-- bar-tablet-device-sessie".
comment on function caller_member_id() is
  'members.id van de aanroepende sessie, of null voor een sessie zonder gekoppeld lid. Voor RLS-policies en zelf-scopende RPC''s (list_own_transactions); RPC''s met een actor doen hun eigen, strengere check (ADR 0002, require_session).';
```

De policynamen blijven gelijk, zodat `check:rls` en de bestaande tests ze
blijven vinden. De `pin_hash`- en `email`-kolom-REVOKEs (`0009`/`0010`) blijven
daarbovenop gelden.

## RPC's

Geen nieuwe of gewijzigde RPC. `caller_has_bar_role()` is een RLS-helper
(klasse `client`, guardvrij), geen RPC voor de app.

## Rolzichtbaarheid

Zie de tabel onder Doel. In het kort: brede leestoegang heeft alleen een
actieve bardienst/beheerder (in elke sessie, ook de portal: ADR 0012
Beslissing 2 blijft dus nodig). Iedereen anders ziet eigen rijen, en een
account zonder lid ziet niets.

## Randgevallen

- **Rolwijziging of archivering tijdens een open sessie.** De helper leest de
  rol per statement. Het volgende statement na `set_member_role(…, 'lid')` of
  `set_member_archived(…, true)` ziet alleen nog eigen rijen. Geen cache, geen
  JWT-claim.
- **Gearchiveerde bar-rol met een nog geldig bar-token.** De bar-sessie is bij
  archiveren al beëindigd (`0029`), de RPC's weigeren (`no_bar_role`). Reads
  geven nu ook alleen nog eigen rijen. De barschermen zijn voor dat lid toch al
  dicht.
- **Account zonder lid op `/portal` of `/beheer`.** Krijgt al `denied`, omdat
  de eigen-rij-lookup niets vindt. Onveranderd.
- **Lid met een `auth_user_id` dat naar een verwijderd auth-account wijst.**
  Niet bereikbaar: zonder auth-account geen sessie.
- **Gastverkoop** (`orders.member_id is null`). Alleen zichtbaar voor een
  actieve bar-rol, zoals nu.
- **Uitnodiging nog niet gekoppeld** (auth-account bestaat, `members.auth_user_id`
  nog leeg). Ziet niets tot `link_invited_member_account`/`link_lid_member_account`
  (`SECURITY DEFINER`, niet geraakt door RLS) heeft gekoppeld. Daarna eigen rijen
  of, bij een bar-rol, alles.
- **Performance.** `caller_has_bar_role()` is parameterloos en `STABLE`, en
  wordt in de policies als `(select caller_has_bar_role())` aangeroepen: een
  initplan, één keer per statement in plaats van per rij.

## Tests

### `supabase/tests/rls_lid_eigen_rijen.test.sql` (aanpassen)

Kop bijwerken: de alinea "Wat hier bewust *niet* getoetst wordt: de gedeelde
bar-tablet-device-sessie afschermen" vervalt; noem ADR 0019 en `0039`.

Fixtures erbij (zelfde vorm als de bestaande):

- auth-user `…02a4` met members-rij `…02b4` "RLS Gearchiveerde Bardienst",
  rol `bardienst`, `archived = true`;
- auth-user `…02a5` met members-rij `…02b5` "RLS Beheerder", rol `beheerder`,
  `archived = false`;
- een bestelling `…02e3` van `…02b4` (served_by `…02b2`, shift `…02d0`), een
  bestelregel daarop, een terugdraaiing daarvan, en een opwaardering naar
  `…02b4`. Zo heeft de gearchiveerde bardienst in alle vijf tabellen een eigen
  rij, en is "ziet alleen eigen" te onderscheiden van "ziet niets";
- auth-user `…02a6` met members-rij `…02b6` "RLS Gearchiveerde Beheerder",
  rol `beheerder`, `archived = true`, zonder eigen bestellingen (toegevoegd
  door de Tester voor blok 5);
- `…02a3` blijft het account zonder `members`-rij; het commentaar wordt
  "account zonder gekoppeld lid (verkeerd uitgenodigd, self-signup, oud
  device-account)".

Referentietotalen erbij: `abas.n_order_lines`, en de `n_*_gearch`-aantallen
voor `…02b4` in de vier tabellen met een `member_id`-relatie (zelfde vorm als
`n_*_lid_a`).

Blokken:

| Blok | Aanroeper | Asserties | Aantal |
|---|---|---|---|
| 1 | lid A | ongewijzigd | 10 |
| 2 | actieve bardienst `…02a2` | alle vijf tabellen = tabeltotaal (`order_lines` is nieuw). Kopcommentaar: "actieve bar-rol: brede tak van de allowlist" | 5 |
| 2b (nieuw) | actieve beheerder `…02a5` | alle vijf tabellen = tabeltotaal | 5 |
| 3 (omgedraaid) | account zonder lid `…02a3` | `members`, `orders`, `order_lines`, `top_ups`, `order_reversals` = **0**; `shifts` en `products` = tabeltotaal (globaal, keuze 6) | 7 |
| 4 (nieuw) | gearchiveerde bardienst `…02a4` | `members` = 1 en die rij heet "RLS Gearchiveerde Bardienst"; `orders`, `order_lines`, `top_ups`, `order_reversals` = eigen aantal; `orders where id = …02e0` (van lid A) = 0 | 7 |
| 5 (Tester) | gearchiveerde beheerder `…02a6` | `members` = 1; `orders`, `order_lines` = 0 (de archiefcheck geldt ook voor beheerder) | 3 |
| 6 (Tester) | bardienst `…02a2` na `role = 'lid'` | `members` = 1; `orders`, `top_ups` = 0, ook al staat `…02b2` nog in de bezetting van de open dienst (randgeval rolwijziging, geen cache) | 3 |
| 7 (Tester) | `anon` | som van de vijf tabellen = 0 (alle vijf policies zijn `to authenticated`) | 1 |

`plan(41)`. Blokken 5-7 zijn bij het testen toegevoegd; de spec noemde
oorspronkelijk blok 1-4 met `plan(34)`. Geen absolute aantallen voor "ziet alles" (zie de kop van het
bestand); "ziet niets" is wel absoluut 0, omdat dat een bewering is die door
geen enkele seed-rij verandert.

### `supabase/tests/rls_leespolicies.test.sql` (nieuw, de gate uit keuze 5)

Werkt op `pg_policies` waar `schemaname = 'public'` en `cmd in ('SELECT',
'ALL')`:

1. Geen policy waarvan `qual` matcht op `\mNOT\s+caller_` (hoofdletterongevoelig):
   "geen leespolicy met een denylist-tak (ADR 0019)".
2. De set tabellen met een select-policy waarvan `qual = 'true'` is exact
   `{activity_types, app_settings, products, shift_members, shifts}`: "nieuwe
   tabel met `using (true)`: is hij echt globaal? Zo ja, zet hem hier op de
   lijst, met reden (ADR 0019)".
3. Voor `members`, `orders`, `order_lines`, `top_ups` en `order_reversals`
   bevat de `qual` van elke select-policy `caller_has_bar_role()` (een
   `like`-match, dus de initplan-vorm `(select caller_has_bar_role())` telt
   mee).

`plan(3)`. Toets 3 vangt een latere migratie die één van de vijf per ongeluk
terugzet naar `true` of naar een andere vorm.

### `supabase/tests/rpc_catalogus.test.sql` (aanpassen)

Regel `('caller_is_lid', …)` vervangen door
`('caller_has_bar_role', 'client', 'RLS-helper: zegt alleen iets over de aanroeper zelf')`.
Test 1b ("de catalogus noemt geen functies die niet (meer) bestaan") faalt
anders.

### `supabase/tests/rpc_execute_grants.test.sql` (aanpassen)

De assertie op `public.caller_is_lid()` (regel ~117) wordt een assertie op
`public.caller_has_bar_role()`, met hetzelfde commentaar over waarom een
RLS-helper `EXECUTE` voor `authenticated` nodig heeft.

### Bestaande tests die moeten blijven slagen

`bar_sessies_rls.test.sql` (de subquery-policies uit `0027` lezen de eigen
`members`-rij), `list_own_transactions.test.sql`, `bar_rpcs_lid_en_device.test.sql`,
en de e2e-suite (portal `denied` voor een account zonder lid, bardienst op de
portal ziet alleen eigen data).

## Documentatie (door de Architect bij deze spec bijgewerkt)

- `docs/ARCHITECTURE.md` → "Leestoegang per rol": allowlist, verwijzing naar
  ADR 0019.
- ADR 0007: statusregel "Beslissing 1 en de `archived`-alinea vervangen door
  ADR 0019".
- ADR 0012: noot bij Beslissing 3 en bij het verworpen alternatief over
  sessie-onderscheid.

Voor de Developer bij de bouw:

- `src/hooks/queries/usePortalSession.ts` kopcommentaar (regels ~19-27) noemt
  `caller_is_lid()` en "een bardienst/beheerder-sessie leest via RLS álle
  `members`-rijen". Bijwerken naar ADR 0019: alleen een **actieve** bar-rol
  leest breed; de expliciete `auth_user_id`-filter blijft verplicht.
- `docs/ARCHITECTURE.md` → "Leestoegang per rol": "gebouwd" + PR-nummer
  toevoegen na merge (Docs). Gedaan: PR #156.

## Expliciet buiten scope

- **Leestoegang koppelen aan een actieve bar-sessie** en tokens na afmelden.
  Hoort bij het latere item "JWT na afmelden" (keuze 1, ADR 0019 → Verworpen
  alternatieven).
- **`shifts`, `shift_members`, `products`, `app_settings`, `activity_types`**
  dichtzetten voor ongekoppelde accounts (keuze 6).
- **`bar_sessions_select`/`shift_sessions_select`/`admin_notifications_select`
  omzetten naar de helper.** Ze zijn al een allowlist en werken onveranderd.
  Omzetten is cosmetisch, en `admin_notifications` vraagt dan een tweede
  helper (alleen beheerder).
- **Self-signup op de portal uitzetten** of ongekoppelde auth-accounts
  opruimen. Na deze wijziging lekken die accounts niets meer; opruimen is
  beheerwerk, geen beveiligingsgat.
- **Kolom-niveau-afscherming** (`balance_cents` voor bardienst). Ongewijzigd
  (CLAUDE.md → Domein: bardienst ziet saldi).

# Account koppelen alleen met bewijs van mailbezit

**Status: goedgekeurd (2026-10-05), nog niet gebouwd.** Bram heeft de keuzes
voor deze opdracht bij de Architect gelegd: de spec geldt als goedgekeurd
zodra hij geschreven is, en elke keuze staat hieronder met reden. Item B van
de review van 2026-10-05. Architectuurbeslissing:
[ADR 0020](../adr/0020-koppelen-eist-bewijs-van-mailbezit.md). Migratie
`0040`.

## Aanleiding (geverifieerd in de code)

- `link_invited_member_account()` (`0012_lid_account_uitnodigen.sql:121-194`)
  koppelt `members.auth_user_id = auth.uid()` voor de enige rij met
  `lower(email) = lower(auth.email())`, `auth_user_id is null` en
  `invited_at is not null`. Geen controle op `archived`, op
  `auth.users.email_confirmed_at`, of op welk auth-account de uitnodiging
  aanmaakte. Granted aan `authenticated`: rechtstreeks via PostgREST aan te
  roepen.
- `link_lid_member_account()` (`0022`): idem, plus `role = 'lid'`.
- `src/app/auth/callback/route.ts:91-92` roept beide aan na elke geslaagde
  uitwisseling; `src/app/(bar)/beheer/callback/route.ts:68` roept
  `link_invited_member_account` aan.
- `supabase/config.toml`: `enable_signup = true`, `enable_confirmations =
  false`. De portal doet `signInWithOtp` met `shouldCreateUser: true`. De
  instelling "Confirm email" op het gehoste project is onbekend; met die
  instelling uit geeft een wachtwoord-signup via de publieke anon-key direct
  een sessie met gevulde `email_confirmed_at`.
- **Aanval:** registreer het adres van een uitgenodigde, nog niet gekoppelde
  bardienst of beheerder met een eigen wachtwoord → roep
  `link_invited_member_account` aan → het lid hangt aan jouw account →
  `src/lib/barLogin.ts` logt in met jouw wachtwoord → eigen TOTP → beheer.
- `update_member_email` (laatste definitie `0029:840`) laat `invited_at`
  staan: na een adreswijziging is het nieuwe adres koppelbaar zonder dat er
  een uitnodiging heen ging.
- `src/lib/inviteMember.ts:157-163` stopt bij `email_exists` vóór
  `mark_member_invite_sent`; een lid dat al een eigen account had, kan nooit
  gekoppeld worden. Zie Buiten scope.

## Doel

Een `members`-rij krijgt alleen een `auth_user_id` als de sessie die koppelt:

1. via een link of code uit de mailbox tot stand kwam (`amr`);
2. van precies het auth-account is dat de uitnodiging aanmaakte;
3. een bevestigd adres heeft dat nog steeds gelijk is aan `members.email`;
4. van een account zonder wachtwoord is;

en het lid niet gearchiveerd is. Ongeacht de projectinstelling "Confirm
email".

## Betrokken shell(s)

Geen UI-wijziging, geen nieuwe tekst.

- **Beide shells, via de gedeelde callback.** `/auth/callback` en
  `/beheer/callback` blijven ongewijzigd; de RPC's die ze aanroepen worden
  strenger. Een uitgenodigd lid dat de link in de uitnodigingsmail opent,
  merkt geen verschil.
- **`shells/bar`, Ledenbeheer.** De beheerder ziet niets nieuws. Een
  uitnodiging voor een gearchiveerd lid wordt een no-op (`invited: false`),
  zoals nu al voor een lid zonder adres.

## Geldlaag en attributie

Raakt de geldlaag niet: geen geld-RPC, geen bedrag, geen `served_by`. Raakt
wel wie überhaupt een sessie aan een lid kan hangen, en daarmee wie in de
bezetting kan staan en een PIN kan instellen. Deze spec maakt dat strenger,
nooit ruimer. "Attributie alleen via de bezetting" blijft ongewijzigd; geen
uitzondering.

## Keuzes

### 1. `amr` is het bewijs, niet `email_confirmed_at`

Met "Confirm email" uit zet Supabase `email_confirmed_at` bij elke signup,
dus die kolom alleen bewijst niets. Het JWT bevat `amr`: een array van
`{method, timestamp}` die Supabase Auth per sessie vastlegt en ondertekent.
Toegestaan: `invite`, `magiclink`, `otp`, `email/signup`. Elk van die
methoden vraagt een token uit een mail aan dit adres. De drie callback-paden
leveren er altijd één op: `verifyOtp` met `type=invite`/`magiclink`/`email`,
of `exchangeCodeForSession` na een magic link of invite.

`email_confirmed_at is not null` blijft als tweede laag (de opdracht vroeg
erom, en het kost niets), maar is niet de garantie.

Niet toegestaan: `recovery` en `email_change`. Ze bewijzen ook mailbezit,
maar geen enkele route die koppelt levert ze op. ADR 0020 → Beslissing 7: een
flow die ze nodig heeft, voegt ze bewust toe.

### 2. Binden aan het invite-auth-user-id

`inviteUserByEmail()` geeft `inviteData.user.id` terug; `inviteMember.ts`
gooit dat nu weg (comment bij stap 4: "wordt hier niet meer gebruikt"). Het
gaat voortaan mee naar `mark_member_invite_sent`, die het opslaat in de
nieuwe kolom `members.invited_auth_user_id`. Koppelen kan alleen met dat
`auth.uid()`.

Waarom naast `amr`: zonder binding kan elk account dat ooit mailbezit
aantoonde, koppelen. Met binding is het één bekend account. Een tweede reden:
als iemand vóór de uitnodiging een account op het adres registreert, geeft
GoTrue `email_exists` (bevestigd) of stuurt de uitnodiging naar het
bestaande, onbevestigde account. In dat laatste geval is het teruggegeven id
van dat account; keuze 3 vangt dat af.

Een opnieuw verstuurde uitnodiging naar een nog onbevestigd account geeft
hetzelfde id terug; `mark_member_invite_sent` overschrijft gewoon.

### 3. Geen koppeling als het account al een wachtwoord heeft

De uitnodiging zet geen wachtwoord; dat komt pas ná de koppeling (portal,
`usePortalWachtwoordWijzigen`, of herstel). Heeft het account op het moment
van koppelen `encrypted_password` gevuld, dan heeft iemand dat buiten de
uitnodiging om gezet, bijvoorbeeld met een wachtwoord-signup vóór de
uitnodiging (in een project met "Confirm email" aan). Na de koppeling zou die
persoon met zijn wachtwoord binnenkomen. Weigeren (stille no-op).

Gevolg voor een legitiem lid: wie vóór het aanklikken van de uitnodiging via
"wachtwoord vergeten" een wachtwoord zette, wordt niet gekoppeld. Zeldzaam;
faalt dicht. Zie Randgevallen.

Gecontroleerd bij het koppelen, niet bij het versturen: alleen dan staat vast
dat er tussendoor niets veranderde. Daardoor is er ook geen nieuwe foutcode
en geen nieuwe tekst in Ledenbeheer nodig.

### 4. Bij het koppelen eindigen alle andere Auth-sessies van het account

`delete from auth.sessions where user_id = auth.uid() and id <> <eigen
session_id>`. Een sessie die vóór de koppeling op dit account bestond, kan
niet van de eigenaar zijn aangetoond. Precedent: `close_bar_session_internal`
(`0034:184`). Er bestaan op dat moment geen `bar_sessions` voor het account
(`register_bar_session` eist een gekoppeld lid), dus er hoeft niets anders
dicht. Restrisico (access token blijft tot verloop geldig): ADR 0020 →
Restrisico.

### 5. Adres uit `auth.users`, niet uit de claim

De RPC leest `email`, `email_confirmed_at` en `encrypted_password` uit
`auth.users where id = auth.uid()`. Zelfde waarde als `auth.email()`, maar
uit de bron, en in één query met de andere twee velden. `auth.users` lezen
vanuit een `SECURITY DEFINER`-functie heeft precedent (`0034` leest
`auth.mfa_factors`).

### 6. Adreswijziging wist de uitnodiging

`update_member_email` zet `invited_at = null` en `invited_auth_user_id =
null` als het nieuwe adres na `lower(trim(...))` verschilt van het oude
(ook bij wissen). Alleen hoofdletters wijzigen raakt de uitnodiging niet.
Ook voor een al gekoppeld lid: de velden betekenen daar niets meer, en de UI
toont "account gekoppeld" vóór "uitgenodigd" (`LidBeherenOverlay.tsx`). Eén
regel is makkelijker te testen dan een uitzondering.

### 7. Gearchiveerd: niet koppelen, niet uitnodigen

De link-RPC's eisen `not archived`. `inviteMember.ts` neemt `archived` op in
de eligibility (no-op, `invited: false`), zodat er geen mail meer uitgaat die
toch nooit tot een koppeling leidt. Geen SQL-guard in
`mark_member_invite_sent`: die zou een nieuwe foutcode met tekst vragen, en
de koppeling is al dicht. Wordt het lid weer actief, dan werkt een
openstaande uitnodiging weer.

### 8. Eén interne helper, twee dunne wrappers

De controle is het beveiligingsrelevante deel; twee kopieën gaan uit elkaar
lopen. Nieuwe interne functie `link_member_account_internal(p_role text)`
bevat alle voorwaarden; `link_invited_member_account()` roept hem aan met
`null` (elke rol), `link_lid_member_account()` met `'lid'`. Beide publieke
signaturen blijven gelijk, dus de callback-routes en hun TS-wrappers
veranderen niet.

`link_lid_member_account` is na deze wijziging een deelverzameling van
`link_invited_member_account`. Weghalen is een opruimactie die TS en tests
raakt zonder veiligheidswinst; buiten scope.

### 9. Backfill voor openstaande uitnodigingen

Leden met `invited_at is not null` en `auth_user_id is null` hebben nog geen
`invited_auth_user_id`. De migratie zoekt het account dat `inviteUserByEmail`
aanmaakte: `auth.users` met `lower(email) = lower(members.email)` en
`auth.users.invited_at is not null` (die kolom zet alleen de invite-API). Bij
precies één treffer: invullen. Anders: `invited_at = null`, zodat
Ledenbeheer eerlijk "nog niet uitgenodigd" toont en de beheerder opnieuw kan
uitnodigen. Het wachtwoord- en `amr`-criterium gelden bij het koppelen, dus
de backfill hoeft die niet te controleren.

## Datamodel

`members.invited_auth_user_id uuid null references auth.users(id) on delete
set null`. Geen unique: bij een e-mailcollision (twee leden, hetzelfde
adres) krijgen beide hetzelfde id, en de koppeling no-opt op "meer dan 1
treffer", zoals nu.

Geen kolomrecht voor `authenticated`: `0009`/`0010` geven `select` per
kolom, een nieuwe kolom valt daar buiten. Alleen de `SECURITY DEFINER`-RPC's
zien hem. Geen RLS-wijziging.

`list_members_admin()` gebruikt een expliciete kolommenlijst
(`0029:973-985`); de nieuwe kolom moet erbij, als laatste, anders klopt het
rijtype niet. De waarde mag terug (alleen beheerders; `auth_user_id` gaat al
mee).

## Migratie `0040_koppelen_eist_bewijs_van_mailbezit.sql`

Volgorde:

1. `alter table members add column invited_auth_user_id ...` (zie
   Datamodel).
2. **Backfill** (keuze 9), één `update ... from` met een subquery die per lid
   telt; daarna `update members set invited_at = null where invited_at is not
   null and auth_user_id is null and invited_auth_user_id is null`.
3. **`list_members_admin()`**: `create or replace`, body uit `0029`, met
   `invited_auth_user_id` als laatste kolom.
4. **`mark_member_invite_sent`**: `drop function mark_member_invite_sent(uuid)`,
   nieuw `mark_member_invite_sent(p_member_id uuid, p_auth_user_id uuid)`.
   Body uit `0029:892-946`, met:
   - na de `already_linked`-guard: `select email from auth.users where id =
     p_auth_user_id`; geen rij, of `lower(email) <> lower(v_member.email)`, of
     `v_member.email is null` → `raise exception 'invite_account_mismatch'`.
     Vangt een race (adres gewijzigd tussen lezen en registreren) en een
     beheerder die via PostgREST een willekeurig id meegeeft.
   - `update members set invited_at = now(), invited_auth_user_id =
     p_auth_user_id`.
   - `revoke execute ... from public, anon; grant execute ... to authenticated`.
5. **`update_member_email`**: `create or replace`, body uit `0029:840-888`,
   de `update` wordt:
   `set email = v_email, invited_at = case when lower(coalesce(v_email,'')) =
   lower(coalesce(v_member.email,'')) then invited_at end, invited_auth_user_id
   = <zelfde case>`. (`v_member` is op dat moment nog de oude rij.)
6. **`link_member_account_internal(p_role text) returns members`**, `security
   definer`, `set search_path = public`, `revoke execute ... from public,
   anon, authenticated`. Stappen, elke afwijking `return null`:
   1. `v_uid := auth.uid()`; null → return.
   2. `v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid` (zelfde
      `invalid_text_representation`-vangnet als `register_bar_session`,
      `0034:104-108`); null → return.
   3. `amr`: `jsonb_typeof(auth.jwt() -> 'amr') = 'array'` en `exists (select
      1 from jsonb_array_elements(auth.jwt() -> 'amr') e where e ->> 'method'
      in ('invite', 'magiclink', 'otp', 'email/signup'))`; anders return.
   4. `select email, email_confirmed_at, encrypted_password from auth.users
      where id = v_uid`; geen rij, `email is null`, `email_confirmed_at is
      null` of `coalesce(encrypted_password, '') <> ''` → return.
   5. Al gekoppeld: `exists (select 1 from members where auth_user_id =
      v_uid)` → return. (Zonder deze stap gooit de unique-constraint op
      `auth_user_id` een fout; de RPC mag nooit gooien.)
   6. Kandidaten: `invited_auth_user_id = v_uid and auth_user_id is null and
      invited_at is not null and not archived and lower(email) =
      lower(<adres uit stap 4>) and (p_role is null or role = p_role)`.
      Aantal ≠ 1 → return. Daarna die ene rij ophalen (twee queries, zoals nu:
      `min()` bestaat niet voor `uuid`, `0012:153-158`).
   7. `update members set auth_user_id = v_uid where id = ... returning *`.
   8. `delete from auth.sessions where user_id = v_uid and id <> v_session_id`.
   9. `pin_hash := null`, return.
7. **`link_invited_member_account()`** en **`link_lid_member_account()`**:
   `create or replace`, zelfde signatuur, body is alleen `return
   link_member_account_internal(null)` resp. `('lid')`. Grants ongewijzigd
   (`authenticated`, niet `anon`/`public`), maar herhaal ze expliciet.

Geen wijziging aan `mark_member_invite_sent`'s andere foutcodes of aan
`check_beheer_session`.

## RPC's

| RPC | Wijziging | Klasse (`rpc_catalogus`) |
|---|---|---|
| `mark_member_invite_sent(uuid, uuid)` | nieuwe parameter `p_auth_user_id`, nieuwe fout `invite_account_mismatch` | client, guard (ongewijzigd) |
| `update_member_email(uuid, text)` | wist uitnodiging bij adreswijziging | client, guard (ongewijzigd) |
| `link_invited_member_account()` | wrapper, strengere voorwaarden | client, guardvrij; reden wordt "koppelt de eigen auth-user, alleen met bewijs van mailbezit (ADR 0020)" |
| `link_lid_member_account()` | idem, `role = 'lid'` | idem |
| `link_member_account_internal(text)` | nieuw | **intern** |
| `list_members_admin()` | extra kolom | client, guard (ongewijzigd) |

## TypeScript

- **`src/lib/inviteMember.ts`**
  - Stap 2: `select("id, role, email, auth_user_id, archived")`.
  - Stap 3: eligibility krijgt `member.archived === false`.
  - Stap 4: `supabase.rpc("mark_member_invite_sent", { p_member_id: memberId,
    p_auth_user_id: authUserId })`. Comment bij stap 4 bijwerken (het id
    wordt wél gebruikt, ADR 0020).
  - `toMarkErrorCode` ongewijzigd: `invite_account_mismatch` valt in
    `unknown` ("er ging iets mis, probeer het opnieuw"). Bij opnieuw proberen
    leest de actie het nieuwe adres; dat is precies de juiste reactie op de
    race. Geen nieuwe tekst.
- **`test/inviteMember.test.ts`** + `test/fakes/inviteMemberState.ts` /
  `supabaseAdminInvite.ts`: de fake RPC controleert `p_auth_user_id` gelijk
  aan het id dat de fake `inviteUserByEmail` teruggeeft; nieuwe test
  "gearchiveerd lid: geen invite, geen RPC".
- Geen wijziging aan `linkInvitedMemberAccount.ts`, `linkLidMemberAccount.ts`,
  de twee callback-routes of enige hook.

## Rolzichtbaarheid

Ongewijzigd. Lid, bardienst en beheerder zien hetzelfde als nu.
`invited_auth_user_id` is niet leesbaar via PostgREST; alleen beheerders zien
hem via `list_members_admin` (geen UI).

## Randgevallen

| Geval | Gedrag |
|---|---|
| Uitnodiging openen (`type=invite`, of PKCE `?code=`) | `amr` = `invite`, account zonder wachtwoord, id = gebonden id → gekoppeld. |
| Uitnodiging niet geopend, lid vraagt een magic link aan op portal of `/beheer` | Zelfde account (zelfde adres), `amr` = `otp`/`magiclink`, bevestigd na verify → gekoppeld. |
| Wachtwoordlogin | `amr` = `password` → nooit koppelen. Was al zo (alleen de callbacks koppelen). |
| Wachtwoord-signup op het adres vóór de uitnodiging, "Confirm email" uit | Account bevestigd → `inviteUserByEmail` geeft `email_exists` → geen `invited_at` → niets koppelbaar. Bestaand gedrag; zie Buiten scope. |
| Idem, "Confirm email" aan | Onbevestigd account met wachtwoord → GoTrue stuurt de uitnodiging naar dát account en geeft zijn id terug. Eigenaar opent de link → `encrypted_password` gevuld → **geen koppeling** (keuze 3). Ledenbeheer blijft "uitgenodigd, nog geen account" tonen. |
| Signup op het adres ná de uitnodiging | Ander account kan niet (adres bestaat). Op hetzelfde account: `amr` = `password` → geen koppeling via die sessie. Koppelt de eigenaar later, dan eindigt die sessie (keuze 4). |
| Directe PostgREST-aanroep zonder bewijs | Stille no-op, zoals elk ander niet-van-toepassing-geval. |
| Lid zette vóór het openen van de uitnodiging een wachtwoord via "wachtwoord vergeten" | Niet gekoppeld (keuze 3). Herstel valt buiten deze spec; zelfde categorie als `email_exists` (Buiten scope). Komt alleen voor als iemand eerst herstel doet en daarna pas de uitnodiging opent. |
| Beheerder wijzigt het adres na de uitnodiging | `invited_at` en `invited_auth_user_id` leeg; oude link logt nog in maar koppelt niet; beheerder nodigt opnieuw uit naar het nieuwe adres. |
| Alleen hoofdletters gewijzigd | Uitnodiging blijft. |
| Lid gearchiveerd na de uitnodiging | Niet koppelbaar zolang gearchiveerd; na heractiveren weer wel. |
| Twee leden met hetzelfde adres, beide uitgenodigd | Beide hetzelfde gebonden id → 2 treffers → no-op (zoals nu). |
| Account al aan een ander lid gekoppeld | No-op, geen unique-violation. |
| Uitnodiging opnieuw versturen | Zelfde onbevestigde account, zelfde id; `invited_at` schuift op. |
| Sessie zonder `session_id`-claim | No-op (een echte Supabase-sessie heeft er altijd een). |
| Openstaande uitnodiging van vóór `0040` | Backfill (keuze 9); lukt dat niet, dan "nog niet uitgenodigd" in Ledenbeheer. |

## Tests

### pgTAP — nieuw bestand `supabase/tests/account_koppeling_bewijs.test.sql`

Fixtures: `auth.users`-rijen met `encrypted_password = ''` tenzij anders
vermeld; `auth.sessions`-rijen voor de sessie die koppelt en voor een
tweede sessie op hetzelfde account; een `pg_temp.claims(sub, session, amr
text)` die `request.jwt.claim.sub` en `request.jwt.claims` (`sub`,
`session_id`, `amr: [{"method": <amr>, "timestamp": 0}]`) zet, zelfde vorm als
`beheer_tweede_factor.test.sql:75-87`. Leden met `invited_at = now()` en
`invited_auth_user_id` gezet, tenzij anders vermeld.

Negatief (elk: `link_invited_member_account()` geeft null **en**
`auth_user_id` blijft null; de `role`-gevallen met `link_lid_member_account`):

1. **Onbevestigd account kan niet koppelen**: `email_confirmed_at = null`,
   `amr` = `invite`.
2. **Bevestigd maar geen mailbewijs**: `email_confirmed_at` gezet, `amr` =
   `password` (de autoconfirm-signup). De belangrijkste test: bewijst dat
   "bevestigd" niet genoeg is.
3. `amr` ontbreekt / is geen array / bevat alleen `token_refresh`.
4. **Ander auth-uid dan de uitgenodigde**: tweede account, zelfde adres
   (ander hoofdlettergebruik mag), bevestigd, `amr` = `magiclink`, maar
   `invited_auth_user_id` wijst naar het eerste.
5. **Account met wachtwoord**: gebonden id, bevestigd, `amr` = `invite`,
   `encrypted_password = crypt(...)`.
6. **Gearchiveerd lid niet koppelbaar**: alles in orde, `archived = true`.
7. Geen `session_id`-claim.
8. Adres in `auth.users` wijkt af van `members.email` (gebonden id klopt).
9. Account al gekoppeld aan een ander lid: no-op, `lives_ok` (geen
   unique-violation).
10. Twee leden gebonden aan hetzelfde id: geen van beide gekoppeld.
11. `link_lid_member_account` met een verder geldige bardienst- en
    beheerder-rij: null (rolfilter blijft).
12. `link_member_account_internal` is niet uitvoerbaar voor `authenticated`
    en `anon` (`has_function_privilege`).

`update_member_email` (in een beheersessie, zoals `ledenbeheer.test.sql`):

13. **Adreswijziging wist de uitnodiging**: na wijzigen zijn `invited_at` en
    `invited_auth_user_id` null; daarna geeft `link_invited_member_account()`
    met het oude gebonden account (nu op het nieuwe adres in `auth.users`)
    null.
14. Adres wissen (`''`) wist ook.
15. Alleen hoofdletters gewijzigd: beide velden blijven.

`mark_member_invite_sent(uuid, uuid)`:

16. Onbekend `p_auth_user_id` → `invite_account_mismatch`.
17. Auth-account met een ander adres → `invite_account_mismatch`; `invited_at`
    en `invited_auth_user_id` ongewijzigd.
18. Happy: zet beide velden.
19. `already_linked`, `actor_not_found`, `no_admin_role`, `member_not_found`
    blijven werken (bestaande tests aanpassen aan de nieuwe signatuur).

Positief:

20. **Happy path werkt**: gebonden id, bevestigd, geen wachtwoord, `amr` =
    `invite` → rij terug met `auth_user_id = sub`, `pin_hash` null; tabel
    bijgewerkt (gemengde hoofdletters in `members.email`).
21. Na 20: de tweede `auth.sessions`-rij van het account is weg, de eigen
    sessie bestaat nog.
22. Happy path met `amr` = `magiclink` en met `otp` (de portal-route), via
    `link_lid_member_account` voor een `lid`.

### Bestaande pgTAP-bestanden

- `ledenbeheer.test.sql`: fixtures en aanroepen van `mark_member_invite_sent`
  naar de nieuwe signatuur; de `link_invited_member_account`-blokken krijgen
  `invited_auth_user_id`, `encrypted_password = ''` en `amr`/`session_id` in
  de claims, anders falen ze terecht. `plan(...)` bijwerken.
- `lid_account_koppelen.test.sql`: idem.
- `beheer_rpcs_modus.test.sql:135`: `mark_member_invite_sent(<id>,
  <auth-id>)`.
- `rpc_execute_grants.test.sql:317`: `'public.mark_member_invite_sent(uuid,uuid)'`.
- `rpc_catalogus.test.sql`: `link_member_account_internal` als `intern`;
  reden bij de twee link-RPC's bijwerken (zie RPC's).

### Handmatige controle (Developer, tegen `supabase start`)

De lijst `amr`-methoden is gebaseerd op de methodenamen van Supabase Auth.
Controleer één keer lokaal, per callback-pad (uitnodiging via Ledenbeheer en
Inbucket; magic link op `/portal`; magic link op `/beheer`), dat de koppeling
lukt, en leg in de PR vast welke `amr`-methode elk pad opleverde. Levert een
pad een methode op die niet in de lijst staat: stop en meld het, niet zelf
toevoegen (ADR 0020 → Beslissing 7). Controleer ook dat een
`supabase.auth.signUp` met wachtwoord op een uitgenodigd adres geen
koppeling oplevert via `/auth/callback`.

## Documentatie (door de Architect bij deze spec bijgewerkt)

- [ADR 0020](../adr/0020-koppelen-eist-bewijs-van-mailbezit.md) (nieuw).
- ADR 0006 → Aanvulling: verwijzing dat de matchregel vervangen is.
- `docs/ARCHITECTURE.md` → Lid-accounts: koppelvoorwaarden.

Voor Docs na de bouw: `lid-account-invite.md` (RPC's punt 2, Koppelmechanisme)
en `portal-login.md` (Ledenkoppeling voor rol `lid`) krijgen een
"Bijgewerkt door"-regel naar deze spec.

## Dashboard (Bram, aanbevolen, niet vereist)

Zet op het gehoste project **Authentication → Providers → Email → Confirm
email** aan. Deze spec is ook zonder veilig; met de instelling aan vervalt
het restrisico uit ADR 0020 (een sessie zonder mailbezit op het uitgenodigde
account). Controleer daarna dat de portal-magic-link nog werkt (die
bevestigt zelf).

## Expliciet buiten scope

- **`email_exists` bij uitnodigen** (`inviteMember.ts:157-163`). Een lid dat
  al een eigen account op dat adres had, kan nog steeds niet gekoppeld
  worden, en de melding ("al gekoppeld aan een ander account") klopt niet
  precies. Dat bestaande account veilig koppelen vraagt meer dan deze spec:
  het kan van iemand anders zijn, met een wachtwoord van die ander, en met
  "Confirm email" uit zelfs bevestigd. Nodig: een eigen flow (bijvoorbeeld
  koppelen alleen na mailbewijs plus verplicht nieuw wachtwoord en alle
  sessies weg). Eigen ticket; deze spec maakt het niet slechter.
- `link_lid_member_account` weghalen (keuze 8).
- Koppelen vanuit de wachtwoordherstel-flow (`recovery`).
- Een access token na het verwijderen van zijn Auth-sessie ongeldig maken
  voor PostgREST (item "JWT na afmelden").
- Signup op het project uitzetten: `enable_signup = false` zet ook de
  wachtwoordlogin uit (`supabase/config.toml`, commentaar bij `[auth]`).

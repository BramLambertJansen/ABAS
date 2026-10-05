# Account koppelen alleen met bewijs van mailbezit

**Status: goedgekeurd (2026-10-05), gebouwd in 73edbbf, herzien na review
(2026-10-05, zie Herziening), herzien na review van 3b0528c (zie
Herziening 2).** Bram heeft de keuzes voor deze opdracht bij
de Architect gelegd: de spec geldt als goedgekeurd zodra hij geschreven is,
en elke keuze staat hieronder met reden. Item B van de review van
2026-10-05. Architectuurbeslissing:
[ADR 0020](../adr/0020-koppelen-eist-bewijs-van-mailbezit.md). Migratie
`0040` (nog niet gemerged, mag aangepast).

## Herziening 2 (2026-10-05, na review van 3b0528c)

Delta voor de Developer bovenop 3b0528c. Migratie `0040` is nog niet
gemerged en wordt aangevuld, geen nieuwe migratie. Bram heeft de keuze bij
de Architect gelegd; deze herziening geldt als goedgekeurd.

### Wat er mis was (reviewer-blocker)

ADR 0020 → Restrisico zei dat een overgebleven access token na het koppelen
alleen PostgREST kan aanroepen "als het gekoppelde lid (aal1, zonder
bardienst-sessie)". Onjuist. `register_bar_session(text)` (laatste definitie
`0034:89-149`, granted aan `authenticated` in `0028`) controleert de
`session_id`-claim en het lid, niet of de rij in `auth.sessions` nog
bestaat. Vóór de koppeling had het account geen `bar_sessions`-rij, dus geen
`session_ended`. Aanval ("Confirm email" uit): signup op het uitgenodigde
adres → sessie S met `amr` = `password` → wacht → het lid koppelt (stap 9
van `0040` verwijdert S uit `auth.sessions`) → met het nog geldige token van S
`register_bar_session('bar')` → bar-sessie als dat lid, tot het token
verloopt. Daarna `start_shift`, `place_order`, `top_up`, terugdraaien.

Bij nalezen, zelfde klasse: **`set_own_pin`** (laatste definitie `0032`).
Met hetzelfde token zet de aanvaller een PIN op het lid. Die PIN werkt op
elk apparaat waar het lid daarna zelf met zijn wachtwoord inlogt
(`bar_device_members`), en de bartablet is gedeeld. Blijvend, ook na het
verlopen van het token.

### Keuze: dichten (optie a van de reviewer), in twee RPC's

**`register_bar_session` en `set_own_pin` eisen dat de Auth-sessie uit het
token nog bestaat** (nieuwe ADR 0020 → Beslissing 8): `exists (select 1
from auth.sessions where id = v_session_id and user_id = auth.uid())`.
Allebei maken ze iets wat langer leeft dan het token. Klein, en ook los van
deze feature waardevol: een token waarvan de sessie al weg is (uitgelogd,
afgemeld) kan geen nieuwe bar-sessie meer registreren.

**Niet in `require_session`.** Afgewogen:

- Niet nodig voor deze aanval: zonder `bar_sessions`-rij komt geen token door
  `require_session` (`no_bar_session`), en na deze wijziging maakt
  `register_bar_session` er geen meer aan voor een verwijderde sessie. Elk
  einde via onze RPC's (`close_bar_session_internal`) zet `ended_at` en geeft
  al `session_ended`.
- Wat het extra zou dichten (een bar-sessie waarvan de Auth-sessie buiten
  onze RPC's om verdween, bv. GoTrue-uitloggen zonder `end_bar_session`) is
  het item "JWT na afmelden" en vraagt daar een eigen afweging.
- Omvang: ruim twintig pgTAP-bestanden zetten een `session_id`-claim zonder
  `auth.sessions`-rij en lopen via `require_session` (o.a. `place_order`,
  `top_up`, `start_shift`, `end_shift`, `reverse_order`, `geld_rpcs_attributie`,
  `admin_sessie_rpcs_guards`, `bar_sessie_guards`, `bar_sessies_rls`,
  `resume_orphan_shift`, `shift_members`, `productafbeeldingen*`,
  `beheer_rpcs_modus` en de beheerbestanden). Voor de twee RPC's hier zijn
  het er vijf (zie Checklist).

**Niet in `register_bar_session_server`.** Alleen `service_role`;
`barLogin.ts` (`registreerSessie`) geeft het `session_id` door uit het access
token dat `signInWithPassword`/`verifyOtp` in dezelfde request net uitgaf.
Geen pad voor een oud token.

### Bronnen gecontroleerd

- **Lezen van `auth.sessions` vanuit `security definer` werkt.**
  `close_bar_session_internal` (`0034:184`) doet er al een `delete` op, stap 9
  van `0040` ook, en `promotie_beheerder.test.sql` /
  `beheer_tweede_factor*.test.sql` lezen en schrijven de tabel in pgTAP.
  Functie-eigenaar is `postgres`, die rechten heeft op `auth.sessions`.
- **Een echte sessie heeft altijd een rij met `id` = de `session_id`-claim.**
  GoTrue legt de sessie vast voordat het tokens uitgeeft; verversen en het
  ophogen naar aal2 (`mfa.verify`) houden hetzelfde `session_id`. De client-
  aanroep van `register_bar_session` komt uit `ModusKeuze` na een e-maillogin
  op `/beheer` (wachtwoord of maillink): een gewone GoTrue-sessie. De
  namenlijst (PIN/wachtwoord) gaat via `register_bar_session_server` en
  verandert niet. Bewijs tegen de echte GoTrue: integratiescenario 1
  (wachtwoordsessie registreert) en 3 (verwijderde sessie registreert niet),
  zie Tests.
- **Foutcodes zonder nieuwe tekst.** `register_bar_session` geeft
  `session_ended`: bestaande `SessionErrorCode`, de client toont al wat bij
  een beëindigde sessie hoort (`useRegisterBarSession.ts` →
  `notifySessionCode`). `set_own_pin` geeft `actor_not_found`: bestaande
  code, bestaande tekst ("… log opnieuw in", `src/lib/ownPinErrors.ts`), en
  opnieuw inloggen is precies wat de houder van een verlopen sessie moet doen.
  Geen TypeScript-wijziging.

### Checklist Developer (t.o.v. 3b0528c)

**`0040_koppelen_eist_bewijs_van_mailbezit.sql`** (zie ook Migratie →
stappen 8 en 9)

1. Kopcommentaar: een regel erbij: "`register_bar_session` en `set_own_pin`
   eisen dat de Auth-sessie uit het token nog bestaat (ADR 0020 →
   Beslissing 8)".
2. Stap 9 van `link_member_account_internal`: de zin "Er zijn nog geen
   bar_sessions (register_bar_session eist een gekoppeld lid)" vervangen door:
   een token van een hier verwijderde sessie kan daarna geen bar-sessie
   registreren en geen PIN zetten, omdat die twee RPC's de rij in
   `auth.sessions` eisen (Beslissing 8).
3. **`register_bar_session(text)`**: `create or replace`, body letterlijk uit
   `0034:89-149`, met direct na de `if v_session_id is null then raise
   'no_bar_session'`:
   ```sql
   if not exists (
     select 1 from auth.sessions
      where id = v_session_id and user_id = auth.uid()
   ) then
     raise exception 'session_ended' using errcode = 'P0001';
   end if;
   ```
   Vóór de rol- en factorcontroles: een token van een verwijderde sessie
   leert niets over het lid. Commentaar met verwijzing naar ADR 0020 →
   Beslissing 8 en het aanvalspad. Grants ongewijzigd (`create or replace`
   behoudt ze); herhaal ze toch expliciet zoals de wrappers.
4. **`set_own_pin(text)`**: `create or replace`, body letterlijk uit
   `0032`, `set search_path = public, extensions` behouden. Direct na het
   bepalen van `v_session_id` (vóór de bestaande `wrong_mode`-check):
   `v_session_id is null or not exists (select 1 from auth.sessions where id
   = v_session_id and user_id = auth.uid())` → `raise exception
   'actor_not_found'`. Een ontbrekende claim weigert dus nu ook (een echte
   Supabase-sessie heeft er altijd een). Commentaar: waarom `actor_not_found`
   (bestaande tekst "log opnieuw in", geen nieuwe UI). Grants herhalen.
5. `rpc_catalogus.test.sql`: reden bij `register_bar_session` →
   "maakt de sessie aan die de guards daarna eisen; eist een bestaande
   Auth-sessie en controleert zelf aal2 voor beheer"; bij `set_own_pin` →
   "portal: eigen PIN, eist een bestaande Auth-sessie, weigert een
   bar-sessie zelf (wrong_mode)".

**pgTAP**

6. `account_koppeling_bewijs.test.sql`: nieuwe tests 27-31 (Tests → pgTAP)
   en de robuuste wachtwoordvergelijking in 5, 25 en 26.
7. `bar_sessie_rpcs.test.sql`: de claims-helper (r. ~60-84) voegt een
   `auth.sessions`-rij toe (`id` = `user_id` = `p_auth_user`, `on conflict
   (id) do nothing`); de losse `set_config`-blokken bij de
   `register_bar_session`-tests (r. ~133-230) krijgen een rij voor hun
   `session_id` met het bijbehorende `user_id`, behalve de tests die
   `no_bar_session` verwachten (geen claim / leeg / ongeldig). Nieuwe test:
   `session_id`-claim zonder `auth.sessions`-rij → `session_ended`, geen
   `bar_sessions`-rij. `plan(...)` bijwerken.
8. `bar_rpcs_lid_en_device.test.sql` (r. ~180-260): rijen in `auth.sessions`
   voor de `session_id`'s waarmee `register_bar_session` wordt aangeroepen,
   zodat die tests de rolcheck (`no_bar_role`) blijven testen en niet
   `session_ended` krijgen.
9. `beheer_tweede_factor.test.sql` en
   `beheer_tweede_factor_randgevallen.test.sql`: de `register_bar_session`-
   tests (r. ~89-165 resp. ~175-200) draaien vóór de bestaande
   `insert into auth.sessions` (r. 272 resp. 291/308). Rijen voor de daar
   gebruikte `session_id`'s eerder invoegen (`on conflict (id) do nothing` bij
   de latere inserts, of die inserts naar voren halen als het dezelfde id's
   zijn). De verwijdertests daarna moeten ongewijzigd slagen.
10. `set_own_pin.test.sql`: elke aanroep krijgt claims met een `session_id`
    waarvoor een `auth.sessions`-rij van dat account bestaat (een
    `pg_temp`-helper zoals in `beheer_tweede_factor.test.sql:75-87`, plus de
    rijen). Tests 11-14 (r. ~199-240) hebben al een `session_id`: rijen
    toevoegen. Nieuwe tests: geen `session_id`-claim → `actor_not_found`;
    `session_id` zonder rij → `actor_not_found` en `pin_hash` ongewijzigd.
    `plan(...)` bijwerken.

Draai `npm run db:test` volledig: een bestand dat ik hier mis (een
`register_bar_session`- of `set_own_pin`-aanroep die ik niet vond), faalt
dan met `session_ended`/`actor_not_found` en krijgt dezelfde fixture.

**Integratietest** (`integration/account-koppeling.test.ts`): scenario 1 en 3
uitbreiden (Tests → Integratietest). Gebruik voor aanroepen met het token van
de aanvaller een aparte client met `global.headers.Authorization = Bearer
<access token>` en `auth: { persistSession: false, autoRefreshToken: false }`,
zodat supabase-js niet stil ververst.

**Docs na de merge** (Docs-rol): rij voor `test:integration` in de tabel in
`CLAUDE.md` → Verificatie, bv. "`test:integration` | koppelen tegen de echte
GoTrue (tokens, `amr`, wissen van inloggegevens), tegen de lokale stack in
CI". In `docs/ARCHITECTURE.md` → Lid-accounts staat Beslissing 8 al (door de
Architect bijgewerkt).

## Herziening (2026-10-05, na review van 73edbbf)

Deze sectie is de delta voor de Developer. De rest van de spec is al
bijgewerkt naar de herziene stand; waar hij afwijkt van 73edbbf, geldt de
spec.

### Wat er mis was

- **Reviewer:** `signInWithOtp({ shouldCreateUser: true })` maakt voor een
  onbekend of onbevestigd adres via Signup een account met een willekeurig
  tijdelijk wachtwoord (GoTrue `magic_link.go:84-91`). `inviteUserByEmail`
  hergebruikt een onbevestigd account (`invite.go:66-70`). Stap 4 van `0040`
  (`coalesce(v_password,'') <> ''` → niet koppelen) blokkeert dan blijvend
  een lid dat vóór de uitnodiging de portal probeerde.
- **Architect, bij nalezen van dezelfde bron: het hoofdpad zelf breekt.**
  `signupVerify` (`verify.go:317-329`) zet bij het openen van een
  uitnodiging (`type=invite`, en ook `type=signup`) op elk account zonder
  wachtwoord met `invited_at` een willekeurig wachtwoord van 64 tekens
  ("sign them up with temporary password, and require application to
  present the user with a password set form"). Dat gebeurt vóór de sessie
  wordt uitgegeven, voor `token_hash` (`verify.go:256`) en voor PKCE
  (`verify.go:152`). Wie de uitnodiging opent, heeft bij het koppelen dus
  altijd `encrypted_password` gevuld, en stap 4 weigert. De pgTAP-fixtures
  (`encrypted_password = ''`) draaien geen GoTrue en zagen dat niet.
- Conclusie: op het moment van koppelen is een GoTrue-tijdelijk wachtwoord,
  een wachtwoord van een aanvaller en een wachtwoord dat het lid zelf via
  herstel zette, in de database niet te onderscheiden. Een controle op
  `encrypted_password` is niet te repareren. Die moet weg.

### Nieuwe keuze 3: bij het koppelen worden alle inloggegevens gewist, behalve de sessie die het bewijs leverde

Zie keuze 3 hieronder. Kort: na een geslaagde koppeling, in dezelfde
functie, `encrypted_password = ''`, alle `auth.mfa_factors` van het account
weg, en (zoals al gebouwd) alle andere `auth.sessions` weg. Na de koppeling
komt alleen nog binnen wie zojuist mailbezit aantoonde. Wat er vóór de
koppeling op het account stond, verdwijnt: het GoTrue-tijdelijke wachtwoord,
het wachtwoord van een aanvaller die het adres vóór de uitnodiging
registreerde ("Confirm email" aan), en een wachtwoord plus TOTP die een
aanvaller zette via een sessie uit een signup op het uitgenodigde adres
("Confirm email" uit, zie Randgevallen).

**Verworpen: de richting van de reviewer** (in `inviteMember.ts` een
bestaand onbevestigd account verwijderen en vers uitnodigen). Lost alleen het
geval vóór de uitnodiging op: het verse invite-account krijgt bij het openen
toch een tijdelijk wachtwoord (`verify.go:317`), dus stap 4 blijft het
hoofdpad blokkeren. Daarnaast vraagt het een nieuwe service-role-RPC (de
admin-API kan niet op e-mail zoeken), een destructieve delete en een race
met een bevestiging die net binnenkomt. Na de reset is het niet nodig: een
hergebruikt onbevestigd account houdt niets over dat de koppeling overleeft.

**Verworpen: `mark_member_invite_sent` laten eisen dat
`auth.users.invited_at is not null`.** GoTrue zet `invited_at` ook bij een
hergebruikt onbevestigd account, dus het onderscheidt niets. Met de reset
maakt het ook niet meer uit wie het account aanmaakte; wel dat het adres
klopt (al gecontroleerd) en dat de sessie die koppelt mailbezit aantoonde.

### `amr`: wat de bron zegt (correctie)

Het commentaar in `0040` (stap 3) en ADR 0020 → Beslissing 7 zeiden dat
herstel- en adreswijzigingssessies `recovery`/`email_change` dragen. Onjuist
voor onze routes: `verifyOtp` met `token_hash` (ADR 0008, beide callbacks)
geeft voor elk type `otp` (`verify.go:185` GET, `:285` POST). Alleen PKCE
(`?code=`) neemt de methode uit de flow state (`token.go:256`, namen uit
`factor.go:117-141`: `invite`, `magiclink`, `email/signup`, `recovery`,
`email_change`). Een herstelsessie via `token_hash` kan dus koppelen. Geen
lek: herstel bewijst evengoed mailbezit (de mail gaat naar dit adres). De
lijst blijft `invite`, `magiclink`, `otp`, `email/signup`.

### Blocker 2: bewijs zonder Docker in deze sessie

De handmatige controle tegen `supabase start` is geen merge-voorwaarde meer.
In de plaats:

1. **Bronverificatie** (sectie Tests → Bronverificatie): wat GoTrue doet,
   met bestand en regel, als vastgelegd bewijs.
2. **Een integratietest in CI tegen de echte GoTrue.** CI draait al de
   volledige lokale stack (`.github/workflows/ci.yml`, `supabase start`). Een
   nieuwe test (`integration/account-koppeling.test.ts`) doorloopt het
   hoofdpad en de aanval met echte tokens. Dat had de fout hierboven
   gevangen. Zie Tests → Integratietest. Merge-voorwaarde: groen in CI.
3. **Na de merge, door Bram, op het gehoste project** (sectie Na de merge):
   de gehoste GoTrue-versie en de instelling "Confirm email" zijn hier niet
   te zien.

### Checklist Developer (t.o.v. 73edbbf)

**`0040_koppelen_eist_bewijs_van_mailbezit.sql`**

1. Kopcommentaar: voorwaarde "(4) geen wachtwoord heeft" vervangen door
   "bij het koppelen worden wachtwoord, MFA-factoren en alle andere sessies
   van het account gewist (ADR 0020 → Beslissing 3)".
2. `link_member_account_internal`, stap 3: commentaar corrigeren volgens
   "`amr`: wat de bron zegt" hierboven (via `token_hash` altijd `otp`, ook
   bij herstel; `recovery`/`email_change` alleen via PKCE, en die staan
   bewust niet in de lijst).
3. Stap 4: `encrypted_password` uit de `select`, de voorwaarde
   `coalesce(v_password, '') <> ''` weg, variabele `v_password` weg.
   Commentaar: "keuze 3" eruit.
4. Na stap 7 (`update members ... returning`), vóór het verwijderen van de
   sessies, nieuw:
   `update auth.users set encrypted_password = '' where id = v_uid;` en
   `delete from auth.mfa_factors where user_id = v_uid;` (cascadeert naar
   `auth.mfa_challenges`). Daarna de bestaande `delete from auth.sessions`.
   Commentaar: na de koppeling komt alleen de bewijzende sessie binnen; wat
   ervoor op het account stond (GoTrue-tijdelijk wachtwoord bij het openen
   van de uitnodiging, `verify.go:317`, of iets van een ander) is weg.
   Zelfde soort DML op het `auth`-schema als `0034` (`auth.sessions`).
   Alleen op het pad dat echt koppelt, nooit bij een no-op.
5. `mark_member_invite_sent`: ongewijzigd.

**`src/lib/inviteMember.ts`**: ongewijzigd.

**pgTAP** (`account_koppeling_bewijs.test.sql`, zie Tests): test 5 wordt
positief; nieuwe tests 23-26.

**Integratietest**: nieuw bestand, nieuw script, CI-stap (zie Tests →
Integratietest).

**Docs na de bouw:** rij voor `test:integration` in de tabel in `CLAUDE.md`
→ Verificatie.

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

en het lid niet gearchiveerd is. Bij het koppelen verdwijnen wachtwoord,
MFA-factoren en alle andere sessies van het account: daarna komt alleen de
sessie met het bewijs binnen. Ongeacht de projectinstelling "Confirm email".

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
methoden vraagt een token uit een mail aan dit adres. De callback-paden
leveren er altijd één op: `verifyOtp` met `token_hash` geeft voor elk type
`otp` (`verify.go:185`, `:285`); `exchangeCodeForSession` (PKCE) geeft de
methode uit de flow state (`token.go:256`), na een uitnodiging of magic link
dus `invite`, `magiclink` of `email/signup`.

`email_confirmed_at is not null` blijft als tweede laag (de opdracht vroeg
erom, en het kost niets), maar is niet de garantie.

Niet in de lijst: `recovery` en `email_change`. Die komen alleen via PKCE
voor; via `token_hash` worden ook herstel en adreswijziging `otp` en kunnen
ze dus koppelen. Geen lek: beide bewijzen mailbezit van het huidige adres.
ADR 0020 → Beslissing 7: een PKCE-flow die ze nodig heeft, voegt ze bewust
toe.

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
van dat account; keuze 3 wist bij het koppelen wat er al op stond.

Een opnieuw verstuurde uitnodiging naar een nog onbevestigd account geeft
hetzelfde id terug; `mark_member_invite_sent` overschrijft gewoon.

### 3. Bij het koppelen worden wachtwoord en MFA-factoren gewist (herzien)

*Vervangt "geen koppeling als het account al een wachtwoord heeft"; zie
Herziening.*

Op het moment van koppelen staat er bijna altijd een wachtwoord op het
account dat niemand kent: GoTrue zet het zelf bij het openen van de
uitnodiging (`verify.go:317-329`) en bij een magic-link-aanvraag voor een
onbekend adres (`magic_link.go:84-91`). Het kan ook van een aanvaller zijn:
een wachtwoord-signup vóór de uitnodiging ("Confirm email" aan, GoTrue
hergebruikt dat onbevestigde account voor de uitnodiging), of een
`updateUser({ password })` via een sessie die een signup op het uitgenodigde
adres opleverde ("Confirm email" uit, `signup.go:193-196` en `:305-315`).
In de database is dat niet te onderscheiden.

Daarom niet weigeren, maar resetten: bij een geslaagde koppeling, in
dezelfde functie, `auth.users.encrypted_password = ''` en `delete from
auth.mfa_factors where user_id = <account>`. Samen met keuze 4 (andere
sessies weg) geldt na de koppeling: het enige inlogmiddel op het account is
de sessie die zojuist mailbezit aantoonde.

Gevolg voor het lid: geen. Na een uitnodiging kende het lid zijn wachtwoord
toch al niet (het GoTrue-tijdelijke). Het stelt er een in via de portal
(`usePortalWachtwoordWijzigen`, `updateUser({ password })`, werkt zonder
huidig wachtwoord), zoals nu. Wie vóór het koppelen via "wachtwoord vergeten"
een eigen wachtwoord zette, verliest dat bij het koppelen en stelt het
opnieuw in. Zeldzaam, en faalt veilig (zie Randgevallen).

Geen nieuwe toestand: CLAUDE.md → Auth verbiedt alleen-PIN; na de koppeling
is `pin_hash` null (migratie, stap 6.10), dus geen PIN en geen wachtwoord, net als direct
na een uitnodiging nu.

Alleen op het pad dat echt koppelt. Een no-op (geen bewijs, ander account,
al gekoppeld) raakt niets aan, en een al gekoppeld lid koppelt nooit opnieuw
(stap 5), dus een in gebruik zijnd wachtwoord wordt nooit gewist.

### 4. Bij het koppelen eindigen alle andere Auth-sessies van het account

`delete from auth.sessions where user_id = auth.uid() and id <> <eigen
session_id>`. Een sessie die vóór de koppeling op dit account bestond, kan
niet van de eigenaar zijn aangetoond. Precedent: `close_bar_session_internal`
(`0034:184`). Er bestaan op dat moment geen `bar_sessions` voor het account
(`register_bar_session` eist een gekoppeld lid), dus er hoeft niets anders
dicht. Restrisico (access token blijft tot verloop geldig): ADR 0020 →
Restrisico.

### 5. Adres uit `auth.users`, niet uit de claim

De RPC leest `email` en `email_confirmed_at` uit `auth.users where id =
auth.uid()`. Zelfde waarde als `auth.email()`, maar uit de bron, en in één
query met het andere veld. `auth.users` lezen
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
   4. `select email, email_confirmed_at from auth.users where id = v_uid`;
      geen rij, `email is null` of `email_confirmed_at is null` → return.
      (Herzien: geen controle op `encrypted_password` meer, zie keuze 3.)
   5. Al gekoppeld: `exists (select 1 from members where auth_user_id =
      v_uid)` → return. (Zonder deze stap gooit de unique-constraint op
      `auth_user_id` een fout; de RPC mag nooit gooien.)
   6. Kandidaten: `invited_auth_user_id = v_uid and auth_user_id is null and
      invited_at is not null and not archived and lower(email) =
      lower(<adres uit stap 4>) and (p_role is null or role = p_role)`.
      Aantal ≠ 1 → return. Daarna die ene rij ophalen (twee queries, zoals nu:
      `min()` bestaat niet voor `uuid`, `0012:153-158`).
   7. `update members set auth_user_id = v_uid where id = ... returning *`.
   8. **(Herzien, keuze 3)** `update auth.users set encrypted_password = ''
      where id = v_uid;` en `delete from auth.mfa_factors where user_id =
      v_uid;`.
   9. `delete from auth.sessions where user_id = v_uid and id <> v_session_id`.
   10. `pin_hash := null`, return.
7. **`link_invited_member_account()`** en **`link_lid_member_account()`**:
   `create or replace`, zelfde signatuur, body is alleen `return
   link_member_account_internal(null)` resp. `('lid')`. Grants ongewijzigd
   (`authenticated`, niet `anon`/`public`), maar herhaal ze expliciet.

8. **`register_bar_session(text)`** (Herziening 2, ADR 0020 → Beslissing
   8): `create or replace`, body uit `0034:89-149`; direct na de
   `no_bar_session`-check op een lege claim: geen rij in `auth.sessions` met
   `id = v_session_id and user_id = auth.uid()` → `raise 'session_ended'`.
   Grants herhalen.
9. **`set_own_pin(text)`** (Herziening 2): `create or replace`, body uit
   `0032`; direct na het bepalen van `v_session_id`: claim leeg of geen rij in
   `auth.sessions` met `id = v_session_id and user_id = auth.uid()` →
   `raise 'actor_not_found'`. Grants herhalen.

Geen wijziging aan `mark_member_invite_sent`'s andere foutcodes, aan
`check_beheer_session`, aan `require_session` of aan
`register_bar_session_server` (Herziening 2 → Keuze).

## RPC's

| RPC | Wijziging | Klasse (`rpc_catalogus`) |
|---|---|---|
| `mark_member_invite_sent(uuid, uuid)` | nieuwe parameter `p_auth_user_id`, nieuwe fout `invite_account_mismatch` | client, guard (ongewijzigd) |
| `update_member_email(uuid, text)` | wist uitnodiging bij adreswijziging | client, guard (ongewijzigd) |
| `link_invited_member_account()` | wrapper, strengere voorwaarden | client, guardvrij; reden wordt "koppelt de eigen auth-user, alleen met bewijs van mailbezit (ADR 0020)" |
| `link_lid_member_account()` | idem, `role = 'lid'` | idem |
| `link_member_account_internal(text)` | nieuw | **intern** |
| `list_members_admin()` | extra kolom | client, guard (ongewijzigd) |
| `register_bar_session(text)` | eist een bestaande Auth-sessie, anders `session_ended` (Herziening 2) | client, guardvrij; reden bijwerken |
| `set_own_pin(text)` | eist een bestaande Auth-sessie, anders `actor_not_found` (Herziening 2) | client, guardvrij; reden bijwerken |

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
| Uitnodiging openen (`token_hash`, `type=invite`) | GoTrue bevestigt en zet een tijdelijk wachtwoord (`verify.go:317`); `amr` = `otp`; id = gebonden id → gekoppeld, wachtwoord daarna leeg. Via PKCE `?code=`: `amr` = `invite`, verder gelijk. |
| Uitnodiging niet geopend, lid vraagt een magic link aan op portal of `/beheer` | Zelfde account (zelfde adres). "Confirm email" aan: GoTrue stuurt een bevestigingsmail (`type=signup`, ook tijdelijk wachtwoord); uit: bevestigt direct en stuurt een magic link. Na verify `amr` = `otp` → gekoppeld, wachtwoord leeg. |
| Lid probeerde de portal vóór de uitnodiging, opende die mail niet ("Confirm email" aan) | Onbevestigd account met GoTrue-tijdelijk wachtwoord; de uitnodiging hergebruikt het en bindt zijn id. Lid opent de uitnodiging → gekoppeld, wachtwoord leeg. (Dit was de blocker van de review.) |
| Idem, "Confirm email" uit | De portalpoging bevestigde het account direct → uitnodigen geeft `email_exists`. Bestaand gedrag; zie Buiten scope. |
| Wachtwoordlogin | `amr` = `password` → nooit koppelen. Was al zo (alleen de callbacks koppelen). |
| Wachtwoord-signup op het adres vóór de uitnodiging, "Confirm email" uit | Account bevestigd → `inviteUserByEmail` geeft `email_exists` → geen `invited_at` → niets koppelbaar. Bestaand gedrag; zie Buiten scope. |
| Idem, "Confirm email" aan | Onbevestigd account met het wachtwoord van de aanvaller → GoTrue stuurt de uitnodiging naar dát account en geeft zijn id terug. Aanvaller heeft geen sessie (onbevestigd). Eigenaar opent de link → gekoppeld, **wachtwoord van de aanvaller gewist** (keuze 3). |
| Signup op het adres ná de uitnodiging, "Confirm email" aan | GoTrue wijzigt het bestaande onbevestigde account niet (`signup.go:195`), stuurt alleen een bevestigingsmail naar het adres. Aanvaller krijgt niets. |
| Idem, "Confirm email" uit | GoTrue bevestigt het uitgenodigde account en geeft de aanvaller een sessie met `amr` = `password` (`signup.go:228-236`, `:305-315`). Daarmee kan hij een wachtwoord zetten en een TOTP-factor inschrijven, maar niet koppelen. Opent het lid daarna de uitnodigingslink of een magic link op portal of `/beheer` → gekoppeld (werkt de uitnodigingslink niet meer omdat het account al bevestigd is, dan de magic link); wachtwoord en factor van de aanvaller weg, zijn sessie weg (keuze 4). Opnieuw uitnodigen geeft dan `email_exists`. Zijn nog geldige access token kan daarna geen bar-sessie registreren (`session_ended`) en geen PIN zetten (`actor_not_found`): Herziening 2. Wat het nog kan (lezen tot het verloopt): ADR 0020 → Restrisico. |
| Directe PostgREST-aanroep zonder bewijs | Stille no-op, zoals elk ander niet-van-toepassing-geval. |
| Lid zette vóór het koppelen een wachtwoord via "wachtwoord vergeten" | De herstelflow koppelt niet (de hooks roepen geen link-RPC aan). Bij de eerstvolgende koppeling via een maillink wordt dat wachtwoord gewist (keuze 3); het lid stelt het opnieuw in via de portal. |
| Er stond vóór het koppelen een TOTP-factor op het account | Wie het ook inschreef (de Auth-API staat het elke sessie toe): bij het koppelen gewist; het lid stelt tweestap opnieuw in via de portal. |
| Beheerder wijzigt het adres na de uitnodiging | `invited_at` en `invited_auth_user_id` leeg; oude link logt nog in maar koppelt niet; beheerder nodigt opnieuw uit naar het nieuwe adres. |
| Alleen hoofdletters gewijzigd | Uitnodiging blijft. |
| Lid gearchiveerd na de uitnodiging | Niet koppelbaar zolang gearchiveerd; na heractiveren weer wel. |
| Twee leden met hetzelfde adres, beide uitgenodigd | Beide hetzelfde gebonden id → 2 treffers → no-op (zoals nu). |
| Account al aan een ander lid gekoppeld | No-op, geen unique-violation. |
| Uitnodiging opnieuw versturen | Zelfde onbevestigde account, zelfde id; `invited_at` schuift op. |
| Sessie zonder `session_id`-claim | No-op (een echte Supabase-sessie heeft er altijd een). |
| Token van een sessie die al uit `auth.sessions` verdween (bij koppelen, afmelden, uitloggen) | `register_bar_session` → `session_ended`; `set_own_pin` → `actor_not_found` (Herziening 2). Lezen via PostgREST kan tot het token verloopt (item "JWT na afmelden"). |
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
5. *(Herzien: verplaatst naar positief, zie 23.)* In plaats daarvan:
   **no-op raakt niets aan**: account met `encrypted_password =
   crypt(...)` en een `auth.mfa_factors`-rij, `amr` = `password` → null, en
   wachtwoord, factor en tweede sessie zijn ongewijzigd.
   *(Herziening 2.)* Wachtwoordvergelijking in 5, 25 en 26 zo dat een
   gewist wachtwoord een nette `not ok` geeft in plaats van een fout van
   `crypt` op een lege salt: `case when encrypted_password = '' then false
   else encrypted_password = crypt('<wachtwoord>', encrypted_password) end`.
   Niet `encrypted_password <> '' and crypt(...)`: Postgres garandeert geen
   evaluatievolgorde voor `and`, wel voor `case`.
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
23. **Account met wachtwoord wordt gekoppeld en het wachtwoord is daarna
    leeg** (herzien, was negatief 5): gebonden id, bevestigd, `amr` = `otp`,
    `encrypted_password = crypt(...)` → rij terug, `auth.users.encrypted_password
    = ''`. Dit is het hoofdpad: GoTrue zet bij het openen van de uitnodiging
    zelf een wachtwoord.
24. **MFA-factoren weg na koppelen**: zelfde opzet met een verified
    `auth.mfa_factors`-rij op het account → na koppelen geen factor meer.
25. **Al gekoppeld account: wachtwoord blijft**: account al aan een lid
    gekoppeld, met wachtwoord en factor, `amr` = `otp` → null, wachtwoord en
    factor ongewijzigd (een in gebruik zijnd wachtwoord wordt nooit gewist).
26. **Ander account met hetzelfde adres: niets gewist** (variant van 4): het
    niet-gebonden account houdt wachtwoord en sessies.

Herziening 2, Beslissing 8 (eigen fixture: een uitgenodigde `bardienst` met
koppelsessie S1 en een tweede sessie S2 op hetzelfde account, beide in
`auth.sessions`):

27. **Overgebleven token registreert geen bar-sessie**: koppelen met S1
    (`amr` = `otp`); daarna claims met S2 (`amr` = `password`, de sessie die
    stap 9 verwijderde) → `register_bar_session('bar')` geeft
    `session_ended`, en er is geen `bar_sessions`-rij met `auth_session_id` =
    S2. Dit is de reviewer-aanval.
28. Idem met S2 → `set_own_pin('1234')` geeft `actor_not_found`; `pin_hash`
    blijft null.
29. **Positief**: claims met S1 → `register_bar_session('bar')` slaagt
    (de bewijzende sessie bestaat nog).
30. `session_id` van een bestaande `auth.sessions`-rij van een **ander**
    account → `register_bar_session('bar')` geeft `session_ended`
    (de `user_id`-voorwaarde).
31. `set_own_pin` zonder `session_id`-claim (alleen `sub`) →
    `actor_not_found`.

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
  reden bij de twee link-RPC's bijwerken (zie RPC's); Herziening 2: reden bij
  `register_bar_session` en `set_own_pin`.
- *(Herziening 2)* `bar_sessie_rpcs.test.sql`, `bar_rpcs_lid_en_device.test.sql`,
  `beheer_tweede_factor.test.sql`, `beheer_tweede_factor_randgevallen.test.sql`,
  `set_own_pin.test.sql`: `auth.sessions`-rijen voor de `session_id`'s
  waarmee `register_bar_session` of `set_own_pin` wordt aangeroepen; plus de
  nieuwe negatieve tests. Details: Herziening 2 → Checklist, punten 7-10.

### Bronverificatie (vastgelegd bewijs, vervangt de handmatige controle)

Gelezen in de broncode van Supabase Auth (GoTrue, `supabase/auth`, kopie van
2026-10-05; welke versie het gehoste project draait, is hier niet te zien,
daarom de integratietest en de controle na de merge):

| Wat | Waar | Gevolg voor deze spec |
|---|---|---|
| `verifyOtp` met `token_hash` (POST) geeft voor elk type `amr` = `otp` | `verify.go:285` | Beide callbacks (ADR 0008) leveren `otp`; staat in de lijst. |
| GET `/verify` impliciet: idem `otp`; PKCE: auth code met methode uit `type` | `verify.go:137-141`, `:185-190` | |
| PKCE-uitwisseling: `amr` = methode uit de flow state | `token.go:256` | `invite`, `magiclink`, `email/signup`; `recovery`/`email_change` niet in de lijst (keuze 1). |
| Methodenamen | `factor.go:117-141` | `email/signup` is de enige met een slash. |
| Openen van een uitnodiging (`invite`/`signup`) zet een tijdelijk wachtwoord als er geen is en `invited_at` gevuld is | `verify.go:317-329` | Reden voor de herziening van keuze 3. |
| Magic link voor onbekend/onbevestigd adres: Signup met tijdelijk wachtwoord | `magic_link.go:80-91` | Idem. |
| Signup op bestaand onbevestigd account wijzigt het account niet; met autoconfirm bevestigt het en geeft een sessie met `password` | `signup.go:193-196`, `:228-236`, `:305-315` | Randgevallen "Signup na de uitnodiging". |
| `inviteUserByEmail` op bestaand account: bevestigd → `email_exists`, onbevestigd → hergebruiken | `invite.go:42-72` | Keuze 2. |

### Integratietest tegen de echte GoTrue (nieuw, merge-voorwaarde)

CI start de volledige lokale stack al (`ci.yml`, `supabase start`) en zet
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en
`SUPABASE_SECRET_KEY`. Lokaal staat `enable_confirmations = false`: het
slechtste geval voor de aanval.

- Bestand `integration/account-koppeling.test.ts` (buiten `test/`, want `npm
  test` draait vóór `supabase start`; buiten `src/`, dus buiten
  `check:arch`/`check:policy`). `node --test`, zoals `test/`.
- Script `"test:integration": "node --test \"integration/**/*.test.ts\""` in
  `package.json`; toevoegen aan `check:all` na `db:test`, en in `ci.yml` een
  stap `npm run test:integration` na `npm run db:test`, vóór `supabase stop`.
- Twee clients per scenario: service-role (opzet, controle) en publishable
  key (de "gebruiker"). Unieke adressen per run (`koppel-<random>@example.test`).
  Ruimt eigen `members`- en `auth.users`-rijen op (`auth.admin.deleteUser`).
- Een `members`-rij met `invited_at` en `invited_auth_user_id` zet de test via
  de service-role-client rechtstreeks: `mark_member_invite_sent` eist een
  beheersessie met aal2 en is al door pgTAP gedekt.
- Tokens zonder mail: `auth.admin.generateLink({ type, email })` →
  `properties.hashed_token` → `verifyOtp({ token_hash, type })` op de
  gebruikersclient. Precies wat de callbacks doen.

Scenario's (elk met een eigen lid en adres):

1. **Hoofdpad uitnodiging.** `generateLink({ type: "invite" })` → id binden
   aan het lid → `verifyOtp({ type: "invite" })` → `amr` uit het access token
   bevat `otp` → `rpc("link_invited_member_account")` geeft het lid terug;
   `members.auth_user_id` = dat id. (Faalde op 73edbbf.)
   *(Herziening 2, erbij.)* Daarna met de koppelsessie `updateUser({
   password: P })` → geen fout. Dan een verse client: `signInWithPassword({
   email, password: P })` slaagt en `amr` bevat `password`. Met die
   wachtwoordsessie `rpc("register_bar_session", { p_mode: "bar" })` →
   geen fout, en (service-role) er is een `bar_sessions`-rij met
   `auth_session_id` = de `session_id`-claim van dat token. Dat bewijst
   tegen de echte GoTrue dat een gewone sessie een `auth.sessions`-rij met
   dat id heeft (Beslissing 8 blokkeert het normale pad niet), en dat het lid
   na koppelen zelf een wachtwoord kan zetten. Opruimen: `after()`
   verwijdert eerst (service-role) de `bar_sessions`-rijen van de aangemaakte
   leden, dan de leden (`bar_sessions.member_id` verwijst zonder `on delete`
   naar `members`; `0027` trekt voor `service_role` niets in).
2. **Portal-pad voor een `lid`.** Uitgenodigd lid (`type: "invite"`, binden),
   daarna `generateLink({ type: "magiclink" })` → `verifyOtp({ type:
   "magiclink" })` → `link_lid_member_account` koppelt.
3. **Aanval met signup, autoconfirm.** Uitnodigen en binden → aanvaller:
   `signUp({ email, password: P1 })` geeft een sessie → `updateUser({
   password: P2 })` → `link_invited_member_account` met die sessie geeft
   null. Daarna het lid via magic link → koppelt. Dan: `signInWithPassword({
   email, password: P2 })` faalt; `refreshSession` met het refresh token van
   de aanvaller faalt; `auth.getUser(<access token van de aanvaller>)` faalt
   (sessie bestaat niet meer). Slaagt die laatste toch: niet afzwakken, stop
   en meld het aan Bram (raakt ADR 0020 → Restrisico).
   *(Herziening 2, erbij.)*
   - **TOTP van de aanvaller.** Na `updateUser` en vóór zijn koppelpoging:
     `aanvaller.auth.mfa.enroll({ factorType: "totp" })` → `challenge` →
     `verify` met een code berekend uit `data.totp.secret` (RFC 6238, SHA-1,
     30 s, 6 cijfers; ~15 regels met `node:crypto` en een base32-decoder,
     geen nieuwe dependency). Daarna `getSession()` opnieuw lezen: het token
     is nu aal2, zelfde `session_id`, nieuw refresh token; gebruik dát token
     en refresh token voor de controles hierna. Controle vooraf (service-role
     `admin.auth.admin.mfa.listFactors({ userId })`): één factor, `totp`,
     `verified`. Na de koppeling: geen enkele factor.
   - **Geen bar-sessie en geen PIN met het oude token.** Na de koppeling, met
     een client die alleen het (aal2-)access token van de aanvaller als
     `Authorization` meestuurt: `rpc("register_bar_session", { p_mode: "bar"
     })` en `rpc(..., { p_mode: "beheer" })` geven allebei de fout
     `session_ended`; `rpc("set_own_pin", { p_pin: "1234" })` geeft
     `actor_not_found`. Service-role: geen `bar_sessions`-rij voor dit lid,
     `members.pin_hash` is null. Faalt dit omdat de RPC wél slaagt: niet
     afzwakken, stop en meld het.
4. **Wachtwoordlogin koppelt nooit.** Uitnodigen en binden → admin
   `updateUserById(id, { password: P, email_confirm: true })` →
   `signInWithPassword({ email, password: P })` → `amr` bevat `password` →
   link-RPC geeft null, `members.auth_user_id` blijft null.

Levert een pad een `amr`-methode op die niet in de lijst staat: stop en meld
het, niet zelf toevoegen (ADR 0020 → Beslissing 7).

### Na de merge (Bram, gehoste project, eenmalig)

Het gehoste project kan een andere GoTrue-versie draaien dan de lokale
stack, en "Confirm email" is daar onbekend. Vijf minuten, met een eigen
tweede mailadres:

1. Ledenbeheer → nieuw lid (rol `bardienst`) met dat adres → Uitnodigen.
2. Open de uitnodigingsmail op een ander apparaat of privévenster, klik de
   link. Verwacht: ingelogd; Ledenbeheer toont het lid als "account
   gekoppeld".
3. Supabase-dashboard → SQL editor: `select encrypted_password = '' as leeg
   from auth.users where email = '<adres>';` Verwacht `leeg = true`.
4. Portal → wachtwoord instellen voor dit lid; daarna op de bar inloggen
   vanaf de namenlijst met dat wachtwoord. Verwacht: lukt.
5. Herhaal 1-2 met een tweede adres, maar vraag vóór het klikken van de
   uitnodiging eerst een magic link aan op `/portal` en open alleen die.
   Verwacht: gekoppeld.

Mislukt stap 2 of 5: het lid blijft "uitgenodigd". Meld het; geen
herstelactie nodig, er is niets verkeerd gekoppeld (de controle faalt
dicht).

## Documentatie (door de Architect bij deze spec bijgewerkt)

- [ADR 0020](../adr/0020-koppelen-eist-bewijs-van-mailbezit.md) (nieuw).
- ADR 0006 → Aanvulling: verwijzing dat de matchregel vervangen is.
- `docs/ARCHITECTURE.md` → Lid-accounts: koppelvoorwaarden; Herziening 2:
  Beslissing 8.

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
  voor PostgREST (item "JWT na afmelden"). Herziening 2 dicht alleen wat zo'n
  token blijvend kan maken (bar-sessie, PIN); lezen tot het verloopt, en de
  sessiecontrole in `require_session`, horen bij dat item.
- `register_bar_session_server` dezelfde controle geven (alleen
  `service_role`, krijgt een vers `session_id`; Herziening 2 → Keuze).
- Signup op het project uitzetten: `enable_signup = false` zet ook de
  wachtwoordlogin uit (`supabase/config.toml`, commentaar bij `[auth]`).

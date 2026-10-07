# 0017 — Beheer eist een tweede factor (aal2), een beëindigde bar-sessie trekt ook de Auth-sessie in, en de server-side bar-login heeft een eigen limiet

Status: **gebouwd**

Toelichting: **geaccepteerd door Bram (2026-09-30)**, samen met de specs
[`docs/features/beheer-tweede-factor.md`](../features/beheer-tweede-factor.md)
en [`docs/features/login-rate-limit.md`](../features/login-rate-limit.md).
Aangevuld na de tweede review (Bram, 2026-10-01): restrisico K1 geaccepteerd,
promotie naar beheerder beëindigt de bar-sessies, en de loginlimiet telt
atomair. **Geïmplementeerd en gemerged**
([PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01,
merge-commit `ae89bd9`; migraties `0034`–`0037`). De punten onder Gevolgen →
"Te controleren op het gehoste project" zijn uitrolstappen en staan niet als
gedaan in de repo.
Aanleiding: de review van PR #120 (dienst per sessie, fase 1).

**Amendeert:**

- [ADR 0016](0016-dienst-hoort-bij-geregistreerde-app-sessies.md).
  - Beslissing 7 ("een PIN-sessie komt nooit in beheer"): klopt voor die
    sessie zelf, maar niet voor het account. Beslissing 1 hieronder is de
    afdwinging.
  - Beslissing 4 ("het einde van een sessie is een database-feit"): wordt
    aangevuld met Beslissing 2 hieronder.
- [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md) en
  [ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md):
  een beheersessie is voortaan een sessie in modus `beheer` **met aal2**.
  "E-mail/wachtwoord" alleen is niet meer genoeg.
- [ADR 0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md):
  een beheerder kan pas met de PIN inloggen als hij een geverifieerde tweede
  factor heeft.

**Laat ongemoeid:** geld beweegt alleen via RPC, en `served_by` komt uit de
bezetting. Geen enkele geld-RPC verandert. ADR 0006, 0008, 0009, 0012 en 0013
blijven staan.

## Context

### Probleem 1: een PIN-sessie kan het wachtwoord wijzigen

De PIN-login maakt een gewone Supabase-sessie aan met
`generateLink('magiclink')` en `verifyOtp` (`src/lib/barLogin.ts`). Het
sessiecookie is niet `HttpOnly`, dus het access token staat in de browser.

In de broncode van GoTrue (supabase/auth, geverifieerd 2026-09-30) staat:

- **Welke sessies GoTrue als herstel ziet.** Elke verify-flow (magic link,
  recovery, invite) geeft een sessie met amr `otp`. `Session.IsRecovery()`
  rekent `otp` en `magiclink` tot herstel.
- **Geen huidig wachtwoord nodig.** `PUT /auth/v1/user` vraagt voor zo'n
  sessie nooit het huidige wachtwoord, ook niet met
  `update_password_require_current_password`.
- **Geen herauthenticatie nodig.** `secure_password_change` vraagt alleen
  herauthenticatie als de sessie ouder is dan 24 uur. Een PIN-sessie is vers.

Wie de PIN van een beheerder kent, kan op een vertrouwd apparaat dus het
wachtwoord van dat account wijzigen. Daarna logt hij op `/beheer` in met
e-mail en het nieuwe wachtwoord, en krijgt hij beheer. Hetzelfde geldt voor
een hervatte bar-sessie die uit een magic link komt ("iedereen mag
bevestigen", ADR 0016 → Beslissing 8). Dat botste met CLAUDE.md → Auth,
dat toen zei: "een PIN-login geeft nooit beheer". Na deze ADR luidt die
regel: "een PIN-login geeft zonder tweede factor nooit beheer" (zie
Restrisico's, K1).

Wat GoTrue wél afdwingt (`user.go`, `mfa.go`): heeft een gebruiker een
geverifieerde tweede factor, dan weigert GoTrue een aal1-sessie bij:

- het wijzigen van wachtwoord of e-mailadres;
- het toevoegen van een nieuwe factor;
- het verwijderen van een factor.

Een beëindigde GoTrue-sessie (de rij in `auth.sessions` is weg) weigert
GoTrue bij `/user` meteen, ook als het access token nog geldig is.

### Probleem 2: Supabase ziet alleen het IP-adres van Vercel

De login vanaf de namenlijst draait server-side (ADR 0016 → Beslissing 6).
GoTrue ziet daardoor het IP-adres van de Vercel-functie, niet dat van de
gebruiker.

- **Password-grant en refresh-grant delen één limiet.** In GoTrue delen ze
  per IP dezelfde `Token`-limiter (`token.go`). Een reeks foute wachtwoorden
  via de bar kan daarmee andere logins blokkeren, en ook de token-verversing
  die `src/middleware.ts` op de server doet.
- **De limiet grijpt niet bij wisselende IP's.** De IP's van Vercel
  wisselen, dus bij spreiding grijpt de limiet niet meer.
- **`/inloggen/vergeten` heeft geen eigen limiet** en kan het
  e-mailquotum van het project opmaken.
- **Doorsturen van het IP (`Sb-Forwarded-For`).** GoTrue kan het IP via
  deze header doorkrijgen, maar dat staat standaard uit. Of het gehoste
  project dat veilig aanbiedt, is niet bevestigd.

## Beslissing

**1. Beheer eist een sessie met aal2: TOTP als tweede factor voor
beheerders.**

- `register_bar_session('beheer')` en `require_beheer_session()` eisen
  `auth.jwt()->>'aal' = 'aal2'`, naast modus `beheer` en de ADR
  0002-actorcheck.
- Een beheerder zonder geverifieerde factor kan geen beheersessie
  registreren.
- De factor stel je in de portal in (Bram, 2026-09-30).
- Zo komt beheer niet meer uit "wie het wachtwoord kent". Het komt uit
  "wie het wachtwoord (of de PIN op een vertrouwd apparaat) kent én de
  factor heeft". Een aal1-sessie kan wachtwoord, e-mail en factoren niet
  meer wijzigen, en dat dwingt GoTrue zelf af, ongeacht of de sessie uit een
  PIN, een hervatting, een gestolen tablet of een gephisht wachtwoord komt.
- Een PIN-sessie die met de code naar aal2 gaat, kan dat wél: GoTrue vraagt
  bij amr `otp` geen huidig wachtwoord. PIN + vertrouwd apparaat + factor
  geeft dus via een wachtwoordwijziging beheer. Dat is vergelijkbaar met
  wachtwoord + factor en is een geaccepteerd restrisico (K1, zie Gevolgen).
  De regel is daarom niet "een PIN-login geeft nooit beheer", maar "een
  PIN-login geeft zonder tweede factor nooit beheer".
- Wordt een lid beheerder (`set_member_role` naar `beheerder`), dan eindigen
  diens actieve bar-sessies en de bijbehorende Auth-sessies meteen
  (sluitreden `beheerder_geworden`). Zo wordt een lopende aal1-sessie van een
  bardienst nooit de sessie van een beheerder zonder factor
  (`beheer-tweede-factor.md` → Promotie naar beheerder).

Er blijft één gat: zolang een beheerder nog geen geverifieerde factor heeft,
kan een aal1-sessie van dat account zelf een factor toevoegen. Twee regels
sluiten dat gat zover het de bar betreft:

- de PIN werkt niet voor een beheerder zonder geverifieerde factor
  (`verify_bar_pin` en `bar_login_options`);
- de bar-sessie van een beheerder zonder geverifieerde factor wordt niet
  hervat. Die sessie wordt gesloten met `niet_hervat`, net als een
  beheersessie.

**2. Het einde van een bar-sessie trekt ook de Auth-sessie in.**
`close_bar_session_internal` verwijdert de rij in `auth.sessions` met
`id = bar_sessions.auth_session_id`. Dat geldt voor elke reden: uitgelogd,
`niet_hervat`, afgemeld, inactief, geen bar-rol en beheerder geworden. Een
gekopieerd token kan daarna geen `/auth/v1/user` meer aanroepen en niet meer verversen. De
database blijft de waarheid (ADR 0016 → Beslissing 4); dit maakt die waarheid
ook voor GoTrue geldig.

**3. De server-side bar-login heeft een eigen limiet, vóór Supabase.** De
routes onder `src/app/(bar)/inloggen/` tellen pogingen in een eigen tabel.
Dat gebeurt:

- per IP-adres van de gebruiker, uit de proxy-header van Vercel;
- per lid.

De tellers lopen via functies die alleen `service_role` mag uitvoeren. Een
poging wordt atomair gereserveerd (lock per bucket en sleutel, tellen,
voorlopige rij) en weer vrijgegeven als de uitkomst niet telt, zodat ook
gelijktijdige verzoeken correct tellen (Bram, 2026-10-01).
Wachtwoord en PIN tellen alleen foute pogingen, "wachtwoord vergeten" telt
aanvragen (Bram, 2026-09-30). De namenlijst verliest de rol, zodat
beheerders van buitenaf niet als doelwit te herkennen zijn. De limiet van
Supabase blijft eronder bestaan, maar is niet meer de enige rem.
CAPTCHA komt pas als dit niet genoeg blijkt. `Sb-Forwarded-For` komt pas
als Supabase bevestigt dat het op het gehoste project veilig kan. Beide zijn
een latere aanvulling, geen vervanging.

## Verworpen alternatieven

- **Alleen de Auth-config (`secure_password_change`,
  `update_password_require_current_password`).** Werkt niet voor sessies
  met amr `otp`, en elke PIN-sessie is er zo een (zie Context).
- **Geen PIN voor beheerders, plus "huidig wachtwoord verplicht".** Vraagt
  een reeks losse regels, en elke ontbrekende regel is een gat:
  - geen hervatting;
  - geen "Bar" na een magic link;
  - de beheerder typt aan de bar altijd het wachtwoord.
  Het beschermt ook niet tegen een gephisht wachtwoord.
- **Wachtwoord alleen via een eigen route, met een trigger op `auth.users`
  die elke wijziging zonder ticket weigert.** GoTrue schrijft
  `encrypted_password` ook zelf bij het inloggen (her-encryptie,
  `token.go`), en dat kan zo'n trigger niet onderscheiden. Het schema is van
  GoTrue, en alle wachtwoordflows en het dashboard moeten dan om.
- **HttpOnly-sessiecookies en alle data via de server.** Dat is een herbouw
  van de datalaag. Te groot voor dit probleem.
- **Alleen de limiet van Supabase (`X-Forwarded-For` doorgeven).** GoTrue
  vertrouwt `X-Forwarded-For` van ons niet. Een header die wél vertrouwd
  wordt, kan iedereen met de publieke anon-key vervalsen, tenzij het
  platform dat afschermt.

## Gevolgen

- **Beheerders hebben een authenticator-app nodig.** Direct na de uitrol is
  beheer onbereikbaar tot de beheerder in de portal een factor heeft
  ingesteld. Het eerst in te stellen account is dat van Bram.
- **Een verloren telefoon maakt beheer onbereikbaar** tot Bram de factor
  via het Supabase-dashboard terugzet (besloten 2026-09-30). De app heeft
  daar geen functie voor.
- **Restrisico dat blijft:**
  - een bardienst zonder factor. Wie diens PIN kent en bij een vertrouwd
    apparaat kan, kan het wachtwoord van die bardienst wijzigen. Dat geeft
    geen beheer. **Geaccepteerd door Bram (2026-09-30)**; een bardienst krijgt
    geen tweede factor;
  - een onbeheerde, actieve bar-sessie van een beheerder die nog geen factor
    heeft. Dat is hetzelfde restrisico als een gestolen apparaat, en het
    verdwijnt zodra de beheerder een factor instelt;
  - **K1: PIN + vertrouwd apparaat + factor.** Wie de PIN van een beheerder
    kent, bij een voor die beheerder vertrouwd apparaat kan én diens
    authenticator heeft, kan in de PIN-sessie de code invoeren (aal2), dan
    zonder huidig wachtwoord een nieuw wachtwoord zetten (GoTrue vraagt dat
    niet bij amr `otp`) en daarmee op `/beheer` beheer krijgen. Dat is
    vergelijkbaar met wachtwoord + factor. **Geaccepteerd door Bram
    (2026-10-01).**
- **Wachtwoord wijzigen of herstellen vraagt de code**, voor een account met
  een factor. Dat geldt in de portal en op `/beheer/wachtwoord-herstellen`:
  een herstelsessie is aal1.
- **Een inactieve sessie heeft geen Auth-sessie meer.** De melding "Je bent
  uitgelogd" verschijnt alleen zolang het access token nog geldig is.
  Daarna ziet de gebruiker direct het startscherm. Akkoord van Bram
  (2026-09-30).
- **De beheerdersingrepen vanuit bar-modus** (afsluiten, overnemen,
  afmelden; besloten 12a/12c in `dienst-per-sessie.md`) vragen geen aal2.
  Akkoord van Bram (2026-09-30).
- **Te controleren op het gehoste project:**
  - TOTP staat aan (Auth → MFA);
  - `postgres` mag uit `auth.sessions` verwijderen en `auth.mfa_factors`
    lezen;
  - de header `x-real-ip` / `x-forwarded-for` op Vercel is niet door de
    client te vervalsen.
- **Geen nieuwe gate.** Wat hier afgedwongen wordt, bewaken pgTAP-tests en
  `check:rls`. Dat `require_beheer_session` aal2 eist, is een negatieve test
  per beheer-RPC, zoals ADR 0016 dat al voor de modus doet.
- **Documentatie**: doorgevoerd met de bouw, zie
  `beheer-tweede-factor.md` → "Doorgevoerd in bestaande documenten".

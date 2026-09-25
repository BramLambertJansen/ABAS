# Portal-login (magic link + wachtwoord)

Spec voor [issue #15](https://github.com/BramLambertJansen/ABAS/issues/15).

**Status: concept — wacht op akkoord van Bram, met twee expliciete open
vragen (zie onderaan) voordat de Developer begint.** Introduceert een nieuwe
architectuurbeslissing (cookie-isolatie) — zie
[ADR 0009](../adr/0009-portal-sessie-eigen-cookienaam.md), zelf ook nog
voorgesteld, niet geaccepteerd.

Bouwt voort op ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) (sessie via
`@supabase/ssr`, cookie-based, één actieve sessie per browser),
[0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)
(Beslissing 1: "Leden met alleen de `lid`-rol vallen hier buiten:
portal-login is al e-mail-only, dat verandert niet" — dit ticket bouwt precies
dat, ongewijzigd),
[0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
(wachtwoord-verplicht geldt uitdrukkelijk alleen voor `bardienst`/`beheerder`
— voor `lid` blijft "magic link of wachtwoord, beide actief" zonder dwang,
CLAUDE.md → Auth) en
[0008](../adr/0008-auth-maillinks-via-token-hash.md) (elke auth-maillink via
`token_hash`, apparaat-onafhankelijk). Hergebruikt bouwstenen uit
`docs/features/wachtwoord-vergeten.md` (`NieuwWachtwoordVelden.tsx`,
`src/lib/passwordPolicy.ts`, `src/lib/authErrors.ts`) en het patroon uit
`docs/features/lid-account-invite.md`/[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
→ "Aanvulling" (self-service e-mail-koppeling na een invite) — die laatste
noemt #15 al expliciet als de verwachte volgende toepassing van datzelfde
sub-patroon.

## Onderzocht in /designs/

- `designs/Lid App.dc.html`, `loginMethods` (regel 140/447/600): een
  gesegmenteerde inlogkeuze wachtwoord/pincode/maillink. **Pincode valt
  buiten deze spec** — CLAUDE.md → Auth noemt voor de portal uitsluitend
  "magic link of wachtwoord, beide actief", geen pincode; de issue-tekst en
  acceptatiecriteria van #15 noemen pincode evenmin. Dit is dezelfde
  portal-PIN die `docs/features/auth-methode-per-lid.md` → "Onderzocht in
  /designs/" al signaleerde als "geen bruikbaar 1-op-1 ontwerp voor
  `shells/bar`... nooit voor bar/beheer-personeel" bij die ADR — hier
  bevestigd vanuit de andere kant: het bestaat als ontwerp-idee voor de
  portal, maar geen kader (CLAUDE.md, deze issue) vraagt erom. Een latere,
  eigen ticket kan dit oppakken.
- `designs/chats/chat30.md` (regel 9/39/41/43/45): de wireframe-auteur
  beschrijft zelf drie dingen — (1) introductieschermen voor een lid dat de
  app opent via een magic link, met daarna verplicht "wachtwoord kiezen" en
  optioneel "pincode instellen"; (2) een gewoon inlogscherm
  (wachtwoord/pincode/maillink); (3) wachtwoord-vergeten (mail → nieuw
  wachtwoord → direct ingelogd). **Alleen (2) en, gedeeltelijk, (3) zijn
  onderdeel van deze spec.** Punt (1)'s "wachtwoord kiezen"-onboardingscherm
  is, voor bardienst/beheerder, al expliciet bij #17 belegd, niet bij #14/#24
  (`docs/features/lid-account-invite.md`, herzieningspunt 2: "de copy bij de
  invite-knop beloofde een wachtwoord-instelscherm dat nergens bestaat — dat
  scherm is issue #17"). Dezelfde grens geldt hier: het portal-equivalent van
  dat onboardingscherm hoort bij #17, niet bij #15 — #15 levert het
  inlogscherm zelf, niet de wizard die volgt op een allereerste magic link.
  Punt (3) wijkt af van `wachtwoord-vergeten.md`'s precedent op één punt
  ("direct ingelogd" i.p.v. "terug naar inloggen, opnieuw inloggen") — zie
  Schermflow → Wachtwoord vergeten voor de keuze om het precedent te volgen,
  niet de wireframe, net zoals `wachtwoord-vergeten.md` zelf al deed voor
  `/beheer` (CLAUDE.md → Designbestanden: afwijking van de wireframe is
  normale evolutie).
- `designs/Lid App.dc.html` regel 148–150/179–181/190–196: het daadwerkelijke
  scherm-skelet (e-mailveld, wachtwoordveld, "Wachtwoord vergeten?"-link,
  "Terug naar inloggen") — visueel precedent voor `PortalLogin.tsx`, exacte
  vorm/copy aan de Developer/design system, zelfde afweging als
  `BeheerLogin.tsx` destijds ("hier bewust geen bestaand formulier-patroon
  om op aan te sluiten... eerste e-mail-inlogflow", nu voor de tweede keer,
  ditmaal wél met `BeheerLogin.tsx` zelf als functioneel precedent).

## Doel

Een lid (rol `lid`) logt in op `shells/portal` met het eigen e-mailadres —
magic link of wachtwoord, beide altijd actief, geen keuze die het lid
"instelt" (in tegenstelling tot bardienst/beheerder onder ADR 0005: voor
`lid` is er geen either/or en geen verplichting, zie CLAUDE.md → Auth).
Beide paden verifiëren tegen dezelfde `auth.users`-rij en dus tegen hetzelfde
`members`-record. Een portal-sessie mag nooit het gedeelde bar-tablet-
device-account overnemen als "ingelogde gebruiker" — zie ADR 0009.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen
als volgt:**

- **"Geld beweegt alleen via RPC."** Niet van toepassing — dit ticket is
  puur auth, geen `balance_cents`-wijziging, geen `place_order`/`top_up`-
  aanroep. Een ingelogd lid *ziet* straks (latere ticket, portal-schermen
  bestaan nog niet) het eigen saldo via de bestaande RLS-narrowing (ADR
  0007), maar wijzigt het hier niet.
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — de portal heeft geen dienst-/bezettingsconcept (CLAUDE.md →
  Domein: een lid "ziet eigen saldo en transacties. Verder niets.").

## Betrokken shell

**Alleen `shells/portal`.** Geen wijziging aan `shells/bar`,
`src/middleware.ts`, `src/lib/supabase/client.ts` of `server.ts` — zie ADR
0009 voor waarom de cookie-isolatie zonder die wijzigingen kan.

- **Nieuw:** `src/features/portal-login/PortalLogin.tsx` (inlogscherm,
  functioneel/structureel naast `src/features/assortimentbeheer/
  BeheerLogin.tsx`, geen gedeeld component — de twee formulieren delen
  vorm/precedent, niet code, zelfde reden als hieronder bij "Herbruik"
  toegelicht) + `src/hooks/queries/usePortalLogin.ts` (magic
  link/wachtwoord) + `src/hooks/queries/usePortalSession.ts` (sessie →
  `lid`-rol member, analoog aan `useBeheerSession.ts`).
- **Nieuw:** `src/app/portal/callback/route.ts` (analoog aan
  `src/app/(bar)/beheer/callback/route.ts`) en
  `src/app/portal/wachtwoord-herstellen/page.tsx` +
  `src/hooks/queries/usePortalWachtwoordHerstellen.ts` (analoog aan
  `useWachtwoordHerstellen.ts`, zie "Herbruik" hieronder voor wat wél en
  niet gedeeld wordt).
- **Gewijzigd:** `src/shells/portal/PortalShellHome.tsx` — van statische
  placeholder naar een echte branch op `usePortalSession()`: geen sessie →
  `PortalLogin`; wel een sessie die naar een actief `lid`-record herleidt →
  een minimale, nog steeds placeholder "ingelogd als {naam}" + uitlog-knop
  (er is nog geen saldo-/transactiescherm — dat is een later ticket; deze
  spec levert alleen de branch die nodig is om acceptatiecriterium 4
  ("de portal toont geen ingelogde staat totdat het lid daadwerkelijk zelf
  inlogt") objectief te kunnen verifiëren). Een sessie die wél bestaat maar
  niet naar een actief `lid`-record herleidt (bv. een bardienst/beheerder-
  e-mailadres dat toevallig ook een `lid`-rij zonder koppeling heeft, of een
  weeslied `auth.users`-record) toont dezelfde neutrale
  "niet gekoppeld"-melding als `useBeheerSession.ts`'s `denied`-staat, zie
  Randgevallen.
- **Nieuw:** `src/lib/supabase/portalClient.ts` + `portalServer.ts` — zie
  ADR 0009.

### Herbruik — wat wél en niet gedeeld wordt

- **Gedeeld, ongewijzigd:** `src/components/NieuwWachtwoordVelden.tsx`,
  `src/lib/passwordPolicy.ts`, `src/lib/authErrors.ts`
  (`isRateLimitedMessage`/`RATE_LIMITED_MESSAGE`) — geen van drieën raakt
  `createClient()` of een cookie, dus geen isolatie-probleem. Precies het
  hergebruik dat `wachtwoord-vergeten.md` → "Herbruikbaar voor portal en
  #17" al aankondigde.
- **Niet gedeeld, bewust nieuwe bestanden met hetzelfde patroon:**
  `usePortalLogin.ts`/`usePortalSession.ts`/
  `usePortalWachtwoordHerstellen.ts` zijn eigen bestanden, geen import van
  `useBeheerLogin.ts`/`useBeheerSession.ts`/`useWachtwoordHerstellen.ts` —
  die laatste drie importeren `@/lib/supabase/client`, wat de nieuwe
  `check:arch`-regel (ADR 0009) portal-code juist verbiedt. Dit is dus geen
  duplicatie-om-het-duplicatie (CLAUDE.md → "Componenten zijn herbruikbaar
  totdat bewezen anders"): de reden dat het niet dezelfde bestanden kunnen
  zijn is de cookie-isolatie zelf, niet een stijlvoorkeur. `PortalLogin.tsx`
  volgt hetzelfde structurele patroon als `BeheerLogin.tsx` (methode-keuze,
  focusbeheer na wisselen, `aria-disabled` i.p.v. `disabled` op de
  verstuur-knop — zie `wachtwoord-vergeten.md` → "Gebouwd vs. gespecificeerd"
  → "Focusbeheer" voor het exacte patroon (`#77`)) zonder de code te delen.

## Cookie-isolatie (ADR 0009)

Samengevat hier voor de Developer; volledige motivatie/verworpen
alternatieven in de ADR:

- `src/lib/supabase/portalClient.ts`/`portalServer.ts` gebruiken
  `cookieOptions: { name: "sb-portal-auth-token", path: "/portal" }`.
- `src/middleware.ts`, `src/lib/supabase/client.ts`, `server.ts` blijven
  **volledig ongewijzigd**.
- **Nieuwe, verplichte `check:arch`-regel** (Developer voegt toe aan
  `scripts/check-arch.mjs`, zelfde stijl als de bestaande shell-isolatie-
  regel):
  - elk bestand onder `src/app/portal/`, `src/shells/portal/` of
    `src/features/portal-login/` dat `@/lib/supabase/client` of
    `@/lib/supabase/server` importeert → fout;
  - elk bestand **buiten** die drie mappen dat `@/lib/supabase/portalClient`
    of `@/lib/supabase/portalServer` importeert → fout.
- **Acceptatiecriterium 4 is hiermee direct verifieerbaar**: een bar-sessie
  (device-cookie, default naam, `path: "/"`) wordt door de browser wel
  meegestuurd naar `/portal`-requests, maar `portalClient.ts`/`portalServer.ts`
  zoeken naar `sb-portal-auth-token` — een cookie dat pas bestaat na een
  daadwerkelijke portal-login. `usePortalSession()` rapporteert dus
  `signed-out` voor zo'n bezoek, ongeacht wat de bar-sessie is. Test-precedent
  voor de Tester: zelfde opzet als de e2e-check die
  `wachtwoord-vergeten.md` al voor `/beheer` heeft (`e2e/helpers/
  supabaseMock.ts`), hier uitgebreid met een scenario dat eerst `/` bezoekt
  (bar-device-cookie krijgt de kans te zetten) en dan naar `/portal`
  navigeert.

## Datamodel

**Geen migratie nodig voor de kernlogica van deze spec** (login voor een
lid dat al `auth_user_id` gekoppeld heeft) — dat loopt volledig via Supabase
Auth-calls (`signInWithOtp`, `signInWithPassword`, `verifyOtp`,
`resetPasswordForEmail`, `updateUser`) en de bestaande RLS-narrowing voor rol
`lid` (`0015_lid_leest_alleen_eigen_rijen.sql`, ADR 0007) — ongewijzigd.

**Wél afhankelijk van een migratie voor de koppeling zelf** (hoe een
`lid`-rol `members`-rij aan `auth_user_id` komt) — zie "Ledenkoppeling voor
rol `lid`" hieronder. Dat onderdeel is voorgesteld, niet vastgesteld — zie
Open vragen.

## RPC's

**Geen nieuwe RPC voor het inloggen zelf** — Supabase Auth-calls zijn geen
RPC's (zelfde constatering als `wachtwoord-vergeten.md` → "Geldlaag,
datamodel, RPC's").

**Voorgesteld: `link_lid_member_account() returns members`**, nieuwe
migratie `supabase/migrations/0021_lid_account_koppelen.sql`, voor de
koppeling — zie "Ledenkoppeling voor rol `lid`" hieronder. Onderdeel van het
voorstel, niet van de vastgestelde kern.

## Schermflow

### 1. `/portal`, geen sessie — `PortalLogin.tsx`

Gesegmenteerde methode-keuze **magic link / wachtwoord** (geen pincode, zie
"Onderzocht in /designs/"), zelfde structuur als `BeheerLogin.tsx`:
e-mailveld, methode-fieldset, wachtwoordveld alleen zichtbaar bij methode
"Wachtwoord", "Wachtwoord vergeten?"-link daaronder, submit-knop
(`aria-disabled` tijdens pending, niet `disabled` — #77-patroon), focus
expliciet verplaatst bij elke weergavewissel (WCAG 2.4.3, zelfde
`focusAfterSwitch`-patroon als `BeheerLogin.tsx`).

- **Magic link** (`usePortalLogin().signInWithMagicLink(email)`):
  `signInWithOtp({ email, options: { shouldCreateUser: <zie Open vraag 2>,
  emailRedirectTo: \`${origin}/portal/callback\` } })`, via
  `portalClient.ts`.
- **Wachtwoord** (`usePortalLogin().signInWithPassword(email, password)`):
  `signInWithPassword({ email, password })`, via `portalClient.ts`. Faalt
  met "onjuist e-mailadres of wachtwoord" — dit pad lekt geen
  accountbestaan (issue #70: "Het wachtwoordpad... lekt niet en blijft
  zoals het is"), geen wijziging nodig t.o.v. hoe `BeheerLogin.tsx` dit al
  doet.
- **Neutrale melding voor magic link (issue #70, "Hetzelfde geldt straks
  voor de portal-login (#15)")**: elke uitkomst van `signInWithMagicLink` —
  geslaagd, onbekend adres, rate limit, onbekende fout — toont dezelfde
  melding: "Als er een account bij {email} hoort, hebben we een inloglink
  gestuurd." Geen onderscheid naar foutcode zoals `BeheerLogin.tsx` dat
  vandaag nog wel maakt (dat blijft daar de eigen, nog openstaande #70-fix;
  deze spec bouwt het hier meteen goed, herbouwt `BeheerLogin.tsx` niet).
  Exact hetzelfde patroon als `wachtwoord-vergeten.md`'s
  `useWachtwoordResetAanvragen` (altijd `status: "sent"`, fout alleen
  gelogd via `console.error`) — `usePortalLogin.ts`'s
  `signInWithMagicLink` volgt die vorm, niet `useBeheerLogin.ts`'s huidige
  (lekkende) vorm.

### 2. `/portal/callback`

Analoog aan `/beheer/callback` (ADR 0008): accepteert `?token_hash=&type=`
(`email`/`magiclink`) naast `?code=`, wisselt in via `portalServer.ts`
(`verifyOtp`/`exchangeCodeForSession`), redirect altijd naar `/portal`
ongeacht uitkomst (fout gelogd, niet getoond — er is op deze route geen
scherm). **Roept, ná een geslaagde sessie-uitwisseling, best-effort de
voorgestelde `link_lid_member_account()` aan** (zie hieronder) — zelfde
"onvoorwaardelijk, nooit blokkerend"-vorm als `/beheer/callback`'s
`link_invited_member_account()`-aanroep.

### 3. Wachtwoord vergeten

`PortalLogin.tsx` → "Wachtwoord vergeten?" → aanvraagweergave (zelfde vorm
als `BeheerLogin.tsx`'s forgot-view) →
`usePortalWachtwoordHerstellen().requestReset(email)` →
`resetPasswordForEmail(email, { redirectTo:
\`${origin}/portal/wachtwoord-herstellen\` })` via `portalClient.ts` →
**altijd** dezelfde neutrale melding, ook bij rate limit
(`wachtwoord-vergeten.md` besluit 4, letterlijk hergebruikt, niet
heroverwogen): "Als er een account bij {email} hoort, hebben we een link
gestuurd om een nieuw wachtwoord in te stellen. De link is 1 uur geldig."

`/portal/wachtwoord-herstellen`: zelfde contract als
`/beheer/wachtwoord-herstellen` — `token_hash`/`type=recovery` pas
ingewisseld bij verzenden (ADR 0008, mailscanner-veilig), formulier met
`NieuwWachtwoordVelden.tsx` (hergebruikt, ongewijzigd), `verifyOtp` →
`updateUser({ password })` → `signOut()` → terug naar `/portal?wachtwoord=
gewijzigd`. **Bewust dezelfde "terug naar inloggen, opnieuw inloggen"-vorm
als `wachtwoord-vergeten.md` besluit 2 — niet chat30's "direct ingelogd".**
Motivatie: consistentie tussen de twee bestaande/nieuwe herstelschermen
weegt zwaarder dan het volgen van een wireframe-detail dat voor `/beheer` al
bewust is losgelaten (CLAUDE.md → Designbestanden: "afwijking van de
wireframe is normale evolutie, geen defect" — hier toegepast in de andere
richting, wireframe wijkt af van het al gekozen precedent, niet omgekeerd).

## Ledenkoppeling voor rol `lid` (voorstel — zie Open vraag 1)

**Waarom dit hier staat, en waarom het niet gewoon is aangenomen:** issue
#15's eigen tekst/acceptatiecriteria noemen alleen het inlogscherm, geen
koppelmechanisme. Maar `docs/features/lid-account-invite.md` → "Besloten
door Bram (2026-09-21)", punt 1, legt vast: *"Rolreikwijdte: voorlopig alleen
bardienst/beheerder, niet lid... lid-rol invites volgen pas als onderdeel
van #15 zelf, geen nieuw ticket hier."* Zonder enig koppelmechanisme is
acceptatiecriterium 3 ("beide paden leiden naar hetzelfde lid-account") ook
niet zinvol te verifiëren met een echt `lid`-account (alleen met een
handmatig-in-Studio-geprovisioned fixture, zie Randgevallen) — en die eerdere
beslissing zegt expliciet dat dat niet de bedoeling is. Dit is dus geen
losse toevoeging maar een spanning tussen de letterlijke issue-tekst en een
eerder vastgelegd besluit, die ik niet zelf oplos — zie Open vraag 1 voor de
twee concrete opties.

**Voorstel (Architect-aanbeveling, optie B hieronder), voor het geval Bram
akkoord geeft:**

1. **Hergebruik, geen herbouw, van issue #24's bestaande machinerie**
   (`docs/features/lid-account-invite.md`, [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
   → "Aanvulling", die #15 al met naam noemt als verwachte volgende
   toepassing van hetzelfde e-mail-matching-sub-patroon):
   - **`mark_member_invite_sent`'s eligibility (server-side actie, RPC's
     punt 3 in `lid-account-invite.md`) breidt uit van `role in
     ('bardienst', 'beheerder')` naar `role in ('bardienst', 'beheerder',
     'lid')`.** Geen wijziging aan de RPC zelf, alleen aan de
     eligibility-stap in de server-side actie.
   - **`LidBeherenOverlay.tsx`'s "Inloggegevens"-blok wordt zichtbaar voor
     élke rol, niet alleen `role !== 'lid'`.** Voor `role === 'lid'` toont
     het blok **geen** Pincode-regel (die `has_pin`-status is een
     bardienst/beheerder-concept, CLAUDE.md → "Dienst & bezetting" —
     ongewijzigd niet van toepassing op `lid`), wél de bestaande
     Wachtwoordaccount-status + de "Invite (opnieuw) versturen"-knop,
     ongewijzigd gedrag verder.
   - Een beheerder kan zo, vanuit dezelfde plek als vandaag, ook een
     `lid`-rol member (met e-mailadres, `ledenbeheer-email.md`) een
     magic-link-invite sturen.
2. **Nieuwe RPC `link_lid_member_account() returns members`**
   (`supabase/migrations/0021_lid_account_koppelen.sql`), zelfde vorm als
   `link_invited_member_account()` maar met een harde `role = 'lid'`-filter
   — **bewust nooit** een `bardienst`/`beheerder`-rij, ook niet als het
   e-mailadres toevallig matcht. Dit is geen stijlkeuze: zonder deze filter
   zou de laagdrempelige portal-route (geen beheerder-sessie nodig) een weg
   worden om een bardienst/beheerder-rol te koppelen buiten
   `/beheer/callback`'s eigen (bewust apart gehouden, `invited_at`-gated)
   pad om — een bevoegdheidslek, niet een randgeval.
   ```sql
   create or replace function link_lid_member_account()
   returns members
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_email text;
     v_match_count int;
     v_member_id uuid;
     v_member members;
   begin
     v_email := auth.email();
     if v_email is null then
       return null;
     end if;

     select count(*) into v_match_count
     from members
     where lower(email) = lower(v_email)
       and auth_user_id is null
       and invited_at is not null
       and role = 'lid';

     if v_match_count <> 1 then
       return null;
     end if;

     select id into v_member_id
     from members
     where lower(email) = lower(v_email)
       and auth_user_id is null
       and invited_at is not null
       and role = 'lid';

     update members
       set auth_user_id = auth.uid()
       where id = v_member_id
       returning * into v_member;

     v_member.pin_hash := null;
     return v_member;
   end;
   $$;

   grant execute on function link_lid_member_account to authenticated;
   ```
   Zelfde eigenschappen als `link_invited_member_account`: geen foutcodes
   (stille no-op), geen rolcheck op de aanroeper (zelfkoppeling), case-
   insensitieve e-mailmatch, `pin_hash`-scrub verplicht
   (`0010_pin_hash_kolombeveiliging.sql`'s precedent). Aangeroepen vanuit
   `/portal/callback` met `portalServer.ts` (sessie-gebonden client — zelfde
   technische noodzaak als `link_invited_member_account`: `auth.email()` is
   alleen gevuld binnen een echte sessie).
   **Volledig pgTAP-testbaar** (ADR 0006 → "Aanvulling" → Gevolgen, zelfde
   argument: geen Auth-Admin-API-afhankelijkheid binnen de RPC zelf).
3. **Met deze uitbreiding is `shouldCreateUser: false`** voor
   `usePortalLogin().signInWithMagicLink` (zelfde reden als `BeheerLogin.tsx`
   vandaag al kiest: geen ongekoppelde, ruis-`auth.users`-rijen voor
   willekeurige e-mailadressen — alleen al-uitgenodigde adressen krijgen
   daadwerkelijk een werkende link). Zie Open vraag 2 voor het alternatief
   (`true`) en waarom dat een apart afwegingspunt blijft.

**Niet voorgesteld, expliciet buiten dit voorstel:** het "kies een
wachtwoord"-onboardingscherm na een eerste magic link (chat30) — dat blijft,
zoals hierboven bij "Onderzocht in /designs/" gemotiveerd, #17's scope, ook
onder dit voorstel.

## Rolzichtbaarheid

- `PortalLogin.tsx`/`/portal/callback`/`/portal/wachtwoord-herstellen` zijn
  zichtbaar zonder sessie — dat is het punt, zelfde als `BeheerLogin.tsx`.
- Een sessie die wél bestaat maar niet naar een actief `lid`-record herleidt
  (device-cookie kan dit sowieso niet meer, zie Cookie-isolatie; wél
  mogelijk: een bardienst/beheerder-e-mailadres dat op de portal probeert in
  te loggen, of een sessie zonder gekoppeld `members`-record) toont
  `usePortalSession()`'s `denied`-staat: "Dit account is niet gekoppeld aan
  een lid." — geen onderscheid naar "wel een account, verkeerde rol" versus
  "geen account", zelfde neutraliteitsprincipe als de rest van deze spec
  (geen informatie weggeven die niet nodig is). Een bardienst/beheerder-lid
  dat zowel een `bardienst`/`beheerder`- als een `lid`-rol-record met
  hetzelfde `auth_user_id` zou hebben bestaat vandaag niet (elk `members`-
  record heeft precies één rol) — geen extra afhandeling nodig.
- `link_lid_member_account()` (voorstel): geen rolcheck op de aanroeper,
  harde `role = 'lid'`-filter op het doelrecord — zie "Ledenkoppeling"
  hierboven.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Bar-sessie actief (device-cookie), lid navigeert naar `/portal` | Geen ingelogde staat (ADR 0009, cookie-isolatie) — `PortalLogin.tsx` toont het inlogformulier. Kernscenario van acceptatiecriterium 4. |
| Magic link/wachtwoord-login voor een e-mailadres zonder (gekoppeld) `lid`-account | Magic link: neutrale "als er een account bij ... hoort"-melding, geen sessie tot stand gekomen als het adres onbekend is bij Supabase zelf; wachtwoord: "onjuist e-mailadres of wachtwoord" (lekt niet, issue #70). |
| Sessie bestaat, herleidt niet naar een actief `lid`-record | `usePortalSession()` → `denied`, neutrale melding, zie Rolzichtbaarheid. |
| Mail op de telefoon geopend, aangevraagd op een andere pc/telefoon | Werkt (ADR 0008, `token_hash`, apparaat-onafhankelijk). |
| Link verlopen/al gebruikt (`/portal/wachtwoord-herstellen`) | "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." + terug naar de aanvraagweergave — zelfde tekst/gedrag als `/beheer/wachtwoord-herstellen`. |
| `updateUser` weigert op sterkte/gelijk wachtwoord | Zelfde meldingen als `wachtwoord-vergeten.md` → Randgevallen (`weak_password`/`same_password`), ongewijzigd hergebruikt via `usePortalWachtwoordHerstellen.ts`. |
| Te veel mails (Supabase's projectbrede mail-limiet, gedeeld met bar/beheer) | Neutrale melding, zelfde als `wachtwoord-vergeten.md` → Randgevallen "Te veel mails" — geen apart limiet per shell, Supabase kent er maar één per project. |
| Seed-/CI-data voor de wachtwoord-pad-e2e-test | `supabase/seed.sql` heeft nog geen `lid`-rol fixture met zowel gekoppelde `auth_user_id` als een gezet wachtwoord (nodig om het wachtwoordpad te testen zonder dat #17's onboardingscherm bestaat — zelfde bootstrap-precedent als Femke Bos/Sanne Bakker voor bardienst/beheerder). Developer/Tester voegen die toe. |
| `link_lid_member_account()` (voorstel): e-mailcollision, dubbele/gelijktijdige koppeling, gewone her-login van een al gekoppeld lid | Zelfde gedrag/motivatie als `link_invited_member_account`, zie `lid-account-invite.md` → Randgevallen — stille no-op, geaccepteerd risico, niet opnieuw uitgeschreven hier. |
| **a11y** | `e2e/a11y.spec.ts` scant `/portal` al (bestaande entry-route) — uitbreiden met de nieuwe stateful weergaven: methode-keuze, "link verstuurd"-bevestiging, wachtwoord-vergeten-aanvraag/-verstuurd, `/portal/wachtwoord-herstellen` (formulier + "link ongeldig"), en `PortalShellHome`'s "ingelogd, geen sessie"-branch — zelfde patroon als `wachtwoord-vergeten.md`/`bezetting-beheren.md`'s precedent voor nieuwe stateful schermen. |

## Dashboard-instellingen (Bram, geen code — pas ná deploy)

1. **Nieuwe mailtemplate-links** (Authentication → Emails, zelfde patroon
   als ADR 0008 → "Dashboardstappen"):
   - **Magic Link (portal):** momenteel deelt de portal dezelfde
     "Magic Link"-template als `/beheer` (er is er maar één per project) —
     die template kan niet naar twee routes tegelijk linken. **Dit is een
     scherpe randvoorwaarde, geen detail**: zie Open vraag 3.
   - **Reset Password (portal):** zelfde probleem — één "Reset Password"-
     template voor het hele project, moet straks naar `/beheer/
     wachtwoord-herstellen` én `/portal/wachtwoord-herstellen` kunnen
     wijzen. Zie Open vraag 3.
2. Zelfde wachtwoordregels als `wachtwoord-vergeten.md` → Dashboard-
   instellingen (minimale lengte 8, alle vier de tekensoorten) — al
   projectbreed ingesteld, geen nieuwe actie nodig, geldt automatisch ook
   voor portal-wachtwoorden.
3. **Signup-policy bevestigen tegen het echte, gehoste project**
   (`docs/ARCHITECTURE.md` → "Flag for #15 (portal-login)", al genoteerd
   vóór dit ticket bestond): als het gehoste project `enable_signup` ooit op
   `false` zet, breekt wachtwoord-login stil voor bestaande leden (bekende
   GoTrue-eigenaardigheid, `supabase/auth#330`). Relevant voor élke
   wachtwoord-login in deze app, niet portal-specifiek, maar hier voor het
   eerst genoemd als concrete blokkerende afhankelijkheid.

## Expliciet buiten scope

- **Pincode op de portal** (device-local snelkoppeling) — zie "Onderzocht in
  /designs/". Geen kader vraagt erom voor #15.
- **"Kies een wachtwoord"-onboardingscherm na de eerste magic link** (chat30)
  — #17's scope, zelfde grens als voor bardienst/beheerder
  (`lid-account-invite.md`).
- **Zelf opwaarderen via de portal (iDEAL)** — CLAUDE.md → Domein noemt dit
  expliciet als "latere fase", ongewijzigd.
- **Saldo-/transactieschermen** — `PortalShellHome`'s "ingelogd"-branch is
  hier een placeholder, geen echt scherm; een later ticket bouwt dat.
- **Wachtwoord wijzigen terwijl ingelogd** — #17, ongewijzigd.
- **`/beheer`'s eigen #70-fix** (de bestaande magic-link-melding op
  `/beheer` blijft lekken tot #70 zelf gebouwd wordt) — deze spec bouwt de
  portal-kant meteen goed (zie Schermflow → "Neutrale melding"), herbouwt
  `BeheerLogin.tsx`/`useBeheerLogin.ts` niet.
- **Eigen SMTP-provider** (Supabase's mail-limiet) — ongewijzigd buiten
  scope, zelfde als `wachtwoord-vergeten.md`.

## Open vragen voor Bram

Twee echte, niet uit bestaande architectuur/precedenten af te leiden vragen
— de Developer begint pas nadat deze beantwoord zijn. Alles hierboven wat
niet van het antwoord afhangt (het inlogscherm zelf, de cookie-isolatie,
`/portal/wachtwoord-herstellen`, de neutrale meldingen) staat al vast en kan
sowieso gebouwd worden.

### 1. Bouwt #15 ook de koppeling van een `lid`-rol `members`-record aan een `auth_user_id` (en zo ja: welke vorm)?

`docs/features/lid-account-invite.md` legt vast dat dit bij #15 hoort ("geen
nieuw ticket hier"), maar issue #15's eigen tekst/acceptatiecriteria (zoals
aan mij gegeven) noemen dit nergens. Twee opties:

- **A — Ja, bouw het nu, via optie B hierboven** ("Ledenkoppeling voor rol
  `lid`"): hergebruik van #24's bestaande invite-machinerie
  (`mark_member_invite_sent`'s eligibility uitbreiden,
  `LidBeherenOverlay.tsx`'s Inloggegevens-blok ook voor `lid`, nieuwe
  `link_lid_member_account()`-RPC + migratie `0021`). Dit is mijn
  aanbeveling — consistent met het al bestaande #24-patroon, met ADR 0006 →
  "Aanvulling" → "Reikwijdte" die #15 al met naam noemt als verwachte
  toepassing, en met wat Bram in `lid-account-invite.md` al vastlegde. Het
  vergroot deze ticket wel aanzienlijk: een nieuwe migratie, een nieuwe RPC,
  en een wijziging aan een al gebouwd/gereviewed scherm
  (`LidBeherenOverlay.tsx`).
- **B — Nee, alleen het inlogscherm nu**, zoals de issue-tekst letterlijk
  zegt. Koppeling blijft voorlopig handmatig (Supabase Studio, zelfde
  bootstrap-patroon als het allereerste beheerder-account, Femke Bos in
  `seed.sql`) — bruikbaar voor een eerste productie-lid, niet
  zelfbedienend. De koppel-/invite-uitbreiding voor `lid` wordt dan een apart
  vervolgticket, ondanks wat `lid-account-invite.md` eerder vastlegde.

**Zonder een keuze hier bouwt de Developer geen koppelmechanisme** (optie B
als impliciete default) — geen aanname, expliciete keuze nodig omdat er een
vastgelegd besluit ligt dat de andere kant op wijst.

### 2. Zelfbediening (`shouldCreateUser: true`) of alleen al-uitgenodigde adressen (`shouldCreateUser: false`) voor de portal-magic-link?

Alleen relevant als optie A hierboven gekozen wordt (bij optie B is dit
zonder koppelmechanisme sowieso irrelevant — er is dan niets om aan te
koppelen). Mijn voorstel hierboven gaat uit van `false` (consistent met
`BeheerLogin.tsx`'s bestaande keuze, en met "invite" als het woord dat
`lid-account-invite.md` zelf gebruikt), maar `true` (iedereen die een geldig
e-mailadres opgeeft krijgt een link; koppeling gebeurt alsnog alleen als het
adres matcht met een bestaande, geëmailde `lid`-rij) is ook verdedigbaar —
en heeft zelfs een structureel voordeel: bij `true` bestaat issue #70's
enumeratielek niet (élk adres krijgt hetzelfde "sturen we een link"-resultaat,
er is geen asymmetrie tussen bekend/onbekend om te verbergen), terwijl bij
`false` de neutrale-melding-laag (Schermflow → "Neutrale melding") het actief
moet maskeren. Dit is een productbeslissing (hoe laagdrempelig moet een lid
zelf een portal-account kunnen "claimen") die niet uit CLAUDE.md/ADR's af te
leiden is.

### 3. Mailtemplates: één "Magic Link"/"Reset Password"-template per Supabase-project, twee bestemmingen nodig

Zowel `/beheer` als `/portal` hebben straks een eigen callback-/
herstelroute, maar Supabase's dashboard kent maar één "Magic Link"- en één
"Reset Password"-template voor het hele project (geen per-gebruiker-rol of
per-audience-variant). ADR 0008 loste dit nog niet op omdat er tot nu toe
maar één bestemming was. Twee denkbare richtingen, geen van beide door mij
gekozen:

- De template linkt naar een **neutrale, gedeelde route** (bv. `/auth/
  callback`) die zelf, op basis van welk `members`-record het e-mailadres
  matcht (of op basis van een parameter die de aanvragende pagina al
  meegeeft), doorstuurt naar `/beheer` of `/portal`.
- **Twee Supabase-projecten** (één voor bar/beheer, één voor portal) — een
  veel grotere infrastructuurwijziging, waarschijnlijk niet wat Bram wil,
  maar technisch het enige alternatief dat écht twee onafhankelijke
  templates geeft.

Zonder antwoord hier is `/portal/callback` wel bouwbaar en testbaar (met een
handmatig samengestelde `token_hash`-link, zoals de bestaande
`/beheer`-e2e-tests al doen), maar de **daadwerkelijke productie-mail** komt
pas aan op de juiste plek zodra dit is opgelost — dezelfde soort
"Dashboardstappen ná deploy"-afhankelijkheid als ADR 0008 al kende, alleen nu
met een echte inhoudelijke keuze erbij in plaats van alleen een
dashboard-actie.

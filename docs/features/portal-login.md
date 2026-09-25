# Portal-login (magic link + wachtwoord)

Spec voor [issue #15](https://github.com/BramLambertJansen/ABAS/issues/15).

**Status: geaccordeerd door Bram (2026-09-25).** Introduceert een nieuwe
architectuurbeslissing (cookie-isolatie) — zie
[ADR 0009](../adr/0009-portal-sessie-eigen-cookienaam.md), geaccepteerd
samen met deze spec. Zie "Besloten door Bram (2026-09-25)" verderop voor de
drie punten die Bram expliciet heeft vastgesteld (lid-koppeling wordt nu
meegebouwd, `shouldCreateUser: true`, één gedeelde `/auth/callback`-route
i.p.v. losse `/beheer/callback`/`/portal/callback`-eindpunten voor de
mail-callback) — de rest van dit document is daarop bijgewerkt, geen open
vragen meer voor de Developer.

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

**Overwegend `shells/portal`, met drie kleine, doelbewuste uitzonderingen
die rechtstreeks uit "Besloten door Bram" punt 3 volgen** (de gedeelde
`/auth/callback`-route) — geen van drieën wijzigt bar/beheer-gedrag,
functionaliteit of UI, alleen waar een mail-link naartoe wijst:

1. **`src/app/auth/callback/route.ts` is nieuw en shell-onwetend** — het
   leeft niet onder `src/app/portal/`, `src/app/(bar)/` of enige
   `src/shells/*`-map, rendert zelf niets (redirect-only, zoals
   `/beheer/callback` vandaag), en is de enige plek in de codebase die zowel
   `src/lib/supabase/server.ts` als `src/lib/supabase/portalClient.ts`/
   `portalServer.ts` mag importeren — zie "Cookie-isolatie (ADR 0009)"
   hieronder voor de bijbehorende, nauw omschreven uitzondering op de
   `check:arch`-regel.
2. **`useBeheerLogin.ts`'s `signInWithMagicLink` krijgt een andere
   `emailRedirectTo`-waarde** (`${origin}/auth/callback?next=bar` i.p.v.
   `${origin}/beheer/callback`) — zie Schermflow → `/auth/callback` voor
   waarom. Geen andere wijziging aan dat bestand: `shouldCreateUser: false`
   voor `/beheer` blijft ongewijzigd (dat is een eigen, nog steeds geldige
   afweging voor bardienst/beheerder-accounts, los van "Besloten door Bram"
   punt 2 hieronder, die uitsluitend over de portal gaat).
3. **`src/app/(bar)/beheer/callback/route.ts` zelf blijft volledig
   ongewijzigd** (geen refactor, geen gedeelde helper met de nieuwe route) —
   zie "Cookie-isolatie (ADR 0009)"/Schermflow voor de motivatie: het is
   backward-compat voor elke mail die nog naar de oude URL wijst totdat het
   dashboard-sjabloon is omgezet, geen migratie/deprecation in deze ticket.

Verder ongewijzigd: `src/middleware.ts`, `src/lib/supabase/client.ts` en
`server.ts` — zie ADR 0009 voor waarom de cookie-isolatie zonder wijziging
aan die drie kan.

- **Nieuw:** `src/features/portal-login/PortalLogin.tsx` (inlogscherm,
  functioneel/structureel naast `src/features/assortimentbeheer/
  BeheerLogin.tsx`, geen gedeeld component — de twee formulieren delen
  vorm/precedent, niet code, zelfde reden als hieronder bij "Herbruik"
  toegelicht) + `src/hooks/queries/usePortalLogin.ts` (magic
  link/wachtwoord) + `src/hooks/queries/usePortalSession.ts` (sessie →
  `lid`-rol member, analoog aan `useBeheerSession.ts`, inclusief dezelfde
  `denied`-staat als `useBeheerSession.ts` kent).
- **Nieuw:** `src/app/auth/callback/route.ts` (gedeelde callback, zie
  Schermflow → `/auth/callback` — vervangt wat eerder als losse
  `src/app/portal/callback/route.ts` was voorgesteld) en
  `src/app/portal/wachtwoord-herstellen/page.tsx` +
  `src/hooks/queries/usePortalWachtwoordHerstellen.ts` (analoog aan
  `useWachtwoordHerstellen.ts`, zie "Herbruik" hieronder voor wat wél en
  niet gedeeld wordt) — **deze twee blijven wél puur portal-only**, alleen
  de callback zelf is gedeeld.
- **Nieuw:** `src/lib/linkLidMemberAccount.ts` (analoog aan het bestaande
  `src/lib/linkInvitedMemberAccount.ts`, zie RPC's/Schermflow) — aangeroepen
  vanuit `src/app/auth/callback/route.ts`, dat ook het bestaande
  `linkInvitedMemberAccount.ts` hergebruikt (geen duplicatie, zie Schermflow
  → `/auth/callback`).
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
    of `@/lib/supabase/portalServer` importeert → fout, **met precies één,
    met naam genoemde uitzondering: `src/app/auth/callback/route.ts`.**
    Die route moet, per ontwerp (zie Schermflow → `/auth/callback`, "Besloten
    door Bram" punt 3), op basis van een gevalideerde `?next=`-waarde kiezen
    tussen `server.ts` en `portalServer.ts` **voordat** de sessie-uitwisseling
    plaatsvindt — dat is de enige plek in de codebase waar dat nodig is. De
    uitzondering is het bestandspad zelf, geen mapprefix: een toekomstige
    tweede shared-route-file valt er dus niet automatisch onder, en moet zelf
    weer expliciet aan deze regel toegevoegd worden (zelfde
    "geen stilzwijgende uitbreiding"-principe als de rest van deze regel).
    Binnen dat ene bestand mag nooit tegelijk `server.ts` én `portalServer.ts`
    op dezelfde sessie-uitwisseling worden losgelaten — de route kiest er
    exact één op basis van `next`, roept die client vervolgens aan voor
    zowel de auth-call als de RPC-aanroepen, nooit beide voor dezelfde
    request (zie Schermflow).
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
rol `lid`" hieronder. **Vastgesteld door Bram (2026-09-25, "Besloten door
Bram" punt 1) — dit ticket bouwt de koppeling mee, geen apart vervolgticket.**

## RPC's

**Geen nieuwe RPC voor het inloggen zelf** — Supabase Auth-calls zijn geen
RPC's (zelfde constatering als `wachtwoord-vergeten.md` → "Geldlaag,
datamodel, RPC's").

**Nieuwe RPC: `link_lid_member_account() returns members`**, nieuwe migratie
`supabase/migrations/0022_lid_account_koppelen.sql`, voor de koppeling — zie
"Ledenkoppeling voor rol `lid`" hieronder. Vastgesteld, onderdeel van de
kern (Besloten door Bram, punt 1).

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
  `signInWithOtp({ email, options: { shouldCreateUser: true,
  emailRedirectTo: \`${origin}/auth/callback?next=portal\` } })`, via
  `portalClient.ts`. **`shouldCreateUser: true` is vastgesteld** (Besloten
  door Bram, punt 2, "zelfbediening voor iedereen") — elk geldig
  e-mailadres krijgt een `auth.users`-rij en een werkende link, ook als er
  geen (nog niet geëmailde) `lid`-rij bij hoort; `link_lid_member_account()`
  koppelt daarna alsnog alleen wanneer het adres matcht met een
  daadwerkelijk uitgenodigde `lid`-rij (zie "Ledenkoppeling voor rol `lid`")
  — een niet-matchend adres krijgt gewoon een ongekoppelde `auth.users`-rij
  en, na het volgen van de link, `usePortalSession()`'s `denied`-staat. De
  motivatie is structureel, niet gemakszucht: bij `true` bestaat issue #70's
  enumeratielek voor de portal niet — élk adres doorloopt exact hetzelfde
  pad (nieuwe of bestaande `auth.users`-rij, altijd een verstuurde link,
  altijd dezelfde neutrale melding hieronder) — terwijl `false` een aparte
  maskeringslaag nodig zou hebben om diezelfde neutraliteit te bereiken. Dit
  is bewust **niet** "consistent met `BeheerLogin.tsx`'s keuze" (die kiest
  `false`, zie `useBeheerLogin.ts`) — bardienst/beheerder-accounts blijven
  wél uitsluitend beheerder-geprovisioneerd, de portal is nu expliciet
  laagdrempeliger, zie "Besloten door Bram" punt 2.
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

### 2. `/auth/callback` — gedeelde callback voor `/beheer` én `/portal` (Besloten door Bram, punt 3)

**Vervangt het eerder voorgestelde, portal-only `/portal/callback`.** Bram
koos expliciet voor "één gedeelde, neutrale callback-route" boven twee
Supabase-projecten (Open vraag 3, optie 1) — dit is de concrete uitwerking,
met "een parameter die de aanvragende pagina al meegeeft" (de tweede
mogelijkheid die diezelfde optie noemde) als het gekozen mechanisme, niet
member-record-matching. Motivatie voor die keuze staat hieronder bij
"Waarom een parameter, niet member-matching".

**Waarom dit sowieso een eigen route moet zijn, niet gewoon een aangepast
`/beheer/callback`-sjabloon.** Supabase kent maar één "Magic Link"-template
per project (geen per-audience-variant) — zowel `/beheer`'s als `/portal`'s
magic-link-mail lopen straks door datzelfde sjabloon. Dat sjabloon kan naar
precies één URL linken, dus moet die URL zelf de vertakking naar `/beheer`
of `/portal` bevatten — vandaar `/auth/callback`, shell-onwetend, buiten
`src/app/portal/`/`src/app/(bar)/`.

**Contract:**

- **`?next=bar` of `?next=portal`**, meegegeven door de aanvragende pagina
  via `emailRedirectTo` (niet door de route zelf verzonnen):
  - `useBeheerLogin().signInWithMagicLink` (bestaand bestand, kleine
    wijziging — zie Betrokken shell): `emailRedirectTo:
    \`${origin}/auth/callback?next=bar\`` (was `${origin}/beheer/callback`).
  - `usePortalLogin().signInWithMagicLink` (nieuw, zie hierboven):
    `emailRedirectTo: \`${origin}/auth/callback?next=portal\``.
  - Het Magic Link-sjabloon zelf wordt (Dashboard-instellingen hieronder):
    `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` — `.RedirectTo`
    is Supabase's eigen sjabloonvariabele voor de `emailRedirectTo`-waarde
    die de aanroepende code meegaf; de route hoeft dus niets zelf te
    reconstrueren, het sjabloon plakt alleen `token_hash`/`type` erachter.
  - **Strikte allowlist, geen open redirect:** de route accepteert
    uitsluitend de letterlijke waarden `bar`/`portal` voor `next` (parsed uit
    de query string van de binnenkomende request, niet uit `.RedirectTo`'s
    volledige URL). Elke andere waarde, of een ontbrekende `next`
    (bijvoorbeeld een mail verstuurd vóórdat het sjabloon is omgezet — zie
    Dashboard-instellingen), valt terug op `bar` — hetzelfde gedrag als
    `/beheer/callback` vandaag altijd al had, dus geen regressie voor een
    mail die nog uit de oude sjabloonversie komt.
- **Cliëntkeuze vóór de sessie-uitwisseling, niet erna.** `next=portal` →
  `portalServer.ts` (schrijft `sb-portal-auth-token`); `next=bar`/default →
  `server.ts` (schrijft de bestaande, impliciete bar-cookienaam). Dit moet
  vóór `verifyOtp`/`exchangeCodeForSession` besloten zijn: `@supabase/ssr`
  persisteert de sessie als bijeffect van die aanroep zelf, naar de
  cookienaam van de client waarmee hij wordt aangeroepen (ADR 0009) — er is
  geen manier om een sessie eerst "neutraal" te lezen en daarna alsnog naar
  de andere cookienaam te verplaatsen zonder een tweede, cookie-loze
  clientvorm te introduceren. Vandaar dat de vertakking op `next` draait
  (bekend vóór de uitwisseling), niet op het gekoppelde `members.role`
  (pas bekend erna) — zie "Waarom een parameter, niet member-matching".
- Accepteert, net als `/beheer/callback` vandaag, zowel `?code=` (PKCE) als
  `?token_hash=&type=` (`email`/`magiclink`/`invite`, ADR 0008) voor de
  sessie-uitwisseling zelf.
- **Ná een geslaagde uitwisseling, met de zojuist gekozen client, roept de
  route best-effort ALLEBEI de koppel-RPC's aan** —
  `linkInvitedMemberAccount()` (bestaand, hergebruikt uit
  `src/lib/linkInvitedMemberAccount.ts`, ongewijzigd) én de nieuwe
  `linkLidMemberAccount()` (`src/lib/linkLidMemberAccount.ts`, analoog
  bestand). **Bewust allebei, ongeacht `next`** — `next` is alleen een
  UX-vertakking (waar de gebruiker straks landt), geen autorisatiebeslissing;
  de koppel-RPC's zelf bepalen via hun eigen, harde `role`-filter
  (`bardienst`/`beheerder` resp. `lid`, zie RPC's) of er iets te koppelen
  valt. Zo blijft de daadwerkelijke koppel-logica onafhankelijk van welke
  waarde een aanvragende pagina toevallig meegaf — verdediging-in-twee-lagen,
  zelfde principe als overal elders in deze RPC-familie
  (`lid-account-invite.md`). Beide aanroepen zijn stille no-ops wanneer niet
  van toepassing (geen foutcodes, zie RPC's), dus nooit een probleem om
  allebei te proberen.
- **Redirect altijd naar `/beheer` (bij `next=bar`/default) of `/portal`
  (bij `next=portal`), ongeacht de uitkomst van de uitwisseling of de
  koppel-RPC's** — fout gelogd (`console.error`), niet getoond, zelfde
  "land regardless"-patroon als `/beheer/callback` vandaag. Een sessie die
  wél tot stand komt maar nergens aan koppelt, toont op de bestemming
  gewoon de bestaande `denied`-staat (`usePortalSession`/`useBeheerSession`)
  — geen nieuwe afhandeling nodig, dit was al een bestaand scenario voor
  `/beheer/callback` (een her-login zonder koppeling) en is voor `/portal`
  hetzelfde.

**Waarom een parameter, niet member-matching.** De andere mogelijkheid die
Open vraag 3 noemde — de route laat zelf `members` bevragen om te bepalen
waar de sessie bij hoort — is hier niet gekozen omdat dat de cliëntkeuze
hierboven omdraait: member-matching kan pas ná een geslaagde
sessie-uitwisseling (er moet een sessie zijn om `auth.uid()`/`auth.email()`
te lezen), maar de sessie moet al op de juiste cookienaam geschreven zijn
vóórdat die uitwisseling plaatsvindt. Member-matching zou dus een sessie
eerst ergens moeten vastleggen om te weten waar hij hoort, en 'm dan
mogelijk moeten verplaatsen — precies de complicatie die de
parametervariant vermijdt.

**Verificatieafhankelijkheid, zelfde categorie als Dashboard-instellingen
punt 3 (signup-policy).** Dit ontwerp veronderstelt dat Supabase's Magic
Link-sjabloon een `{{ .RedirectTo }}`-variabele met de meegegeven
`emailRedirectTo`-waarde daadwerkelijk beschikbaar stelt. Niets in deze
repository kan dat bevestigen (het is dashboard-/GoTrue-gedrag van het
gehoste project) — de Developer/Bram controleren dit bij het invullen van
het sjabloon (Dashboard-instellingen hieronder). **Dit blokkeert de bouw
niet**: `/auth/callback` zelf is volledig bouwbaar en testbaar met
handmatig samengestelde `?token_hash=&type=&next=`-URLs (zelfde
e2e-precedent als de bestaande `/beheer`-tests), ongeacht of `.RedirectTo`
uiteindelijk beschikbaar blijkt. Blijkt de variabele niet beschikbaar, dan
is het enige gevolg dat de sjabloonregel zelf een andere vorm nodig heeft
(bijvoorbeeld een vaste tweede route toch weer per-shell benaderen) — geen
wijziging aan `/auth/callback`'s eigen contract (`?next=`, cliëntkeuze,
beide koppel-RPC's) nodig. Zou dit toch nodig blijken, dan is dat een
nieuwe, kleine vraag voor Bram, niet een aanname.

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

**Geen gedeelde `/auth/...`-route nodig voor dit pad, in tegenstelling tot
Magic Link.** Het "één sjabloon, twee bestemmingen"-probleem (Besloten door
Bram punt 3) geldt voor "Reset Password" net zo goed als voor "Magic Link" —
maar hier is de oplossing eenvoudiger en vereist geen nieuwe route: ADR
0008 stelt al dat `token_hash`/`type=recovery` pas bij het **versturen** van
het formulier wordt ingewisseld, niet bij het openen van de link. Er is dus
geen sessie-uitwisseling op laad-tijd die eerst zou moeten "weten" welke
cookie-client te gebruiken (de complicatie die `/auth/callback` wél heeft,
zie Schermflow → `/auth/callback` → "Waarom een parameter, niet
member-matching") — `/portal/wachtwoord-herstellen` en
`/beheer/wachtwoord-herstellen` kunnen elk gewoon zelfstandig blijven
bestaan, en het "Reset Password"-sjabloon kan rechtstreeks naar
`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` linken —
`.RedirectTo` is dan simpelweg de `redirectTo`-waarde die elke aanroepende
hook al meegeeft (`${origin}/portal/wachtwoord-herstellen` resp.
`${origin}/beheer/wachtwoord-herstellen`, allebei al zo gespecificeerd,
ongewijzigd). Zie Dashboard-instellingen voor de exacte sjabloonwaarde;
geen code-wijziging nodig ten opzichte van wat hierboven al stond.

## Ledenkoppeling voor rol `lid`

**Vastgesteld door Bram (2026-09-25, "Besloten door Bram" punt 1, optie A
hieronder) — dit was eerder Open vraag 1, nu beantwoord.** Ter
achtergrond: issue #15's eigen tekst/acceptatiecriteria noemen alleen het
inlogscherm, geen koppelmechanisme. Maar `docs/features/lid-account-invite.md`
→ "Besloten
door Bram (2026-09-21)", punt 1, legt vast: *"Rolreikwijdte: voorlopig alleen
bardienst/beheerder, niet lid... lid-rol invites volgen pas als onderdeel
van #15 zelf, geen nieuw ticket hier."* Zonder enig koppelmechanisme is
acceptatiecriterium 3 ("beide paden leiden naar hetzelfde lid-account") ook
niet zinvol te verifiëren met een echt `lid`-account (alleen met een
handmatig-in-Studio-geprovisioned fixture, zie Randgevallen) — en die eerdere
beslissing zegt expliciet dat dat niet de bedoeling is. Dit was dus een
spanning tussen de letterlijke issue-tekst en een eerder vastgelegd besluit,
die de Architect niet zelf oploste maar aan Bram voorlegde (twee opties) —
Bram koos optie A: "Ja, nu meebouwen" (zie "Besloten door Bram
(2026-09-25)").

**Vastgesteld (Bram, optie A — "Ja, nu meebouwen"):**

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
   (`supabase/migrations/0022_lid_account_koppelen.sql`), zelfde vorm als
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
   `/auth/callback` (niet meer een portal-only route, zie Schermflow →
   `/auth/callback`), met de sessie-gebonden client die die route al voor de
   uitwisseling koos — `portalServer.ts` bij `next=portal`, `server.ts` bij
   `next=bar` (in dat laatste geval een harmless no-op: er is dan hooguit
   een `bardienst`/`beheerder`-sessie, die nooit aan de harde `role =
   'lid'`-filter hierboven voldoet). Zelfde technische noodzaak als
   `link_invited_member_account`: `auth.email()` is alleen gevuld binnen een
   echte sessie.
   **Volledig pgTAP-testbaar** (ADR 0006 → "Aanvulling" → Gevolgen, zelfde
   argument: geen Auth-Admin-API-afhankelijkheid binnen de RPC zelf).
3. **`shouldCreateUser: true`** voor `usePortalLogin().signInWithMagicLink`
   (Besloten door Bram, punt 2 — "zelfbediening voor iedereen") — dit was
   eerder Open vraag 2, met `false` als het toenmalige Architect-voorstel;
   Bram koos expliciet `true`. Zie Schermflow → punt 1 voor de volledige
   motivatie/afweging. Een `auth.users`-rij zonder matchende, uitgenodigde
   `lid`-rij is dus geen fout meer maar een verwacht, onschadelijk resultaat
   — `link_lid_member_account()`'s harde `role = 'lid'`- en
   `invited_at is not null`-filter (hieronder) is de enige plek die bepaalt
   of er daadwerkelijk gekoppeld wordt.

**Niet voorgesteld, expliciet buiten scope:** het "kies een
wachtwoord"-onboardingscherm na een eerste magic link (chat30) — dat blijft,
zoals hierboven bij "Onderzocht in /designs/" gemotiveerd, #17's scope.

## Rolzichtbaarheid

- `PortalLogin.tsx`/`/auth/callback`/`/portal/wachtwoord-herstellen` zijn
  zichtbaar zonder sessie — dat is het punt, zelfde als `BeheerLogin.tsx`.
  `/auth/callback` toont zelf nooit iets (redirect-only, zie Schermflow),
  dus "zichtbaar zonder sessie" betekent hier alleen "werkt zonder sessie".
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
- `link_lid_member_account()`: geen rolcheck op de aanroeper, harde
  `role = 'lid'`-filter op het doelrecord — zie "Ledenkoppeling" hierboven.

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
| `link_lid_member_account()`: e-mailcollision, dubbele/gelijktijdige koppeling, gewone her-login van een al gekoppeld lid | Zelfde gedrag/motivatie als `link_invited_member_account`, zie `lid-account-invite.md` → Randgevallen — stille no-op, geaccepteerd risico, niet opnieuw uitgeschreven hier. |
| `/auth/callback` ontvangt een ontbrekende of onbekende `?next=`-waarde | Valt terug op `next=bar` (zie Schermflow → `/auth/callback`) — geen open redirect, geen fout, zelfde eindgedrag als `/beheer/callback` vandaag. |
| **a11y** | `e2e/a11y.spec.ts` scant `/portal` al (bestaande entry-route) — uitbreiden met de nieuwe stateful weergaven: methode-keuze, "link verstuurd"-bevestiging, wachtwoord-vergeten-aanvraag/-verstuurd, `/portal/wachtwoord-herstellen` (formulier + "link ongeldig"), en `PortalShellHome`'s "ingelogd, geen sessie"-branch — zelfde patroon als `wachtwoord-vergeten.md`/`bezetting-beheren.md`'s precedent voor nieuwe stateful schermen. |

## Dashboard-instellingen (Bram, geen code — pas ná deploy)

**Voormalige Open vraag 3 is beantwoord** (Besloten door Bram, punt 3: "Eén
gedeelde, neutrale callback-route") — de twee bullets hieronder zijn de
concrete uitwerking daarvan, geen open punt meer, wél nog een verplichte
ná-deploy-actie plus één verificatiestap.

1. **Mailtemplate-links wijzigen** (Authentication → Emails, zelfde patroon
   als ADR 0008 → "Dashboardstappen"):
   - **Magic Link (gedeeld door `/beheer` én `/portal` — er is er maar één
     per project):**
     `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
     — vervangt de huidige hardcoded
     `{{ .SiteURL }}/beheer/callback?token_hash=...`. **Geen `{{ .SiteURL }}`
     ervoor** — `{{ .RedirectTo }}` is zelf al de volledige URL
     (`emailRedirectTo` bevat altijd al `window.location.origin`,
     bijvoorbeeld `https://app.example/auth/callback?next=bar`); die
     nogmaals voorafgaan door `{{ .SiteURL }}` zou de origin dubbel
     opnemen. `{{ .RedirectTo }}` moet hier de waarde zijn die
     `useBeheerLogin.ts`/`usePortalLogin.ts` meegeven via `emailRedirectTo`
     (`${origin}/auth/callback?next=bar` resp.
     `${origin}/auth/callback?next=portal`, zie Schermflow →
     `/auth/callback`) — **controleer bij het invullen dat
     `{{ .RedirectTo }}` in dit project daadwerkelijk die waarde bevat**
     (zie de "Verificatieafhankelijkheid"-paragraaf in Schermflow →
     `/auth/callback`; als dat niet zo blijkt, is dat een nieuwe, kleine
     vraag terug naar de Architect, geen aanname hier op de plek).
   - **Reset Password (gedeeld door `/beheer` én `/portal`, zelfde
     eenmaligheid):**
     `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
     — vervangt de huidige hardcoded
     `{{ .SiteURL }}/beheer/wachtwoord-herstellen?token_hash=...`. Zelfde
     "geen `{{ .SiteURL }}`-prefix"-punt als hierboven. `{{ .RedirectTo }}`
     is hier al gewoon `${origin}/beheer/wachtwoord-herstellen` resp.
     `${origin}/portal/wachtwoord-herstellen` (de bestaande/geplande
     `redirectTo`-waarden van `useWachtwoordHerstellen.ts`/
     `usePortalWachtwoordHerstellen.ts`, ongewijzigd) — **geen nieuwe route
     nodig voor dit pad**, zie Schermflow → Wachtwoord vergeten.
   - **`/beheer/callback` blijft ongewijzigd bestaan** (geen migratie/
     deprecation in dit ticket) — zie Betrokken shell(s). Zolang het
     Magic Link-sjabloon nog niet is omgezet (of voor een mail die vóór de
     omzetting al verstuurd is) landt die mail nog op de oude URL en werkt
     hij precies zoals vandaag; ná de omzetting ontvangt die route simpelweg
     geen nieuwe mail meer. Geen forcering om 'm op te ruimen — een latere,
     losse opruimticket kan dat doen zodra er voldoende vertrouwen is dat er
     geen oude mail meer onderweg is (magic links zijn sowieso ~1 uur
     geldig, dus dat venster is kort).
   - **Redirect URLs-allowlist** (Authentication → URL Configuration):
     `{{ .SiteURL }}/auth/callback` moet op de toegestane-redirects-lijst
     staan, naast de al bestaande `/beheer/callback`/
     `/beheer/wachtwoord-herstellen` — anders wijst `emailRedirectTo`/
     `redirectTo` naar een niet-toegestane URL en weigert Supabase de
     aanroep zelf al (vóór er ooit een mail verstuurd wordt). Voeg ook
     `/portal/wachtwoord-herstellen` toe.
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

## Besloten door Bram (2026-09-25)

Drie punten, expliciet vastgesteld — geen aanname, geen heropening door de
Developer. Dit vervangt de eerdere conceptversie's "Open vragen voor Bram";
alles in dit document hierboven is al bijgewerkt op deze drie antwoorden.

1. **Lid-koppeling: ja, nu meebouwen (optie A).** #15 bouwt ook de koppeling
   van een `lid`-rol `members`-record aan een `auth_user_id`, niet alleen het
   inlogscherm — via hergebruik van #24's bestaande invite-machinerie:
   `mark_member_invite_sent`'s eligibility breidt uit naar `role in
   ('bardienst', 'beheerder', 'lid')`, `LidBeherenOverlay.tsx`'s
   "Inloggegevens"-blok wordt ook getoond voor `role === 'lid'` (zonder
   Pincode-regel), en een nieuwe RPC `link_lid_member_account()` +
   migratie `0022_lid_account_koppelen.sql` doet de koppeling zelf. Zie
   "Ledenkoppeling voor rol `lid`" voor de volledige uitwerking. Dit lost de
   spanning op tussen `lid-account-invite.md`'s eerdere vastlegging ("lid-rol
   invites volgen pas als onderdeel van #15 zelf") en #15's eigen, kalere
   issue-tekst — de eerdere vastlegging wint.
2. **`shouldCreateUser: true` — zelfbediening voor iedereen.**
   `usePortalLogin().signInWithMagicLink` gebruikt
   `shouldCreateUser: true`, niet `false`. Elk geldig e-mailadres krijgt een
   werkende magic link, ook zonder (nog niet geëmailde) `lid`-rij erachter —
   `link_lid_member_account()`'s eigen, harde filter bepaalt daarna of er
   iets te koppelen valt. Vastgesteld boven `false`
   (bardienst/beheerder-consistentie) vanwege een structureel voordeel: bij
   `true` bestaat issue #70's enumeratielek voor de portal niet — elk adres
   doorloopt exact hetzelfde pad, er is geen asymmetrie tussen bekend/
   onbekend om achteraf te moeten maskeren. Zie Schermflow → punt 1.
3. **Mailtemplates: één gedeelde, neutrale callback-route (`/auth/
   callback`), geen twee Supabase-projecten.** De template stuurt door naar
   `/beheer` of `/portal` op basis van een parameter die de aanvragende
   pagina zelf al meegeeft (`?next=bar`/`?next=portal`, via
   `emailRedirectTo`/`{{ .RedirectTo }}`) — niet op basis van
   member-record-matching (de andere mogelijkheid die de conceptversie
   noemde); zie Schermflow → `/auth/callback` voor de volledige motivatie,
   inclusief waarom member-matching hier niet werkt (cookie-isolatie, ADR
   0009, vereist dat de juiste cookie-client al vaststaat vóór de
   sessie-uitwisseling). Dit raakt ook een al gebouwde, gemergede route
   (`/beheer/callback`, #14/#42/ADR 0008): die **blijft ongewijzigd
   bestaan**, geen migratie/deprecation in dit ticket — zie Betrokken
   shell(s) en Dashboard-instellingen voor de precieze afbakening van wat
   wél en niet verandert.

# Tablet koppelen: de gedeelde device-sessie alleen voor een gekoppelde tablet

**Status: vervallen en verwijderd (gemerged in [PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01) — vervangen door
[`dienst-per-sessie.md`](dienst-per-sessie.md) en
[ADR 0016](../adr/0016-dienst-hoort-bij-geregistreerde-app-sessies.md).**
`/koppel`, `src/lib/tabletKoppeling.ts`, het `abas_tablet`-cookie,
`BAR_DEVICE_SECRET`, de device sign-in in de middleware en het device-account
zijn verwijderd. De tekst hieronder blijft als historie.

**Oorspronkelijke status: goedgekeurd door Bram (2026-09-28).** Geschreven 2026-09-28. De architectuurbeslissing zelf staat in
[ADR 0011](../adr/0011-device-sessie-alleen-voor-gekoppelde-tablet.md).
Vervolg op [issue #34](https://github.com/BramLambertJansen/ABAS/issues/34):
dit vervangt het daar geaccepteerde risico.

## Aanleiding

Vastgesteld op 2026-09-28:

- `src/middleware.ts` (regels 83-101) logt **elke** bezoeker zonder sessie
  op een niet-`/portal`-URL automatisch in als het gedeelde device-account
  (`SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD`). Nergens wordt
  gecontroleerd of het verzoek van de fysieke bar-tablet komt.
- #34 accepteerde dat in augustus voor de MVP. De aanname daarbij stond in
  `docs/ARCHITECTURE.md` → "Accepted risk: device sign-in has no
  tablet-trust check": *"writes still require the PIN inside
  `place_order`/`top_up`/`start_shift`"*. **Die aanname klopt niet.** Alleen
  `start_shift` vraagt een PIN. `place_order`, `top_up`,
  `reverse_order_at_bar`, `end_shift`, `add_shift_member` en
  `remove_shift_member` controleren alleen of `served_by`/`reversed_by` in de
  bezetting staat. Die ids kan de device-sessie gewoon lezen: `shifts` en
  `shift_members` staan op `using (true)` (ADR 0007).
- Gevolg: iedereen met de URL kan tijdens een open dienst onbeperkt
  opwaarderen (de €500-cap geldt per aanroep, niet per dienst), bestellingen
  terugdraaien en de dienst afsluiten. Daarnaast kan diegene alle leden en
  saldi lezen.
- `0023_bar_rpcs_weigeren_lid.sql` (A2 uit
  `docs/features/bar-rpc-autorisatie.md`) sluit alleen de weg via een
  lid-sessie. De device-sessie valt daar bewust buiten, want
  `caller_is_lid()` is voor dat account onwaar.

Bram koos de richting: een provisioning-secret (optie 2 uit #34). Vercel
Deployment Protection valt af, zie ADR 0011 → Verworpen alternatieven.

## Onderzocht

- **`/designs/`**: er is geen koppel- of "niet gekoppeld"-scherm in
  `Bar App.dc.html`. Het prototype gaat uit van een app die al draait. Er
  is wel één relevante ontwerpkeuze: `designs/chats/chat23.md` (Bram:
  *"teksten zoals 'tablet opent' moeten gewoon 'applicatie' zijn — device is
  niet belangrijk (tenzij het telefoon is)"*). Dat is input voor open vraag 5
  (UI-tekst). Het beslist de vraag niet, want op dit scherm is het apparaat
  juist het onderwerp.
- **Bestaande losse schermen** (`DienstStarten.tsx`, `BeheerLogin.tsx`)
  gebruiken allebei dezelfde opbouw: `<main>` op `bg-rail`, `AuroraMerk
  tone="dark"` met een `h1`, en daaronder een kaart (`rounded-card border
  border-rail-border bg-rail-card`) met het formulier. Het koppelscherm
  volgt die opbouw (zie Schermflow → Hergebruik).
- **Wat `/beheer` nodig heeft vóór het inloggen.** Niets van de
  device-sessie. `Assortimentbeheer.tsx` → `useBeheerSession()` geeft zonder
  sessie `signed-out` en toont `BeheerLogin`. `BeheerLogin`/`useBeheerLogin`
  roepen alleen `supabase.auth.*` aan (wachtwoord, magic link, reset) en
  doen geen RLS-query. Met de device-sessie is de staat nu `denied`, met de
  melding "Dit account is niet gekoppeld aan een lid", die boven het
  formulier staat. Op een niet-gekoppeld apparaat verdwijnt die melding
  dus. Dat is precies het gedrag waar
  [#78](https://github.com/BramLambertJansen/ABAS/issues/78) om vraagt, al
  geldt het alleen voor niet-gekoppelde apparaten. Op de gekoppelde tablet
  blijft #78 open.
- **`/portal`** valt buiten de middleware-matcher en heeft een eigen
  cookienaam (ADR 0009). Deze spec raakt de portal niet.
- **e2e/CI**: `e2e/a11y.spec.ts` → `describe.serial("stateful bar-shell
  scenarios (shared session)")` loopt via de device-sessie (staff picker →
  PIN 1234 → Verkoop). De sessie ontstaat vandaag doordat CI
  `SUPABASE_DEVICE_EMAIL/PASSWORD` exporteert (`.github/workflows/ci.yml` →
  "Export local Supabase env vars"). `routes[0]` scant `/` op dezelfde
  manier. Playwright draait `next build && next start` op
  `http://127.0.0.1:3100`, dus `NODE_ENV=production`, zonder https.

## Doel

De middleware logt alleen nog als device-account in op een browser die
aantoonbaar eerder gekoppeld is met een secret dat alleen de vereniging
kent. Een willekeurige bezoeker van de bar-URL krijgt geen sessie en kan dus
niets lezen of schrijven. Voor de gekoppelde tablet verandert niets: de
dienst, de bezetting, de verkoop en `/beheer` werken daar zoals nu.

Dit herstelt de aanname waar de hele bar-flow op rust (zie
`bar-rpc-autorisatie.md` → "Het onderliggende vraagstuk"): **wie de
device-sessie heeft, staat achter de bar.** De spec verandert niets aan de
geldlaag en voegt geen PIN-controle toe aan de RPC's.

## Betrokken shell

**`shells/bar`**, alleen daar. `shells/portal` blijft onaangeroerd (matcher,
eigen cookienaam volgens ADR 0009).

- Nieuwe route `src/app/(bar)/koppel/page.tsx`, een dunne wrapper, zelfde
  patroon als `src/app/(bar)/page.tsx`.
- Nieuw scherm `src/features/tablet-koppelen/TabletKoppelen.tsx`. Het weet
  niet in welke shell het draait. Het krijgt de server-actie als prop mee
  van de page, zodat `features/` niets uit `app/` importeert.
- Nieuwe server-only module `src/lib/tabletKoppeling.ts`: ondertekenen,
  verifiëren en code controleren. Bovenaan `import "server-only"`, zodat een
  import vanuit clientcode een buildfout geeft. De module gebruikt alleen
  Web Crypto (`crypto.subtle`), geen `node:crypto`: dezelfde code draait in
  de middleware (Edge) en in de server-actie (Node).
- `src/middleware.ts`: de beslislogica verandert (zie "Middleware" hieronder).

**Geldlaag: niet geraakt.** Er komen geen RPC's bij, er verandert geen RPC
en er is geen migratie. Beide kernbeslissingen blijven zoals ze zijn:

- *Geld alleen via RPC*: ongewijzigd. De spec bepaalt alleen **wie** een
  sessie krijgt, niet wat een sessie mag. `place_order`/`top_up`/… blijven
  de enige schrijfweg.
- *Attributie via de bezetting, start via PIN* (CLAUDE.md →
  Architectuurbeslissingen): ongewijzigd. De zwakke `served_by`-attributie
  was bewust gekozen, met als voorwaarde dat alleen mensen achter de bar
  erbij kunnen. De spec maakt dat weer waar in plaats van er een
  uitzondering op te maken.

## Datamodel

Geen wijziging. De koppeling is stateless: er komt geen tabel met gekoppelde
apparaten (zie ADR 0011 → Beslissing, en open vraag 3 als Bram per tablet
wil kunnen intrekken).

## Configuratie

| Env-var | Waar | Wat |
|---|---|---|
| `BAR_DEVICE_SECRET` | server-only, **nooit** `NEXT_PUBLIC_` | De koppelcode die iemand op de tablet invoert. Tegelijk de basis voor de HMAC-sleutel van het koppelcookie. |

- **Minimale sterkte: 128 bit entropie.** Dat is een architectuureis en
  geen smaakkwestie. `/koppel` is publiek bereikbaar en heeft geen
  rate-limit. Een betrouwbare rate-limit vraagt op Vercel om een gedeelde
  store, en die bestaat hier niet. Een kortere code is dus binnen minuten te
  brute-forcen. `src/lib/tabletKoppeling.ts` weigert een secret dat korter
  is dan de afgesproken minimumlengte (die volgt uit het formaat, open vraag
  4). Koppelen en device-inloggen doen dan niets, en de server logt één
  `console.error`. Dit faalt dicht, net als `designPreviewGate` zonder
  `DESIGN_PREVIEW_PASSWORD`.
- **Secret ontbreekt**: gelijk aan "te kort". Er wordt nergens een
  device-sessie aangemaakt. Na het uitrollen van deze spec moet
  `BAR_DEVICE_SECRET` dus in elke omgeving staan waar de bar moet werken.
- `SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD` blijven zoals ze zijn.
  Het wachtwoord heeft de server nooit verlaten, dus het hoeft niet
  geroteerd te worden.
- `.env.example` krijgt een blok voor `BAR_DEVICE_SECRET` met dezelfde soort
  toelichting als de device-vars, inclusief hoe je een secret van de juiste
  sterkte genereert.

## Het koppelcookie

- **Naam** `abas_tablet`. **Flags** `HttpOnly`, `SameSite=Strict`,
  `Path=/`, geen `Domain`. **`Secure`** staat aan zodra het verzoek via
  https binnenkomt (`request.nextUrl.protocol === "https:"`). Op Vercel is
  dat altijd zo. Lokaal en in CI (`http://127.0.0.1:3100`) staat de flag
  uit. Waarom geen `__Host-`-prefix: die vereist `Secure`, en dan werkt het
  cookie niet meer in CI en lokaal zonder dat daar een afwijkend codepad
  voor komt. Bescherming tegen cookie-injectie via een subdomein heeft op
  `*.vercel.app` weinig nut (dat domein staat op de Public Suffix List). Bij
  een eigen domein kan de prefix alsnog.
- **`Path=/` en niet smaller**: de middleware moet het cookie op `/`,
  `/koppel` en `/beheer` zien. De browser stuurt het daardoor ook mee naar
  `/portal`. Dat kan geen kwaad: niets onder `/portal` leest het, en het is
  geen Supabase-cookie, dus ADR 0009's naamscheiding blijft intact.
- **Waarde** `v1.<iat>.<nonce>.<sig>`:
  - `iat`: uitgiftemoment in seconden sinds epoch, als decimaal getal.
  - `nonce`: 16 willekeurige bytes, base64url. Nodig voor unieke waarden
    en voor herleidbaarheid in logs, niet voor de beveiliging.
  - `sig`: base64url van `HMAC-SHA-256(K, "abas-tablet|v1|<iat>|<nonce>")`.
  - `K` wordt afgeleid, niet het secret zelf: `K = HMAC-SHA-256(secret,
    "abas-tablet-cookie-sleutel-v1")`. Zo staat het secret niet in het
    cookie. Als dezelfde bytes later ook ergens anders als sleutel gebruikt
    worden, kunnen de twee toepassingen elkaar niet raken.
- **Verificatie** (`verifieerKoppelcookie(waarde, secret, nu)` → `boolean`):
  het formaat moet exact kloppen (4 delen, prefix `v1`, `iat` numeriek),
  `sig` moet kloppen via `crypto.subtle.verify` (constant-time), `iat` mag
  niet meer dan 5 minuten in de toekomst liggen (klokverschil), en `nu -
  iat` mag de maximale looptijd niet overschrijden **als** Bram voor een
  vaste looptijd kiest (open vraag 1). De browser handhaaft `Max-Age`, maar
  de server vertrouwt daar niet op: een gekopieerd cookie heeft geen
  vervaldatum meer.
- **Looptijd en verversen**: open vraag 1. Let op: Chromium begrenst elke
  cookievervaldatum op 400 dagen. Een langere looptijd dan dat bestaat in de
  praktijk niet, tenzij het cookie ververst wordt.

## Middleware

`src/middleware.ts` krijgt één pure beslisfunctie in
`src/lib/tabletKoppeling.ts`, zodat de volledige matrix unit-testbaar is
zonder request-mocks:

```
besluitDeviceSessie({ sessie: "geen" | "device" | "persoonlijk",
                      koppelcookieAanwezig: boolean,
                      koppelingGeldig: boolean,
                      padVrijgesteld: boolean,
                      crossSiteNavigatie: boolean })
  → "doorlaten" | "device-inloggen" | "naar-koppelen"
    | "uitloggen-en-doorlaten" | "uitloggen-en-naar-koppelen"
    | "same-site-herladen"
```

`crossSiteNavigatie` = `Sec-Fetch-Site: cross-site` én `Sec-Fetch-Mode:
navigate`. Zijn `crossSiteNavigatie` en `!koppelcookieAanwezig` allebei
waar op een pad dat niet vrijgesteld is, dan geeft de functie
`same-site-herladen`, **vóór** de tabel hieronder. Zie Randgevallen →
"Externe link".

- `sessie` bepaal je via `getSession()` (een cookie-read, zoals nu):
  `"device"` als `session.user.email` hoofdletterongevoelig gelijk is aan
  `SUPABASE_DEVICE_EMAIL`, anders `"persoonlijk"`. Dat de cookie-inhoud niet
  geverifieerd is, is hier geen probleem. Wie de inhoud vervalst, verandert
  alleen de beslissing voor de eigen browser, en PostgREST controleert het
  JWT alsnog.
- **Vrijgestelde paden** (nooit een redirect naar `/koppel`):
  `/koppel`, `/beheer` en alles daaronder, `/auth/` en alles daaronder.
  `/design` en `/portal` komen hier niet eens aan (de kortsluiting bovenaan
  en de matcher). Elk ander pad dat door de matcher komt, is bar-shell en
  dus niet vrijgesteld. Een toekomstige bar-route valt daarmee automatisch
  onder de afscherming, en niet automatisch erbuiten.

| sessie | koppeling geldig | pad vrijgesteld | besluit |
|---|---|---|---|
| geen | ja | — | `device-inloggen` (bestaande `signInWithPassword`-stap), daarna doorlaten |
| geen | nee | ja | `doorlaten` (geen sessie; `/beheer` toont het gewone inlogformulier) |
| geen | nee | nee | `naar-koppelen` (307 naar `/koppel`) |
| device | ja | — | `doorlaten` (normale tablet) |
| device | nee | ja | `uitloggen-en-doorlaten` |
| device | nee | nee | `uitloggen-en-naar-koppelen` |
| persoonlijk | — | — | `doorlaten` (e-mailsessie van bardienst/beheerder; ADR 0002/0003 ongewijzigd) |

Extra regel: op `/koppel` met een geldige koppeling volgt een 307 naar `/`.
Er valt dan niets te koppelen.

- **Uitloggen is altijd `signOut({ scope: "local" })`**, nooit de default
  `global`. Een globale uitlog trekt *alle* sessies van het device-account
  in, dus ook die van de echte tablet. Een bezoeker met een oud
  device-cookie zou de bar dan midden in een dienst kunnen platleggen. Dit
  is een verplicht reviewpunt.
- De bestaande foutafhandeling blijft zoals ze is: `try/catch` om alles
  heen, en een afgewezen `signInWithPassword` wordt gelogd en doorgelaten.
  Een gekoppelde tablet met een onbereikbare Supabase houdt dus de
  bestaande foutstaten van de schermen (bv. `useOpenShift`) en krijgt geen
  redirect naar `/koppel`. Het apparaat is dan wel gekoppeld, de fout zit
  ergens anders.
- Ontbreekt of is `BAR_DEVICE_SECRET` ongeldig, dan is `koppelingGeldig`
  altijd `false`. Dat faalt dicht.

## Server-actie: koppelen

`koppelTablet(formData)` in `src/app/(bar)/koppel/actions.ts`
(`"use server"`), die `src/lib/tabletKoppeling.ts` aanroept:

1. Lees `code` uit het formulier. Normaliseer volgens het formaat dat Bram
   kiest (open vraag 4), bv. spaties en streepjes eruit.
2. Vergelijk in constante tijd met `BAR_DEVICE_SECRET`: HMAC beide waarden
   met dezelfde sleutel en vergelijk de uitkomsten via `crypto.subtle`, dus
   geen `===` op de strings.
3. Klopt de code niet: geef `{ fout: "ongeldige_code" }` terug en log
   `console.error("koppelen: ongeldige code")`, **zonder** de ingevoerde
   waarde te loggen. Is de configuratie ongeldig: `{ fout:
   "niet_geconfigureerd" }`.
4. Klopt de code wel: zet het cookie (`cookies().set(...)`, flags zoals
   hierboven) en geef `{ gekoppeld: true }` terug. Het scherm doet daarna
   `window.location.replace("/")`, en bij die request logt de middleware
   als device in (tabelrij 1). Geen `redirect("/")` vanuit de actie. Next.js
   rendert het redirect-doel dan in dezelfde response mee en laat de
   `Set-Cookie` van die interne render vallen (`actionsForbiddenHeaders`),
   zodat de device-sessie de browser nooit bereikt. Afwijking van de
   oorspronkelijke spec, akkoord Bram 2026-09-28.

Verder door Bram bevestigd (2026-09-28):

- Een secret is alleen geldig als het na normalisatie uit base32-tekens
  bestaat en minstens 26 tekens lang is. Anders geldt het als "niet
  geconfigureerd".
- De server weigert een cookie waarvan `iat` ouder is dan 400 dagen, ook als
  de browser het nog meestuurt.
- Elke request met een geldig cookie ververst het (hooguit één keer per dag),
  ongeacht het soort sessie.
- Het veld is `required`: bij een leeg veld verschijnt de melding van de
  browser zelf.
- Bij een netwerk- of serverfout tijdens het koppelen komt er geen tekst. Het
  formulier blijft staan en de fout gaat alleen naar `console.error`.

Server Actions hebben een ingebouwde Origin-check. Een aparte CSRF-maatregel
is niet nodig, en een aanvaller zonder de code heeft er ook niets aan.

**De code zit nooit in een URL.** Geen `/koppel?code=…` en ook geen
`/koppel#…`. Een query-string komt in de Vercel-requestlogs, in de
browsergeschiedenis en mogelijk in een `Referer`. Een fragment komt niet in
de serverlogs, maar wel in de geschiedenis van de tablet, en die ziet
iedereen die de tablet in handen heeft. Een formulierveld met POST laat
alleen iets achter in het geheugen van wie de code typt. De prijs is dat je
de code één keer met de hand moet invoeren (zie open vraag 4 over het
formaat).

## Schermflow

### 1. Niet gekoppeld — `/koppel`

Wie zonder sessie en zonder geldige koppeling een bar-pad opent, komt hier
terecht (zie Middleware). Er is één scherm, dat tegelijk de
"niet gekoppeld"-staat en het koppelformulier is. Een aparte staat plus een
knop "koppelen" zou alleen een extra tik opleveren.

- `<main>` op `bg-rail` zoals `DienstStarten`, `AuroraMerk tone="dark"` met
  `h1` (tekst: open vraag 5).
- Een korte uitleg dat deze applicatie op dit apparaat niet gekoppeld is
  (tekst: open vraag 5).
- Een kaart met het formulier: één tekstveld "Koppelcode"
  (`autocomplete="off"`, `autocapitalize="off"`, `spellcheck={false}`,
  `type` volgens open vraag 4) en een submitknop.
- Een foutmelding bij `ongeldige_code`/`niet_geconfigureerd` in
  `role="alert"`, binnen de kaart (zelfde plaatsing als de formulierfout in
  `BeheerLogin`). Het veld wordt daarna leeggemaakt en krijgt de focus
  terug.
- Daaronder twee tekstlinks, zelfde stijl als "Inloggen met e-mail" in
  `DienstStarten`:
  - **"Inloggen met e-mail"** → `/beheer`. Een bardienst of beheerder kan
    daar op elk apparaat inloggen en via ModusKeuze → "Bar" in bar-modus
    komen (ADR 0003, ongewijzigd; zie open vraag 7).
  - **Een verwijzing naar `/portal`** voor een lid dat per ongeluk op de
    bar-URL terechtkomt (tekst en of je dit wilt: open vraag 5).
- Een succesvolle koppeling gaat via `redirect("/")` naar `DienstStarten`
  (of naar `DienstTabs` als er al een dienst open is), dus het gewone
  bar-scherm.

**Hergebruik.** `AuroraMerk` (`src/components/`) voor de kop. Voor het
tekstveld bestaat nog geen gedeeld component: de veldopmaak (label +
`h-[52px] rounded-[15px] border-rail-border bg-rail …`-input) staat nu alleen
in `BeheerLogin.tsx`. Dit wordt de tweede plek, en volgens CLAUDE.md
(“Componenten zijn herbruikbaar…”) is duplicatie dan een reviewfout. De
Developer tilt label + input daarom uit `BeheerLogin.tsx` naar een nieuw
`src/components/TekstVeld.tsx` en gebruikt dat op beide plekken. Het gaat
alleen om de opmaak en de label-koppeling, zonder validatielogica. De
submitknop volgt dezelfde klassen als die van `BeheerLogin`. Een
knopcomponent valt buiten deze spec, want de knop komt al op meer plekken
los voor.

### 2. Gekoppeld — geen zichtbare verandering

Op de gekoppelde tablet werkt `/` zoals nu. Er komt geen indicator
"gekoppeld" en geen ontkoppelknop (zie Expliciet buiten scope).

### 3. `/beheer` op een niet-gekoppeld apparaat

Het gewone `BeheerLogin`-formulier, **zonder** de `denied`-melding, want er
is geen device-sessie meer. Inloggen, magic link en wachtwoord vergeten
werken zoals nu. Na "Uitloggen" (`useBeheerSession.signOut`) komt de
bezoeker bij de volgende bar-navigatie op `/koppel`, niet meer op een
automatisch aangemaakte device-sessie. De opmerking in `useBeheerSession.ts`
→ `signOut` ("middleware re-establishes the shared device session") wordt
bijgewerkt tot "…alleen op een gekoppelde tablet".

## Rolzichtbaarheid

Geen verandering in wie wat ziet binnen een sessie. Wat verandert, is wie
een sessie krijgt:

- **Onbekende bezoeker** van de bar-URL: vroeger een device-sessie met
  leestoegang tot leden/saldi en alle bar-RPC's, nu niets. Alleen het
  koppelscherm.
- **Gekoppelde tablet**: ongewijzigd.
- **Bardienst/beheerder via e-mail** (`/beheer`), op welk apparaat dan ook:
  ongewijzigd.
- **Lid** (`/portal`): ongewijzigd.
- **Koppelen** kan iedereen die de code kent. De code zelf is de
  autorisatie. Of daar een beheerder-sessie bij moet: open vraag 2.

## Randgevallen

- **Bestaande device-sessies na de deploy: ja, die moeten ongeldig worden,
  en de middleware alleen is daarvoor niet genoeg.** Het Supabase-authcookie
  is bewust *niet* `HttpOnly` (de browserclient leest het). Iedereen die ooit
  een device-sessie kreeg, kan het refresh token dus hebben gekopieerd en
  daarmee rechtstreeks, buiten de app en de middleware om, tegen de
  Supabase-API blijven werken. De tabelrij "device + geen koppeling →
  uitloggen" ruimt alleen browsers op die de app nog openen. Echte
  intrekking vraagt een eenmalige ops-stap direct na de deploy: alle
  sessies van het device-account verwijderen (Studio → SQL: `delete from
  auth.sessions where user_id = (select id from auth.users where email =
  '<device-e-mail>')`; de refresh tokens hangen daar met een cascade aan).
  Dat heeft twee gevolgen:
  - Een access token (JWT) dat al is uitgegeven, blijft geldig tot het
    verloopt (`jwt_expiry`: lokaal 3600 s, de gehoste waarde staat in het
    dashboard). Dat venster is niet te sluiten zonder de JWT-sleutel van het
    project te roteren, en dat laatste is buiten proportie.
  - Ook de sessie van de echte tablet vervalt. Die komt bij de volgende
    navigatie op `/koppel` en wordt daar gekoppeld. Doe dit dus buiten een
    dienst (zie Uitrol).
- **Cookie verloopt of ontbreekt midden in een dienst.** De middleware logt
  de tablet bij de eerstvolgende server-request uit en stuurt hem naar
  `/koppel`. Dat is een navigatie of een RSC-fetch. Leesqueries en RPC's
  gaan rechtstreeks naar Supabase en raken de middleware niet, dus een
  geopend scherm zonder navigatie merkt het pas later. Gevolgen: de dienst
  zelf blijft open (die staat in de database) en na het opnieuw koppelen
  toont `DienstStarten` hem weer via `useOpenShift`. Een half gevuld mandje
  (clientstate) gaat verloren. Of dit in de praktijk kan gebeuren, hangt af
  van open vraag 1: met een glijdende looptijd verloopt het cookie van een
  tablet in gebruik nooit.
- **Externe link naar de bar-URL** (bv. vanuit een mail of chat) op de
  gekoppelde tablet. `SameSite=Strict` stuurt het cookie niet mee bij een
  cross-site navigatie. Zonder extra regel zou de tabel dan "device + geen
  koppeling" zien en de tablet **uitloggen**, of hem zonder sessie naar
  `/koppel` sturen terwijl hij wel gekoppeld is. Een 3xx-redirect naar
  dezelfde URL lost dat niet op: een redirectketen die cross-site begon,
  blijft voor SameSite cross-site. Daarom neemt de spec deze regel op: is
  `Sec-Fetch-Site` gelijk aan `cross-site`, is `Sec-Fetch-Mode` gelijk aan
  `navigate` en ontbreekt `abas_tablet`, dan antwoordt de middleware
  **vóór** elke andere beslissing met een minimale HTML-pagina (200,
  `Cache-Control: no-store`, `<meta http-equiv="refresh" content="0">`) die
  dezelfde URL opnieuw laadt. Dat is een navigatie vanuit een document op
  de eigen site, dus same-site, en dan komt het cookie mee. Een lus
  ontstaat niet: bij de tweede aanvraag is `Sec-Fetch-Site`
  `same-origin`. Een browser zonder koppeling komt dan gewoon op `/koppel`
  terecht. Zo'n pagina geeft geen informatie en opent geen sessie. De
  PWA-snelkoppeling, een bladwijzer of een getypte URL gelden als
  browser-geïnitieerd (`Sec-Fetch-Site: none`) en sturen `Strict`-cookies
  gewoon mee. Een magic link uit de mail naar `/beheer/callback` valt onder
  `/beheer`: het pad is vrijgesteld, de callback maakt een persoonlijke
  sessie, en herladen gebeurt daar niet (de regel geldt alleen voor paden
  die niet vrijgesteld zijn).
- **Wisselen van het secret** (rotatie): alle koppelcookies worden in één
  keer ongeldig, want de verificatie faalt met de nieuwe sleutel. De tablet
  wordt bij de volgende navigatie uitgelogd en naar `/koppel` gestuurd.
  Procedure: nieuw secret in Vercel → redeploy (env-vars gelden pas in een
  nieuwe deployment) → device-sessies intrekken (zelfde SQL als hierboven,
  want de lopende Supabase-sessie van een verloren of gestolen tablet
  overleeft anders de rotatie) → tablet opnieuw koppelen. Met één tablet is
  dat één keer een code invoeren. Of dat acceptabel is: open vraag 3.
- **Tweede tablet**: werkt zonder extra werk. Dezelfde code geeft een eigen
  cookie. Intrekken kan alleen voor alle tablets tegelijk (open vraag 3).
- **Fysieke toegang tot de gekoppelde tablet** (restrisico): wie de tablet
  in handen heeft, kan het Supabase-refresh token van de device-sessie
  kopiëren en elders gebruiken. De koppeling bindt de Supabase-sessie niet
  aan het apparaat. Dat is aanvaard, want wie aan de tablet staat, staat
  per definitie achter de bar (zelfde dreigingsgrens als B3 in
  `bar-rpc-autorisatie.md`). Bij verlies of diefstal volg je de
  rotatieprocedure.
- **Bardienst logt via e-mail in op een eigen laptop en kiest "Bar"**: de
  bar werkt, want het is een persoonlijke sessie (tabelrij "persoonlijk").
  Na uitloggen volgt `/koppel`. Of bar-modus via e-mail op een
  niet-gekoppeld apparaat moet blijven werken: open vraag 7. Deze spec
  verandert het gedrag van ADR 0003 niet zonder besluit.
- **Lokaal ontwikkelen**: `next dev` werkt precies zoals productie, zonder
  uitzondering op basis van `NODE_ENV`. Zet `BAR_DEVICE_SECRET` in
  `.env.local` en koppel de dev-browser één keer via `/koppel`. Het cookie
  blijft daarna staan. Zonder `BAR_DEVICE_SECRET` is er lokaal geen
  device-sessie, net als nu zonder `SUPABASE_DEVICE_*`. Waarom geen
  dev-bypass zoals bij `/design`: daar beschermt de gate een mockup, hier
  zou de bypass een codepad in de productiebundel zijn dat de geldlaag
  openzet, alleen afhankelijk van één env-waarde. Dat risico weegt zwaarder
  dan één keer koppelen per dev-browser.
- **Preview-deployments op Vercel**: die zijn net zo publiek als productie.
  Welke omgevingen `SUPABASE_DEVICE_*` en `BAR_DEVICE_SECRET` krijgen, en of
  dat hetzelfde secret is als in productie: open vraag 6.
- **Clientcode leest `BAR_DEVICE_SECRET`**: kan niet. Er is geen
  `NEXT_PUBLIC_`-prefix, en `import "server-only"` in
  `tabletKoppeling.ts` geeft een buildfout zodra een clientcomponent de
  module importeert. Een aparte `check:arch`-regel is daarom niet nodig.

## e2e en CI

- `.github/workflows/ci.yml` → stap "Export local Supabase env vars" krijgt
  `BAR_DEVICE_SECRET=<vaste test-waarde van de minimale lengte>`. Die waarde
  staat letterlijk in de workflow, net als `local-device-dev-only`, want het
  is een lokaal testsecret.
- Nieuwe helper `koppelTablet(page)` in `e2e/helpers/` die de echte flow
  doorloopt: `goto("/koppel")`, code invullen, submit, wachten op `/`. De
  code komt uit `process.env.BAR_DEVICE_SECRET`. De helper bouwt dus **niet**
  zelf een cookie via `context.addCookies`: dan zouden de tests aan het
  cookieformaat vastzitten en de koppelflow zelf nooit raken.
- `describe.serial("stateful bar-shell scenarios (shared session)")`: elke
  test begint met `koppelTablet(page)`. Elke test krijgt een verse
  browsercontext, dus zonder koppeling geen cookie. Koppelen kost één
  formulier-POST per test.
- `routes`-lijst: de entry `{ name: "bar shell", path: "/" }` zou zonder
  koppeling via een redirect `/koppel` scannen. Daarom vervangen door
  `{ name: "tablet koppelen", path: "/koppel" }`. Het gekoppelde `/` wordt al
  gescand in de stateful block (activiteitkeuze, pincode, Verkoop, …).
- `/beheer`-specs met mocks (`e2e/helpers/supabaseMock.ts`) draaien in CI
  voortaan **zonder** device-sessie, net als lokaal nu al zonder
  `SUPABASE_DEVICE_*`. Ze slagen lokaal al in die toestand, dus er wordt
  geen breuk verwacht. De notitie in `docs/ARCHITECTURE.md` → "e2e-mocks on
  `/beheer` must survive the device session" blijft gelden voor een
  gekoppelde context.
- **Nog te verifiëren in de eerste CI-run**: dat het cookie zonder `Secure`
  op `http://127.0.0.1` gezet en teruggestuurd wordt. Dat hoort zo te zijn,
  omdat de flag daar juist uit staat. Het risico zit in de omgekeerde
  fout: dat `Secure` per ongeluk altijd aan staat.

## Testplan

**Unit** (`test/tabletKoppeling.test.ts`, Node-testrunner, draait in
`check:fast`). Web Crypto is in Node 22 globaal beschikbaar.

- Ondertekenen → verifiëren slaagt met hetzelfde secret.
- Verifiëren faalt bij: een ander secret (rotatie), een gewijzigde `sig`,
  een gewijzigde `iat`, een gewijzigde `nonce`, een verkeerde versieprefix,
  te weinig of te veel delen, een lege string, niet-base64url, een
  niet-numerieke `iat`, een `iat` meer dan 5 min in de toekomst, en (bij een
  vaste looptijd) een verlopen `iat`.
- Een secret dat ontbreekt of te kort is: verifiëren geeft altijd `false`
  en ondertekenen weigert.
- Codecontrole: de juiste code wordt geaccepteerd (ook met de
  normalisatievarianten uit open vraag 4), een verkeerde code, een lege code
  en de code met één teken verschil worden geweigerd.
- `besluitDeviceSessie`: elke rij uit de tabel onder "Middleware" plus het
  geval `cross-site` → opnieuw laden in plaats van uitloggen.
- Constant-time vergelijken is niet als unittest te bewijzen. Dat blijft
  een reviewpunt: er staat nergens `===` op secret, code of `sig`.

**e2e** (`e2e/tablet-koppelen.spec.ts`, echte Supabase, draait in
`check:a11y`):

- Niet gekoppeld: `/` → de URL wordt `/koppel`, het koppelscherm staat er,
  en `context.cookies()` bevat geen `sb-*-auth-token` (er is dus echt geen
  sessie aangemaakt).
- Verkeerde code → `role="alert"` in de kaart, de URL blijft `/koppel`, er
  is nog steeds geen sessie.
- Juiste code → `/` met de staff picker of `DienstTabs`, en `abas_tablet`
  staat met `HttpOnly` en `SameSite=Strict`.
- Gekoppeld, maar met een gemanipuleerde cookiewaarde → wordt behandeld als
  niet gekoppeld (redirect `/koppel`).
- `/beheer` niet gekoppeld → het inlogformulier staat er **zonder** de
  `denied`-melding. Inloggen als de seed-beheerder (`femke.bos@…`) →
  ModusKeuze.
- Na uitloggen uit `/beheer` op een niet-gekoppeld apparaat → de volgende
  `goto("/")` eindigt op `/koppel`.
- `/portal` zonder koppeling: de bestaande portal-specs blijven ongewijzigd
  groen. Dat is hier de regressietoets.
- A11y: `/koppel` in de `routes`-lijst, plus de foutstaat na een verkeerde
  code als eigen scan.

**`db:test`**: niets nieuws. Er is geen database-wijziging.

## Uitrol (Bram, geen code)

Volgorde, buiten een dienst:

1. Genereer het secret volgens het gekozen formaat (open vraag 4) en zet
   het als `BAR_DEVICE_SECRET` in Vercel (in de omgevingen volgens open
   vraag 6). Doe dit **vóór** de deploy: zonder secret krijgt na de deploy
   niemand een device-sessie, ook de tablet niet.
2. Deploy.
3. Trek alle bestaande sessies van het device-account in (SQL onder
   Randgevallen).
4. Open op de tablet de bar, voer op `/koppel` de code in en controleer dat
   `DienstStarten` verschijnt.
5. Bewaar de code waar Bram besluit (open vraag 2).

## Expliciet buiten scope

- **Wat de device-sessie mag.** De RPC-autorisatie (A3/A4/B1–B3) blijft in
  `docs/features/bar-rpc-autorisatie.md`. Deze spec werkt dat document niet
  bij. Wel de relatie: deze spec is een voorwaarde voor A3/B3. Een
  allowlist "alleen het device-account" betekent pas iets als niet iedereen
  dat account krijgt.
- **Brede leestoegang op `shifts`/`shift_members`** (ADR 0007): ongewijzigd.
  Na deze spec heeft een buitenstaander daar geen sessie meer voor.
  Leden kunnen het met een portal-sessie nog steeds lezen, en dat valt onder
  A2/A3.
- **Per tablet intrekken, een lijst van gekoppelde apparaten, een
  ontkoppelknop, "gekoppeld"-indicator in beheer**: alleen bij een besluit
  over open vraag 3.
- **Een rate-limit op `/koppel`**: niet nodig bij een secret van 128 bit en
  zonder gedeelde store niet betrouwbaar te bouwen.
- **De Supabase-sessie aan het apparaat binden** (bv. alle bar-queries via
  de server laten lopen): een herbouw van de datalaag voor een restrisico
  dat fysieke toegang vereist.
- **#78** (of `/beheer` de `denied`-melding aan de device-sessie moet
  tonen): op niet-gekoppelde apparaten verdwijnt het probleem vanzelf, op de
  tablet blijft het open.
- **Offline/PWA-gedrag**: ongewijzigd (CLAUDE.md → Shells).

## Open vragen voor Bram — beantwoord 2026-09-28

Nummering gelijk gehouden, zodat de verwijzingen "open vraag N" hierboven
blijven kloppen.

1. **Looptijd van het koppelcookie: glijdend.** De middleware geeft bij
   gebruik hooguit één keer per dag een nieuw cookie uit, met een
   `Max-Age` van 400 dagen, de browsergrens. Een tablet die in gebruik is
   verloopt dus nooit. Een ongebruikt of gekopieerd cookie is na 400 dagen
   stilte dood. `iat` in de cookiewaarde is het moment van uitgifte en
   wordt bij elke verversing vernieuwd.
2. **Alleen de code is genoeg**, er is geen beheerder-sessie nodig om te
   koppelen. Bram en het bestuur bewaren de code. Een beheerder-login bij
   het koppelen kan later nog.
3. **Ja.** Bij rotatie worden alle tablets opnieuw gekoppeld. Er komt geen
   tabel met gekoppelde apparaten.
4. **26 tekens base32 in groepjes** (`ABCDE-FGHIJ-…`). De code is
   hoofdletterongevoelig; streepjes en spaties worden genegeerd. Het veld
   is `type="text"` met `autocomplete="off"`, zodat je ziet wat je typt:
   je voert de code één keer in, bij de installatie.
5. **UI-teksten** (bevestigd door Bram, 2026-09-28). Kop "Tablet
   koppelen". Uitleg "Deze tablet is nog niet gekoppeld aan de bar. Vul de
   koppelcode in; die heb je maar één keer nodig. De code staat bij het
   bestuur." Veldlabel "Koppelcode", knop "Koppelen". Bij een foute code:
   "Deze code klopt niet. Controleer hem en probeer het opnieuw." Als
   koppelen niet is geconfigureerd: "Koppelen is op deze omgeving niet
   ingesteld. Log in met je e-mailadres om de bar te gebruiken." De
   verwijzing naar de portal staat aan: "Ben je lid en wil je je saldo
   bekijken?" met de link "Ga naar het portaal" naar `/portal`. De teksten
   staan in `src/features/tablet-koppelen/teksten.ts`.
6. **Alleen Production.** Preview-omgevingen krijgen geen
   `BAR_DEVICE_SECRET` en dus nooit een device-sessie. Daar werkt de bar
   alleen via e-mail → "Bar".
7. **Ja.** Bar-modus via e-mail blijft ook werken op een niet-gekoppeld
   apparaat (ADR 0003, ongewijzigd).

## Verhouding tot bestaande beslissingen

- **Vervangt** `docs/ARCHITECTURE.md` → "Accepted risk: device sign-in has
  no tablet-trust check (2026-08-26)" / #34. Zie ADR 0011.
- **ADR 0002** stap 3 ("de eerstvolgende bar-request zonder sessie
  herstelt de device-sessie"): geldt voortaan alleen op een gekoppelde
  tablet. Het mechanisme (vervangen en weer herstellen) verandert niet.
- **ADR 0003**: de PIN-route naar bar-modus vereist een gekoppelde tablet.
  De e-mailroute blijft ongewijzigd (open vraag 7).
- **ADR 0009**: het koppelcookie is geen Supabase-cookie en raakt de
  naamscheiding tussen bar- en portalsessie niet.
- **`docs/features/bar-rpc-autorisatie.md`**: niet bijgewerkt. Deze spec is
  een voorwaarde voor A3/B3 daar, geen vervanging ervan.
- **Na akkoord bij te werken** (door Docs, niet in deze concept-ronde):
  `docs/ARCHITECTURE.md` → "Shared bar-tablet session mechanism", "Device
  sign-in mechanism", "Accepted risk…" (→ vervangen door ADR 0011), "Local/CI
  device account" (plus `BAR_DEVICE_SECRET`), "e2e-mocks on `/beheer`…";
  CLAUDE.md → Auth, één zin: de device-sessie alleen op een gekoppelde
  tablet.

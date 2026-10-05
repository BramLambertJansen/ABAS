# 0009 — Portal-sessie gebruikt een eigen Supabase-cookienaam, gescheiden van de bar/beheer-sessie

Status: **geaccepteerd** (Bram, 2026-09-25, samen met
`docs/features/portal-login.md`, issue #15). Vult ADR 0002/0003 aan
(sessie-mechanisme voor bar/beheer), vervangt niets. Zie "Aanvulling"
hieronder voor een kleine, met naam genoemde uitzondering op de
`check:arch`-regel, nodig geworden door Bram's beslissing voor één gedeelde
`/auth/callback`-route (`docs/features/portal-login.md` → "Besloten door
Bram (2026-09-25)", punt 3) — geen heropening van de kernbeslissing.

## Context

`docs/ARCHITECTURE.md` → "Deferred: device cookie isn't scoped away from
`shells/portal`" (2026-08-26, review van #33) legde dit al vast als een
bewust openstaand punt: `src/middleware.ts`'s route-matcher voorkomt dat de
gedeelde bar-tablet-device-login op `/portal`-requests *draait*, maar het
resulterende cookie zelf is niet gescoped — een browser die eerst de
bar-shell bezocht (en dus het device-cookie kreeg) en daarna naar `/portal`
navigeert, stuurt dat cookie gewoon mee. Tot nu toe onschadelijk (portal had
geen eigen sessie om mee te botsen); issue #15 (portal-login) verandert dat.

**Root cause, geverifieerd in `@supabase/ssr@0.5.2`'s broncode
(`dist/module/createBrowserClient.js`/`createServerClient.js`,
`dist/module/utils/constants.js`):** zonder een expliciete
`cookieOptions.name` gebruiken `createBrowserClient`/`createServerClient`
allebei een cookienaam die Supabase's eigen client afleidt uit alleen de
project-URL (`sb-<project-ref>-auth-token`) — dezelfde naam voor élke
instantie van de client in deze app, ongeacht welk bestand hem aanmaakt.
`src/middleware.ts` (device-login), `src/lib/supabase/client.ts` en
`src/lib/supabase/server.ts` roepen alle drie zonder `cookieOptions` op —
dat is precies waarom het bestaande bar/beheer-mechanisme al werkt (de
middleware zet een sessie onder die impliciete naam, `client.ts`/`server.ts`
lezen dezelfde naam terug, zonder dat ze ooit expliciet hoeven af te spreken
welke naam dat is). Het cookie krijgt bovendien standaard `path: "/"`
(`DEFAULT_COOKIE_OPTIONS`) — geen enkele padrestrictie zou dit dus kunnen
oplossen zonder de naam zelf te wijzigen: `path` bepaalt alleen een prefix
waarvóór een cookie wél/niet meegestuurd wordt, nooit een uitzondering
("overal behalve `/portal`") — bij gelijke naam zou een portal-sessie het
bar-cookie dus hoe dan ook overschrijven of ermee botsen.

## Beslissing

**De portal-sessie gebruikt een eigen, expliciete cookienaam
(`cookieOptions.name`), losstaand van de impliciete naam die
`src/middleware.ts`/`client.ts`/`server.ts` gebruiken — geen wijziging aan
die drie bestanden.**

- Twee nieuwe bestanden, beide onder `src/lib/supabase/` (blijft binnen de
  bestaande `check:arch`-regel — die staat elk bestand in die map al toe de
  SDK te importeren, mapprefix, geen vaste bestandsnamenlijst, zie ADR 0006
  → Beslissing voor hetzelfde argument bij `admin.ts`):
  - `src/lib/supabase/portalClient.ts` — browserclient, `cookieOptions: {
    name: "sb-portal-auth-token", path: "/portal" }`.
  - `src/lib/supabase/portalServer.ts` — serverclient (Server
    Components/Route Handlers onder `src/app/portal/`), zelfde
    `cookieOptions`.
- **`path: "/portal"`, niet de default `/`.** Niet de kernfix (die zit in de
  naam), maar een goedkope, correcte verscherping: de browser stuurt dit
  cookie dan sowieso nooit mee naar een bar/beheer-request, in plaats van
  alleen "de portal-client zoekt er toevallig niet naar". Werkt zonder
  addervangen: elke plek die dit cookie zet of leest (portal's browser- en
  serverclient) draait per definitie al binnen `/portal/*`.
- **`src/middleware.ts`, `src/lib/supabase/client.ts`,
  `src/lib/supabase/server.ts` blijven volledig ongewijzigd.** Het
  bestaande bar/beheer-mechanisme (device-login, `/beheer`-sessies) draait
  door op de impliciete, projectgebonden naam — geen regressierisico voor
  al gemergede functionaliteit.
- **Geen wijziging aan `check:rls`/RLS-policies.** Dit is een
  cookie-/transportlaag-scheiding, geen autorisatiewijziging — de
  bestaande RLS-narrowing voor rol `lid` (ADR 0007) blijft de eigenlijke
  autorisatiegrens; deze ADR zorgt er alleen voor dat een portal-request
  met het juiste, bij de sessie horende cookie aankomt.
- **Nieuwe, verplichte `check:arch`-regel** (specificatie in
  `docs/features/portal-login.md`, implementatie aan de Developer): code
  onder `src/app/portal/`/`src/shells/portal/`/`src/features/portal-login/`
  mag nooit `@/lib/supabase/{client,server}` importeren; code daarbuiten mag
  nooit `@/lib/supabase/portal{Client,Server}` importeren. Zonder deze regel
  zou een toekomstige portal-feature die per ongeluk `client.ts` importeert
  (in plaats van `portalClient.ts`) de isolatie stil weer doorbreken — precies
  het soort fout die CLAUDE.md → "Regel over regels" een gate laat afdwingen
  in plaats van reviewdiscipline.

## Verworpen alternatieven

- **Padscoping alleen, geen naamswijziging.** Zoals hierboven vastgesteld:
  `path` kan nooit "overal behalve `/portal`" uitdrukken (alleen
  prefix-matching), dus dit lost het probleem niet op — het bar-cookie
  (`path: "/"`) zou nog steeds meegestuurd worden naar `/portal`, en bij
  gelijke naam zou een portal-client het gewoon als geldige sessie lezen.
- **`client.ts`/`server.ts` een verplicht `scope`-parameter geven
  (`"bar" | "portal"`), in plaats van twee nieuwe bestanden.** Verworpen:
  dit zou alle ~40 bestaande call sites in `src/hooks/queries/` (elk
  vandaag bar/beheer-only) moeten aanraken om een parameter te verplichten,
  voor een wijziging die niets met hun eigen functionaliteit te maken heeft
  — een herbouw van gemergede, geteste code voor een portal-only probleem.
  Twee nieuwe, kleine bestanden die het bestaande patroon (`admin.ts` naast
  `client.ts`/`server.ts`) letterlijk herhalen, geven dezelfde garantie met
  nul wijziging aan bar/beheer-bestanden.
- **`client.ts`/`server.ts` een optioneel `scope`-parameter geven met
  default `"bar"`.** Verworpen om een subtielere reden: dit zou een
  toekomstige portal-feature die een bestaande, shell-onwetende leeshook
  hergebruikt (bv. een hook uit `src/hooks/queries/` die ooit ook voor
  portal bruikbaar wordt) **stilzwijgend** op de bar-cookienaam laten lezen
  — geen crash, geen foutmelding, alleen een portal-scherm dat altijd
  "niet ingelogd" toont ondanks een geldige portal-sessie. Twee losse
  bestanden + de `check:arch`-regel hierboven maken die fout een
  buildfout in plaats van een stille runtime-verrassing.
- **Eén gedeeld cookie, twee gedeelde sessies via Supabase's
  multi-session-ondersteuning.** Niet onderzocht als serieus alternatief:
  `@supabase/ssr`/GoTrue's cookie-gebaseerde opslag is niet ontworpen voor
  twee gelijktijdig actieve, losstaande identiteiten in dezelfde browser
  (zelfde grondprincipe als ADR 0002/0003's "één actieve sessie per
  browser, die vervangen wordt" voor bar/beheer) — twee volledig
  gescheiden cookienamen is de vorm die al overal in deze codebase
  gebruikt wordt voor "twee dingen die niet met elkaar mogen botsen", geen
  nieuw soort mechanisme.

## Gevolgen

- `docs/ARCHITECTURE.md` → "Deferred: device cookie isn't scoped away from
  `shells/portal`" wordt bijgewerkt naar "Settled", met een verwijzing naar
  deze ADR.
- `docs/ARCHITECTURE.md` → "Repo layout, as built" / de opsomming van welke
  bestanden de Supabase SDK mogen importeren wordt uitgebreid van twee naar
  vier (`client.ts`, `server.ts`, `admin.ts`, en nu ook
  `portalClient.ts`/`portalServer.ts`).
- Elke toekomstige portal-feature (bv. saldo/transacties-schermen, later
  self-service opwaarderen) roept `portalClient.ts`/`portalServer.ts` aan,
  nooit `client.ts`/`server.ts` — dit is het patroon dat elke volgende
  portal-hook in `src/hooks/queries/` moet volgen, niet iets dat per feature
  opnieuw afgewogen wordt.
- Geen gevolgen voor `check:rls`/`check:policy`/de geldlaag — puur een
  transportlaag-/sessiebeheerbeslissing.

## Aanvulling (2026-09-25) — één met naam genoemde uitzondering op de `check:arch`-regel, voor `/auth/callback`

`docs/features/portal-login.md` → "Besloten door Bram (2026-09-25)", punt 3,
kiest voor één gedeelde, neutrale mail-callback-route (`/auth/callback`,
Magic Link voor zowel `/beheer` als `/portal`) boven twee Supabase-projecten.
Die route moet, op basis van een gevalideerde `?next=bar`/`?next=portal`,
kiezen tussen `src/lib/supabase/server.ts` en
`src/lib/supabase/portalClient.ts`/`portalServer.ts` **vóórdat** de
sessie-uitwisseling plaatsvindt (`verifyOtp`/`exchangeCodeForSession`
persisteert de sessie als bijeffect naar de cookienaam van de client
waarmee hij wordt aangeroepen — er is geen manier om dat achteraf te
verplaatsen zonder een cookie-loze tussenvorm te introduceren, zie
`docs/features/portal-login.md` → Schermflow → `/auth/callback` voor de
volledige afweging). Dat is precies het patroon dat de oorspronkelijke
`check:arch`-regel (hierboven, "Beslissing") verbiedt: code buiten
`src/app/portal/`/`src/shells/portal/`/`src/features/portal-login/` die
`portalClient`/`portalServer` importeert.

**Aanvulling op die regel, niet een versoepeling ervan:** de regel krijgt
één expliciete, met bestandspad genoemde uitzondering —
`src/app/auth/callback/route.ts` mag als enige bestand in de codebase zowel
`@/lib/supabase/server` als `@/lib/supabase/portalClient`/`portalServer`
importeren. Dit is een bestandspad, geen mapprefix: een toekomstige tweede
shared-route zou zelf opnieuw expliciet aan de uitzonderingslijst
toegevoegd moeten worden, niet automatisch meeliften. Binnen dat ene bestand
geldt onverkort dat één request nooit beide cookienamen tegelijk schrijft —
de route kiest er, op basis van `next`, precies één vóór de
sessie-uitwisseling en gebruikt die client daarna consistent (ook voor de
koppel-RPC-aanroepen erna). De kernisolatie (bar-sessie en portal-sessie
kunnen elkaar nooit lezen/overschrijven) blijft dus intact; alleen de plek
waar de *keuze* tussen de twee cookienamen wordt gemaakt, krijgt er één
bewust gecentraliseerd bestand bij naast de vele bestanden die altijd al
voor precies één van de twee kiezen.

- `docs/features/portal-login.md` → Cookie-isolatie (ADR 0009) beschrijft de
  exacte, bijgewerkte `check:arch`-regel voor de Developer.
- Path-scoping is gewijzigd naar `/` (zie Wijziging onderaan; was `path: "/portal"` op
  `sb-portal-auth-token`) of aan `src/middleware.ts`/`client.ts`/`server.ts`
  zelf — deze aanvulling raakt uitsluitend de importregel en het ene nieuwe
  bestand dat ervan gebruikmaakt.

## Wijziging (2026-10-05): `path: "/"`

`path: "/portal"` brak de magic link via PKCE (`?code=`): het
`code_verifier`-cookie bereikte `/auth/callback` niet, de uitwisseling faalde
en de gebruiker landde weer op het inlogscherm. `portalClient.ts` en
`portalServer.ts` gebruiken nu `path: "/"`. De isolatie zit in de cookienaam
(zie Beslissing); de path-scoping was daar al "niet de kernfix". Bestaande
portal-sessies vervallen eenmalig (ander cookiepad).

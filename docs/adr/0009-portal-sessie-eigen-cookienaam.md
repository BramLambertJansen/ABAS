# 0009 — Portal-sessie gebruikt een eigen Supabase-cookienaam, gescheiden van de bar/beheer-sessie

Status: **voorgesteld door de Architect, wacht op akkoord van Bram** (samen
met `docs/features/portal-login.md`, issue #15). Vult ADR 0002/0003 aan
(sessie-mechanisme voor bar/beheer), vervangt niets.

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

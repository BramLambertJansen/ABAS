# Server-only modules hard afschermen van clientbundels

**Status: gebouwd in deze branch (2026-10-05); merge na groene CI en review.** Bram heeft de keuzes
voor deze opdracht bij de Architect gelegd: de spec geldt als goedgekeurd
zodra hij geschreven is. Item C van de review van 2026-10-05.
Architectuurbeslissing:
[ADR 0021](../adr/0021-server-only-markering-is-de-grens-client-server.md).

## Aanleiding (situatie vóór implementatie)

- `src/lib/supabase/admin.ts` (`createAdminClient`, service-role, leest
  `SUPABASE_SECRET_KEY`) heeft geen `import "server-only"`. Het
  `server-only`-package staat niet in `package.json`. Next.js kent de naam
  wel zelf (`node_modules/next/dist/build/create-compiler-aliases.js`,
  `createServerOnlyClientOnlyAliases`: server → `empty`, client → `index`,
  dat gooit). Er is dus nu niets dat de build laat falen.
- `scripts/check-arch.mjs` regel 4 (`ADMIN_CLIENT_RE`, r. 27/124) vangt
  alleen een clientbestand dat `admin.ts` *direct* importeert. Directe
  gebruikers van `admin.ts` zijn `src/lib/barLogin.ts`,
  `src/lib/inviteMember.ts` en `src/lib/productImage.ts`. Een clientbestand
  dat één van die drie importeert, passeert de gate.
- `scripts/lib/scan.mjs:34` (`IMPORT_RE`) ziet `await import("…")`,
  `require("…")` en een kale `import "…"` niet. Een specifier met extensie
  (`"../lib/supabase/admin.ts"`, de vorm die `productImage.ts` zelf voor
  relatieve imports gebruikt) matcht het anker `admin$` niet. `importsOf`
  draait bovendien op de ruwe bron, dus ook op voorbeeldcode in comments.
- De comment in `admin.ts:15-17` ("there is no gate that blocks that
  specifically today") klopt al niet meer sinds regel 4, en straks helemaal
  niet.
- Nu lekt er niets: een droogloop van de transitieve regel (keuze 3) over de
  huidige `src/` (161 clientmodules) bereikt geen van `admin.ts`,
  `server.ts`, `portalServer.ts`, `barLogin.ts`, `inviteMember.ts`,
  `productImage.ts`, `productImageProcessing.ts`, `clientIp.ts`,
  `linkInvitedMemberAccount.ts` of `linkLidMemberAccount.ts`. Clientcode
  haalt types en regels al uit losse modules (`barLoginTypes.ts`,
  `productImageRules.ts`). Dit is een gat in de afdwinging, geen bestaand
  lek.

## Doel

Een server-only module (service-role, secrets, servercookies) kan niet in
een clientbundel terechtkomen, ook niet via een tussenmodule. De build faalt
dan. `check:arch` meldt het al eerder (pre-commit), met de importketen in de
melding.

## Betrokken shell

Geen. Dit gaat over de bouw en de gates, niet over een scherm. Geen
UI-wijziging, geen wireframe van toepassing.

## Geldlaag en attributie

Niet geraakt. Geen RPC, geen migratie. De twee kernbeslissingen (geld alleen
via RPC, `served_by` uit de bezetting) blijven ongewijzigd. Wel versterkt dit
ADR 0006: de service-role-client, die `auth.uid()` leeg laat en dus elke
actorcheck zou omzeilen, kan alleen nog server-side bestaan.

## Keuzes

### 1. `server-only` als expliciete dependency, markering in drie bestanden

`npm install --save-exact server-only` (versie `0.0.1`, onder
`dependencies`). Next.js zou het ook zonder package oplossen, maar dan lost
alleen Next het op. Met het package lost ook Node het op: buiten Next wijst
de standaardconditie naar `index.js`, dat gooit. Een script of test dat per
ongeluk een gemarkeerde module echt laadt, faalt dus hard, met een duidelijke
fout in plaats van `ERR_MODULE_NOT_FOUND`.

Eerste statement van deze drie bestanden wordt `import "server-only";`:

| Bestand | Waarom |
|---|---|
| `src/lib/supabase/admin.ts` | service-role-client, leest `SUPABASE_SECRET_KEY` |
| `src/lib/supabase/server.ts` | `next/headers`-cookies, sessie van bar/beheer |
| `src/lib/supabase/portalServer.ts` | `next/headers`-cookies, portalsessie |

`server.ts` en `portalServer.ts` faalden in een clientcomponent al op
`next/headers`. De markering maakt het expliciet en neemt ze mee in de
`check:arch`-regel. Zo hoeft die regel niet te weten wat `next/headers` is.

**Niet gemarkeerd** (bewust): `barLogin.ts`, `inviteMember.ts`,
`productImage.ts`, `linkInvitedMemberAccount.ts`, `linkLidMemberAccount.ts`.
Ze importeren `admin.ts` of `server.ts` en zijn daardoor transitief
server-only, voor Next én voor `check:arch`. Een tweede markering per
gebruiker is herhaling die uit de pas kan lopen (ADR 0021 → Beslissing 2).
Ook niet: `productImageProcessing.ts` (`sharp`, alleen via `productImage.ts`
bereikbaar) en `clientIp.ts` (`node:net`, geen secret; `test/clientIp.test.ts`
importeert hem direct en hoeft zo niets te weten van een resolve-hook).

Toekomstige secrets (bijvoorbeeld een webhook-secret voor iDEAL) komen in
een eigen module met de markering, en in `REQUIRED_SERVER_ONLY` (keuze 3).

### 2. Unit-tests: geen wijziging nodig, wel een vangnet

Onderzocht hoe `node --test` deze modules laadt:

- `test/barLogin.test.ts`, `test/inviteMember.test.ts`,
  `test/productImage.test.ts` en `test/productImageRoute.test.ts` registreren
  een resolve-hook (`test/fakes/*-resolve.mjs`) die `@/lib/supabase/admin`
  en `@/lib/supabase/server` omleidt naar nep-modules. De echte `admin.ts` en
  `server.ts` worden nooit geladen; de markering wordt dus nooit uitgevoerd.
  `barLogin.ts`, `inviteMember.ts` en `productImage.ts` draaien ongewijzigd
  en zijn niet gemarkeerd (keuze 1).
- `test/beheerCallback.test.ts` leidt `@/lib/supabase/server` om via
  `test/fakes/resolve-hooks.mjs`. Geen test laadt `portalServer.ts`
  (`src/app/auth/callback/route.ts` heeft geen unit-test).
- `integration/account-koppeling.test.ts` maakt zijn eigen client met
  `@supabase/supabase-js` en importeert niets uit `src/`.
- `e2e/` (Playwright) importeert niets uit `src/`; `e2e/helpers/supabaseAdmin.ts`
  leest alleen `supabase status`. De app draait daar als echte `next start`.

Dus: **geen** `--conditions=react-server` op het testscript. Die conditie
verandert ook wat `react` en andere packages exporteren; dat raakt tests die
niets met deze opdracht te maken hebben. Laadt een toekomstige test wel een
gemarkeerde module echt, dan gooit `server-only` meteen ("This module cannot
be imported from a Client Component module"). Dan wijst de resolve-hook van
die test `"server-only"` naar `next/dist/compiled/server-only/empty.js`,
zoals `test/fakes/resolve-hooks.mjs` al doet. Die mapping blijft staan; alleen
de comment erbij wordt bijgewerkt (verwijst naar het niet meer bestaande
`test/tabletKoppeling.test.ts` en zegt dat `server-only` geen eigen
dependency is).

### 3. `check:arch` volgt de importgraaf (vervangt regel 4)

De build is de afdwinging. `check:arch` doet het ook, om twee redenen. Het
draait in de pre-commit-hook, terwijl `build` alleen in CI draait. En het is
met fixtures te testen in `npm test`; de build van Next niet (zie keuze 5).
Regel 4 (`ADMIN_CLIENT_RE`) vervalt. Hij is een speciaal geval van de nieuwe
regel.

**3a. `scripts/lib/scan.mjs`: imports volledig herkennen.** Nieuwe export
`importRefsOf(source)` die op `stripComments(source)` draait en per import
`{ spec, typeOnly }` teruggeeft. Herkende vormen:

| Vorm | Voorbeeld | `typeOnly` |
|---|---|---|
| statisch | `import x from "a"`, `import { y } from "a"`, `import * as z from "a"` | nee |
| re-export | `export { y } from "a"`, `export * from "a"`, `export * as z from "a"` | nee |
| kaal (side-effect) | `import "a";` | nee |
| dynamisch | `import("a")`, `await import("a")` | nee |
| CommonJS | `require("a")` | nee |
| type-only | `import type { T } from "a"`, `export type { T } from "a"` | ja |

`import { type T } from "a"` (inline, niet alles type) telt als gewone
import. Dat is conservatief; de oplossing bij een melding is `import type`.
Daarnaast een export `hasNonLiteralImport(source)`: waar voor `import(`/
`require(` met iets anders dan één string-literal als argument
(variabele, template literal). `importsOf(source)` blijft bestaan als
`importRefsOf(source).map(r => r.spec)`, zodat regels 1-3 en 5 dezelfde
uitgebreide herkenning krijgen. Draai `check:arch` na de wijziging op de
huidige tree; nieuwe meldingen op die regels zijn echte vondsten en moeten
opgelost of gemeld worden, niet weggefilterd.

**3b. Oplossen naar bestanden.** Een helper `resolveSpec(fromFile, spec,
files)`. `@/x` wordt `src/x`, een relatief pad wordt opgelost tegen de map van
`fromFile`. Een expliciete extensie (`.ts/.tsx/.js/.jsx/.mjs`) wordt eerst
gestript. Daarna in volgorde proberen: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
`/index.ts`, `/index.tsx`, tegen de set uit `walk()`. Packages (geen `@/`,
geen `.`) leveren `null` en worden niet gevolgd.

**3c. De regels in `scripts/check-arch.mjs`:**

- **Markering herkennen:** een bestand is gemarkeerd als
  `importRefsOf` een kale import van `"server-only"` bevat.
- **Verplichte markering:** `REQUIRED_SERVER_ONLY = ["src/lib/supabase/admin.ts",
  "src/lib/supabase/server.ts", "src/lib/supabase/portalServer.ts"]`. Elk
  bestand in die lijst dat bestaat en niet gemarkeerd is, is een fout:
  `"<file>: must start with import \"server-only\" (ADR 0021)"`. Bestaat het
  bestand niet, dan is dat ook een fout. De lijst wordt dan bewust
  bijgewerkt, niet stil overgeslagen.
- **Transitief bereik:** voor elke clientmodule (bestaande definitie:
  `USE_CLIENT_RE` of `CLIENT_ONLY_DIRS`) een breadth-first-zoektocht over de
  niet-type-only imports die naar een bestand in `src/` oplossen. Bereikt
  die een gemarkeerd bestand, of is de clientmodule zelf gemarkeerd, dan is
  dat één fout per (clientmodule, gemarkeerd bestand), met de kortste keten:
  `"src/features/x/Y.tsx: reaches server-only src/lib/supabase/admin.ts via
  src/lib/barLogin.ts — server-only modules never enter a client bundle (ADR
  0021); move shared types/rules to a separate module"`. Memoiseer per
  bestand de importlijst (lezen en parsen één keer), niet het bereik.
- **Niet-letterlijke import:** elk bestand in `src/` waarvoor
  `hasNonLiteralImport` waar is, is een fout: `"<file>: non-literal
  import()/require() — check:arch can't follow it (ADR 0021)"`. Vandaag zijn
  er nul.
- **Secret op één plek:** `SUPABASE_SECRET_KEY` mag in de comment-vrije
  bron van alleen `src/lib/supabase/admin.ts` voorkomen (ADR 0006 →
  Beslissing). Elk ander bestand in `src/` dat de naam bevat, is een fout.
  Vandaag is `admin.ts:35` de enige.

De header-comment van regel 4 (ADR 0006-motivatie) verhuist naar de nieuwe
regel, met een verwijzing naar ADR 0021.

### 4. Opruimen

- `src/lib/supabase/admin.ts`: de header-alinea "NEVER import this from a
  `"use client"` file — there is no gate that blocks that specifically
  today …" wordt: de markering hieronder laat `next build` falen bij elke
  import vanuit clientcode, ook indirect, en `check:arch` controleert dat
  transitief (ADR 0021). De rest van de header blijft.
- `test/fakes/resolve-hooks.mjs`: comment bijwerken (keuze 2).
- `CLAUDE.md` → Verificatie, rij `check:arch`: "service-role-client nooit
  vanuit client-code" wordt "server-only modules (`import "server-only"`)
  nooit bereikbaar vanuit client-code, ook niet indirect". Docs-rol, na de
  merge. De tabel blijft één regel per gate, dus geen groei.

### 5. Bewijs: de eigen helft in CI, de Next-helft één keer handmatig

Een negatieve `next build` in CI (een fixture-component dat een gemarkeerde
module importeert, en verwachten dat de build faalt) is afgewezen. Dat kan
niet in de app-build zelf zonder die te breken. Een aparte fixture-app kost
een tweede volledige build per CI-run (minuten, met een eigen
`next.config`/`tsconfig`), en wat hij bewijst is gedrag van Next.js, niet van
onze code. In CI testen we wat van ons is: dat de markeringen er staan en dat
geen clientmodule er een bereikt. Dat de build faalt, bewijst de Developer
één keer handmatig (Testplan, stap 4) en zet hij met de uitvoer in de PR.

## Datamodel

Geen wijziging.

## RPC's

Geen.

## Rolzichtbaarheid

Niet van toepassing.

## Randgevallen

- **Clientmodule importeert alleen een type uit een server-only module**
  (`import type { X } from "@/lib/barLogin"`): toegestaan, de import
  verdwijnt bij compilatie. Een inline `import { type X }` wordt gemeld; de
  oplossing is `import type`.
- **Re-export met extensie** (`export * from "../lib/supabase/admin.ts"`):
  wordt opgelost naar het bestand, dus gemeld (het oude `admin$`-anker miste
  dit).
- **Gemarkeerde module importeert een gemarkeerde module** (`productImage.ts`
  → `admin.ts`): geen probleem. De regel kijkt alleen vanaf clientmodules.
- **`src/middleware.ts`** importeert geen van de drie (eigen `@supabase/ssr`-
  client, uitzondering in regel 3) en is geen clientmodule. Valt buiten de
  regel. Middleware is servercode; een import van een gemarkeerde module zou
  daar toegestaan zijn. Of de edge-laag van Next de markering accepteert, is
  niet nagegaan, want er is geen aanleiding.
- **Server Component (`src/app/**/page.tsx` zonder `"use client"`)
  importeert een gemarkeerde module:** toegestaan, geen clientmodule.
  Importeert een `"use client"`-bestand onder `src/app/` (bv.
  `src/app/design/DesignBrowser.tsx`) er een, dan wordt dat gemeld.
- **Een `src/lib`-module zonder directive die door clientcode geïmporteerd
  wordt** (bv. `apparaat.ts`, door `useBarAuth.ts` én `barLogin.ts`): zit in
  de clientgraaf. Importeert hij ooit een gemarkeerde module, dan meldt de
  zoektocht vanaf `useBarAuth.ts` dat, met de keten.
- **Test laadt een gemarkeerde module echt:** gooit meteen; oplossing in
  keuze 2.

## Testplan

### 1. `test/checkArchServerOnly.test.ts` (nieuw, draait in `npm test`)

Test de echte gate end-to-end, niet een kopie van de logica. Per scenario
een tijdelijke map (`fs.mkdtempSync(os.tmpdir())`) met een minimale
`src/`-boom, geschreven vanuit de test. Daarna
`spawnSync(process.execPath, [<repo>/scripts/check-arch.mjs], { cwd: tmp })`;
de test controleert exitcode en stderr. De fixtures staan als strings in de
test, niet als `.ts`-bestanden in de repo. Anders pakken `tsc`, `lint` en
`check:arch` zelf ze op. `after()` ruimt de mappen op.

Basisboom (positieve controle, verwacht exit 0): de drie verplichte
bestanden met `import "server-only";`, `src/lib/barLogin.ts` dat
`@/lib/supabase/admin` importeert, `src/lib/barLoginTypes.ts` zonder
imports, en `src/features/x/Ok.tsx` met `"use client"` en
`import type { T } from "@/lib/barLogin"` plus
`import { y } from "@/lib/barLoginTypes"`.

Negatieve scenario's (elk: basisboom plus één bestand; verwacht exit 1 en een
melding met de genoemde keten):

| # | Toegevoegd | Verwachte melding bevat |
|---|---|---|
| 1 | `src/features/x/A.tsx`: `"use client"` + `import { f } from "@/lib/barLogin"` | `A.tsx: reaches server-only src/lib/supabase/admin.ts via src/lib/barLogin.ts` |
| 2 | `src/components/B.tsx` (geen directive, clientmap) + `import { f } from "../lib/barLogin.ts"` | `B.tsx: reaches server-only src/lib/supabase/admin.ts` |
| 3 | `src/lib/reexport.ts`: `export * from "./supabase/admin.ts"`; `src/hooks/queries/useC.ts` importeert `@/lib/reexport` | `useC.ts: reaches … via src/lib/reexport.ts` |
| 4 | `src/features/x/D.tsx`: `"use client"` + `const m = await import("@/lib/barLogin")` | `D.tsx: reaches` |
| 5 | `src/features/x/E.tsx`: `"use client"` + `require("@/lib/supabase/server")` | `E.tsx: reaches server-only src/lib/supabase/server.ts` |
| 6 | `src/features/x/F.tsx`: `"use client"` + kale `import "@/lib/barLogin";` | `F.tsx: reaches` |
| 7 | `src/app/x/G.tsx`: `"use client"` + `import { f } from "@/lib/barLogin"` (client buiten de clientmappen) | `G.tsx: reaches` |
| 8 | `src/features/x/H.tsx`: `"use client"` + `import { type T, f } from "@/lib/barLogin"` | `H.tsx: reaches` (inline `type` telt niet als type-only) |
| 9 | basisboom, maar `admin.ts` zonder markering | `src/lib/supabase/admin.ts: must start with import "server-only"` |
| 10 | basisboom zonder `portalServer.ts` | `src/lib/supabase/portalServer.ts` (ontbreekt) |
| 11 | `src/lib/x.ts`: `const p = "a"; await import(p)` | `non-literal import()/require()` |
| 12 | `src/lib/y.ts`: `process.env.SUPABASE_SECRET_KEY` | `SUPABASE_SECRET_KEY` |
| 13 | `src/features/x/I.tsx`: `"use client"` + `// import { f } from "@/lib/barLogin"` (alleen in comment) | verwacht exit 0 (comments tellen niet) |

Scenario 1 en 2 sluiten het gat uit de review (indirect via `barLogin.ts`).
3 tot en met 6 sluiten de gaten in `IMPORT_RE` en het extensie-anker.

### 2. Bestaande tests

`npm test` blijft groen zonder wijziging aan testbestanden of fakes
(keuze 2). `npm run check:arch` op de echte tree: exit 0 (droogloop, zie
Aanleiding). Levert de uitgebreide herkenning (3a) op regels 1-3/5 een
nieuwe melding op, dan stopt de Developer en meldt die. Niet wegfilteren.

### 3. CI

Niets nieuws in `.github/workflows/`: `npm test` en `npm run check:arch`
draaien al. `npm run build` bewijst dat de drie markeringen de eigen
server-routes niet breken (Route Handlers zijn servercode; `empty.js`).

### 4. Handmatig, één keer, uitvoer in de PR (niet committen)

Tijdelijk in `src/features/assortimentbeheer/Assortimentbeheer.tsx`
`import { sendMemberInvite } from "@/lib/inviteMember";` plus een gebruik
toevoegen, dan `npm run build`. Verwacht: build faalt met Next's
`server-only`-fout en een importketen die via `inviteMember.ts` op
`admin.ts` uitkomt. Ook `npm run check:arch` faalt op die regel. Wijziging
terugdraaien. Plak beide foutmeldingen in de PR-beschrijving.

## Documentatie (door de Architect bij deze spec bijgewerkt)

- [ADR 0021](../adr/0021-server-only-markering-is-de-grens-client-server.md)
  (nieuw).
- ADR 0006: verwijzing bij "Signaal voor een mogelijke toekomstige gate" en
  bij de alinea "er is vandaag geen gate".
- `docs/ARCHITECTURE.md`: nieuwe sectie "Server/client-grens".

Na de merge (Docs-rol): `CLAUDE.md` → Verificatie, rij `check:arch` (keuze
4); status hier en in ADR 0021 naar gebouwd.

## Expliciet buiten scope

- Een volwaardige parser (TypeScript-AST) voor `scan.mjs`. De regex-aanpak
  blijft, uitgebreid met de vormen uit 3a en getest met fixtures. Gaat hij
  vals-positief of vals-negatief op iets dat ertoe doet, dan is dat het
  moment voor een parser (scan.mjs-header).
- Een negatieve `next build` in CI (keuze 5).
- `client-only`-markering voor de omgekeerde richting (browser-API's in
  servercode). Geen aanleiding gevonden.
- Een algemene regel voor alle niet-`NEXT_PUBLIC_`-env-vars in clientcode.
  Next inlinet ze niet, dus er lekt niets. Alleen `SUPABASE_SECRET_KEY`
  krijgt een regel (3c), als het secret dat RLS omzeilt.
- `tsconfig`-optie `noUncheckedSideEffectImports`. Niet nodig: met het
  package geïnstalleerd lost `import "server-only"` gewoon op.

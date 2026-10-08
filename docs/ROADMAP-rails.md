# Roadmap — rails in tooling

Status: **goedgekeurd**

Uitwerking van [ADR 0025](adr/0025-rails-in-tooling.md). Elke fase start met
een spec via `/spec` en Brams akkoord. De volgorde volgt de afhankelijkheden:
eerst de deadline, dan de vorm.

Gebouwd in PR #184 (de rails zelf): agenthek, rolprompts, rules, skills,
`check:docs`, ratchet, strikte lint en typecheck, aangescherpte
arch/policy/migrations/rls-gates, CI via `check:all`, diff-guard,
beveiligingsscans, productie alleen via release.

## Fase 0 — tijdkritisch, vóór 2026-10-30

| Stap | Wie | Toelichting |
|---|---|---|
| 0.1a `auto_expose_new_tables = false` + expliciete grants | **gebouwd (#187)** | Migratie 0044 (131 rechten, afgeleid met `scripts/kit/api-rechten.sql`); op productie een no-op. Gaat mee met de `db push` van 0.1. |
| 0.1 Migraties `0041`–`0044` naar productie | Bram (`supabase db push`) | Productie staat op `0040` (gecontroleerd 2026-10-07). Daardoor faalt `check:deployment` en serveert productie nog `0cfbb56`. De voorwaarde-queries van ADR 0023 zijn op 2026-10-07 gedraaid en kloppen allemaal (zie de checklist). |
| 0.2 Release van `main` | Bram (Release-workflow) | Na 0.1. Via `release.yml`, want de Git-autodeploy staat uit. |
| 0.3 Legacy `place_order`/`top_up` dichtzetten | spec + migratie | Productie geeft `authenticated` EXECUTE op beide (2026-10-07), naast `*_once`. Pas na 0.2 (ADR 0024: compatibele uitrol). Daarna revoke en herclassificatie als `intern` in `rpc_catalogus`. |
| 0.4 Geen tabel-SELECT voor `authenticated` | spec + pgTAP | Assertie over elke tabel, eerst met een bekende uitzonderingslijst in de ratchet. Bereidt R1 voor. |
| 0.5 Sleuteltypes controleren | Bram | Zie de checklist. De legacy JWT-sleutels verdwijnen "late 2026". |

## Fase 1 — agentrails afmaken

- Branch protection, verplichte checks, CODEOWNERS en het label aanmaken (Bram, checklist).
- De 47 specs zonder statusregel krijgen er een (Docs-agent, per spec; ratchet `spec-zonder-status`).
- De 12 leespolicies krijgen een negatieve test die hun naam noemt (Tester; ratchet `rls-policy-zonder-naam-in-test`).
- `docs/ARCHITECTURE.md` opschonen: één sectie per onderwerp (er zijn nu twee "Server/client-grens"-secties).

## Fase 2 — datalaag (R2, R6, R7, R8, R10)

1. Gegenereerde `Database`-types (`supabase gen types --local`) met een driftgate in CI.
2. `src/lib/rpc/` als enige `.rpc()`-ingang, met een gegenereerd foutcoderegister uit `pg_proc.prosrc`. `src/copy/fouten.ts` wordt een `Record<FoutCode, string>`.
3. TanStack Query met hookfabrieken. De 62 hooks migreren; de race in 19 hooks verdwijnt daarmee. `check:arch`: clientmodules alleen vanuit `src/lib/rpc/`.
4. `get_limits()`. TS-constanten met limieten gaan weg.
5. `search_path = ''` in één migratie voor elke functie, daarna aanscherping van `rpc_catalogus`.
6. pgTAP-helpers in een `tests`-schema via `seed.sql`, nadat CLI 2.118 is geverifieerd. `act_as_bar` (16×) vervangen; `tests.geld_invariant()`.
7. Read-RPC's voor de 22 bestanden met `.from()`, daarna het `api`-schema (R1) en de assertie uit 0.4 zonder uitzonderingen.
8. Migratiehygiëne: squawk, `supabase db lint --level error`, `supabase db advisors` als blokkerende stappen (vlaggen eerst verifiëren).
9. Typetest op geld-`Args` (R10). `MONEY_TABLES` uit een tabelcommentaar in plaats van uit de code.
10. Idempotentieraces in `test:integration` met parallelle clients.

## Fase 3 — design system (R3, R4, R5)

1. Tailwind v4-migratie. **Gebouwd (#185; het thema resetten in #197).**
   - tokens in `@theme` in `src/app/globals.css`;
   - de bronscan is beperkt tot `src/` met `source("../")`;
   - de focusring staat in de utilities-laag: hij wint van een kale `outline-hidden` en verliest van `focus-visible:outline-*`;
   - better-tailwindcss gebruikt `entryPoint`; de suppressies dalen van 1082 naar 1060;
   - het thema is gereset (`--*: initial`, #197): wat `src` van de standaardschalen gebruikt staat expliciet in `@theme`, en `no-unknown-classes` keurt standaardklassen als `bg-red-500` af.
2. Tokenschaal. **Gebouwd (#197).** `h-control`/`h-control-lg` (44/52px), radius `sm`/`control`/`card`/`panel`/`sheet` (8/12/16/22/28px), `surface`/`surface-rail` (`rail-card` vervalt), het gereset thema uit stap 1; de suppressies dalen van 1060 naar 947. Screenshotvergelijking per scherm niet uitgevoerd (`docs/features/tokenschaal.md` → Tests).
3. `Knop`/`Toets`/`Tegel`/`Chip` met een variantobject. **Gebouwd (#198, #199), behalve `Tegel` en de optierijen.**
   - `Knop` (variant, tone, maat, icoon, href), `Chip`, `Segment`/`SegmentBalk` en `Toets`; `knopStijlen.ts` is vervallen.
   - De lintregel op `className` (alleen layout) geldt voor deze componenten; de suppressies dalen van 947 naar 810.
   - De maat volgt de rol, niet `density` (`maat="normaal"` 44px of `"groot"` 52px, [ADR 0026](adr/0026-controlmaat-per-rol.md), herziet R5).
   - Niet gebouwd: `Tegel` (5 plekken) en de optierijen (10), bewust eigen markup met een reden-commentaar. Een eigen spec volgt als dat nodig blijkt.
   - Screenshotvergelijking per scherm niet uitgevoerd (`docs/features/knop.md` → Tests).
4. `<AsyncInhoud>` op de leesvorm uit fase 2, plus een copycatalogus `src/copy/nl.ts` met een woordenlijsttest.
5. `scanAxe(page)` met `wcag22aa` als enige ingang (lintverbod op losse `AxeBuilder`).
6. `/design/systeem` (dev-only) met `toHaveScreenshot`-baselines en `check:catalogus`. **Gebouwd (#200, #201).** Pagina onder de `/design`-poort, baselines via de workflow `screenshots-bijwerken`; uitzonderingen hebben een code ([spec](features/ontwerpsysteem-uitzonderingen.md)), de lijst daalt in twee vervolg-PR's van 13 naar 4.
7. Een focusgate: `outline-none` alleen samen met `focus-visible:ring-*`.

Elke stap verlaagt `eslint-suppressions.json`; `npm run lint:prune` legt dat vast.

## Fase 4 — extractie (R9)

Bij het tweede project: een `stack-rails`-repo, `npx stack-rails sync --ref vX.Y.Z`, `.claude/.kit-versie` en `check:kit`, en een herbruikbare workflow (`workflow_call`). Het generieke deel staat al apart: `rolhek.mjs` tegenover `rolhek.lokaal.json`, en `scripts/kit/`.

## Fase 5 — verharding, doorlopend

- Nonce-CSP met `frame-ancestors 'none'`.
- Controle op `Content-Type`/`Origin` op `inloggen/*`.
- Constante-tijdvergelijking voor de Basic-auth van `/design`.
- Stryker op `src/lib/money.ts` en de mandjelogica.
- knip en jscpd met een baseline.
- CodeQL aanzetten zodra Code Security beschikbaar is.

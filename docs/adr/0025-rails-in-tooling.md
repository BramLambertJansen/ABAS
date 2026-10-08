# ADR 0025 — Rails in tooling: agenthek, ratchet en één bron per feit

Status: **goedgekeurd**

Toelichting: besloten door Bram op 2026-10-07, punt voor punt, naar aanleiding
van het advies "Leg de rails vast in tooling". De rails zelf (agenthek,
rolprompts, rules, skills, CI, gates) zijn gebouwd in PR #184. De besluiten
onder "Richting" zijn nog niet gebouwd; ze staan per fase in
[`docs/ROADMAP-rails.md`](../ROADMAP-rails.md). Wordt deze ADR `gebouwd`,
dan zijn alle fases afgerond.

## Context

De database werd al door gates bewaakt die de catalogus lezen
(`rpc_catalogus`, `rls_leespolicies`). De agents, de client-datalaag en de UI
werden alleen met proza en naamconventies bewaakt, terwijl agents juist daar
het vaakst schrijven:

- Er was geen `.claude/settings.json` en geen enkele hook, en elke rol had
  onbeperkt `Bash`. De Reviewer kon mergen en de Developer tests aanpassen.
- De rolprompts bevatten feiten die verouderd waren: PIN-attributie, "geen
  a11y-gate", een PIN op `start_shift`, ADR's als `NNN-`.
- `ci.yml` draaide niet `check:all`, terwijl CLAUDE.md dat beweerde.
- `check:policy` ving alleen een variabele die letterlijk `supabase` heet.
- Er waren honderden bestaande lint-overtredingen. Daardoor kon geen nieuwe
  regel meteen hard worden ingevoerd.

## Besluit — wat nu geldt

1. **Agenthek.** `.claude/settings.json` met deny-regels en een
   `PreToolUse`-hook (`.claude/hooks/rolhek.mjs`):
   - schrijfrecht per `agent_type`;
   - gates en tests zijn read-only voor de Developer;
   - pushen en mergen mag alleen vanuit de hoofdsessie;
   - de pre-commit hook omzeilen kan niet.

   Een `SubagentStop`-hook laat Developer en Tester pas stoppen bij een groene
   `check:fast`. De hook is een vangnet, geen beveiligingsgrens. De grens ligt
   bij GitHub: branch protection, verplichte checks, CODEOWNERS en de
   diff-guard.
2. **Label voor gate-wijzigingen, voor iedereen.** Een PR die een gate wijzigt,
   of een bestaande test aanpast of verwijdert, heeft het label
   `gate-wijziging` nodig. Alleen Bram zet dat, ook voor PR's uit de
   hoofdsessie. Een nieuwe test toevoegen mag zonder label. De paden staan op
   één plek: `.claude/hooks/rolhek.lokaal.json` → `gates`. CI draait de
   bewaker van de basisbranch.
3. **Eén bron per feit.**
   - De gate-beschrijvingen staan in `scripts/kit/gates.mjs`.
   - Feiten komen live uit `scripts/kit/feiten.mjs` en
     `scripts/kit/catalogus.mjs`.
   - `check:docs` faalt als een backtick-identifier in een stuurbestand niet
     bestaat, als een statuswoord niet in de woordenlijst staat, of als
     register en `check:all` uiteenlopen.
   - CI draait `check:fast` + `check:slow` (= `check:all`).
4. **Statuswoorden.** ADR's en specs gebruiken alleen
   `voorstel | goedgekeurd | gebouwd | vervallen`.
5. **Ratchet.** Bestaande schuld mag alleen dalen:
   - ESLint-suppressies in `eslint-suppressions.json`;
   - andere lijsten in `.kit/baseline.json`.

   Een daling moet vastgelegd worden, zodat de schuld niet terugkomt.
6. **Strikte typing.**
   - typescript-eslint `strictTypeChecked` (exact gepind) met
     `switch-exhaustiveness-check`.
   - `noUncheckedIndexedAccess` op productiecode. Tests typechecken via
     `tsconfig.tests.json` zonder die regel: een assertie op `rows[0].x` faalt
     daar al hard.
   - ESLint CLI in plaats van `next lint`.
7. **UI-lint.** `better-tailwindcss` meldt onbekende klassen, arbitrary
   values en `!`. Rauwe `<button>`/`<input>` en losse laadteksten in features
   en shells zijn verboden. Sinds de v4-migratie (#185) leest de lint het
   thema via `entryPoint` (`src/app/globals.css`).
8. **Append-only migraties.** `check:migrations` faalt als een migratie die op
   `origin/main` staat gewijzigd of verwijderd wordt.
9. **Expliciete grants.** Nieuwe tabellen en functies krijgen in de migratie
   expliciet hun rechten, omdat het gehoste project vanaf 2026-10-30 geen
   automatische grants meer geeft. `auto_expose_new_tables = false` in
   `supabase/config.toml` bootst dat lokaal en in CI na (#187). Migratie 0044
   legt de rechten vast die bestaande objecten in productie al via de oude
   standaardrechten hadden, afgeleid met `scripts/kit/api-rechten.sql`.
10. **Geldregel geherformuleerd.** "De client stuurt nooit een bedrag dat de
    server gebruikt." Een weergavesubtotaal mag; het bevestigde totaal komt uit
    de RPC. De typetest op geld-`Args` volgt in fase 2.
11. **Beveiligingsscans.**
    - osv-scanner en betterleaks op elke PR. Ze zijn adviserend tot Bram ze
      verplicht maakt.
    - Dependabot wekelijks.
    - CodeQL is klaargezet maar staat uit: de repo is privé zonder Code
      Security.
12. **Productie alleen via `release.yml`.** `vercel.json` zet de
    Git-autodeploy voor `main` uit. Previews blijven.

## Richting — besloten, nog niet gebouwd

Elk punt komt via een eigen spec. Tot die er is, volgt nieuwe code het
bestaande patroon (`.claude/rules/` noemt deze punten expliciet als "nog niet
gebouwd").

| # | Besluit | Gevolg |
|---|---|---|
| R1 | **Apart `api`-schema** (route b): alleen `api` wordt blootgesteld en de tabellen zijn onzichtbaar voor de Data API. | Read-RPC's eerst (22 bestanden met `.from()`), daarna `schemas = ["api"]` en `db: { schema: "api" }`. |
| R2 | **TanStack Query** voor lezen, sleutels en invalidatie, op één getypte ingang `src/lib/rpc/`. | Gegenereerde `Database`-types met een driftgate; hookfabrieken; 62 hooks migreren. |
| R3 | **T12 teruggedraaid**: er komen `Knop`, `Toets`, `Tegel` en `Chip` met een variantobject. `className` alleen voor layout, bewaakt met lint. | Lintregel tegen kleur-, maat- en radiusklassen in `className` op deze componenten. Gebouwd in #198 en #199 voor `Knop`, `Chip`, `Segment` en `Toets`; `Tegel` is niet gebouwd. |
| R4 | **Tailwind v4**: de bartablets voldoen aan Safari 16.4+, Chrome 111+ en Firefox 128+. | Migratie met gereset thema (`--*: initial`), focusring nalopen, lint naar `entryPoint`. Gebouwd: de migratie in #185, het gereset thema met de tokenschaal in #197 (roadmap fase 3, stap 2). |
| R5 | **`density` bepaalt de controlmaat**: comfortable 52px (bar), compact 44px (portal). `tone` wordt een variant. | **Herzien door [ADR 0026](0026-controlmaat-per-rol.md)**: de maat volgt de rol (`maat="normaal"` of `"groot"`), `density` bepaalt hem niet. |
| R6 | **`search_path = ''` overal**, direct, met volledig gekwalificeerde namen. | Eén migratie herdefinieert elke functie. Daarna eist `rpc_catalogus` `''` en accepteert het `public` niet meer. Geldfuncties krijgen extra testaandacht. |
| R7 | **pgTAP-helpers in een `tests`-schema via `seed.sql`**, niet in productie. | Eerst verifiëren dat seed buiten `db push` blijft (CLI 2.118). Daarna `act_as_bar` (16×) vervangen. |
| R8 | **Limieten via `get_limits()`**: de server is de enige bron. Bram liet de keuze aan "wat het beste is voor het framework". Dit is de enige vorm die werkt voor de door de beheerder ingestelde negatieflimiet. | `TOP_UP_MAX_CENTS` en vergelijkbare constanten verdwijnen uit TS. |
| R9 | **Raamwerk vendoren**, geen plugin. Bram heeft een persoonlijk account, dus synced plugins vallen af. | Extractie naar een `stack-rails`-repo bij het tweede project, met `sync` en `check:kit`. |
| R10 | **Typetest op geld-`Args`**: geen `*_cents` in de argumenten van een geld-RPC, behalve `top_up_once.amount_cents`. | Komt met de gegenereerde types (R2). |

## Gevolgen

- Een agent kan zijn eigen gates niet stil verzwakken. Lokaal houdt het
  rolhek dat tegen, in CI de diff-guard met de bewaker van de basis, en op
  GitHub de branch protection (zie de checklist in
  [`docs/operations/rails-checklist.md`](../operations/rails-checklist.md)).
- Elke nieuwe regel geldt vanaf dag één voor nieuwe code. Bestaande schuld
  staat zichtbaar in twee bestanden en daalt alleen.
- PR's die alleen rails raken, dragen het label. Featurewerk met nieuwe tests
  niet.
- De rolprompts bevatten geen repofeiten meer. Wie een feit zoekt, draait
  `node scripts/kit/feiten.mjs`.

## Restrisico

- Het rolhek matcht tekst. `bash -c '…'` of `node -e` kan eromheen. Dat vangen
  de diff-guard en de CI, niet de hook.
- CODEOWNERS en verplichte checks werken pas als Bram ze in GitHub aanzet.
- betterleaks en osv-scanner zijn nooit tegen deze repo gedraaid vóór de
  eerste CI-run van PR #184. Een bevinding in oude history is mogelijk.

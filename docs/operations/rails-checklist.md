# Checklist — instellingen buiten de repo (ADR 0025)

Status: **goedgekeurd**

Deze instellingen zijn vanuit de clone niet te zien of te zetten. De
vastgestelde toestand is op 2026-10-07 read-only gecontroleerd via de
Supabase- en Vercel-koppeling. Vink af in de PR die dit bestand bijwerkt.

## GitHub (repo → Settings)

- [ ] **Actions draait niet.** Sinds 2026-10-06 falen alle workflowruns na 2–3 s
  zonder logs, ook op `main` (#182 en #183 zijn met rode CI gemerged). Controleer
  Settings → Billing → Actions (minuten, spending limit, betaalmethode).
- [ ] **Label** `gate-wijziging` aanmaken (Issues → Labels) en op PR #184 zetten.
- [ ] **Branch protection / ruleset op `main`:**
  - [ ] PR verplicht, geen directe push, geen force-push
  - [ ] Verplichte checks: `check-all` (CI) en `diff-guard`. Later ook `osv-scanner` en `betterleaks`, zodra die groen zijn.
  - [ ] "Require review from Code Owners". Let op: als Bram zowel eigenaar als PR-auteur is, kan GitHub hem niet als reviewer laten goedkeuren. Kies daarom voor een bypass voor de eigenaar, of laat agents PR's openen onder een eigen account.
- [ ] **Secrets voor `release.yml`:** `VERCEL_TOKEN` (secret), `VERCEL_ORG_ID` en `VERCEL_PROJECT_ID` (variables), en een environment `production`. Productie-deploys lopen nu alleen nog via deze workflow.
- [ ] **Dependabot alerts** aan (gratis, ook op private repo's).

## Supabase (project `ABAS`, `zlyysbywrvaolpslcbid`)

Vastgesteld 2026-10-07:

- Productie staat op migratie **`0040`**. `0041`, `0042` en `0043` ontbreken.
- `place_order(uuid,uuid,jsonb,uuid)` en `top_up(uuid,uuid,integer,text,uuid)`: `authenticated` heeft EXECUTE, `anon` niet; `search_path=public`.
- Voorwaarde-queries ADR 0023 / `docs/features/tabelrechten-api-rollen.md`:
  1. ACL's van `storage.objects`/`storage.buckets`: `postgres=a*r*w*d*D*x*t*m*/supabase_storage_admin` (met grant option). Klopt; `m` is MAINTAIN (PG17).
  2. `has_table_privilege('postgres','storage.objects','TRIGGER')` = `true`. Klopt.
  3. Default ACL in `public` voor `postgres`: `anon`/`authenticated` `arwdDxtm`. Klopt; er is daarnaast een rij voor `supabase_admin`.
  4. Drie rijen (`buckets`, `buckets_analytics`, `objects`), alle `postgres_trigger = true`. Klopt.

Te doen:

- [ ] `supabase db push` voor `0041`–`0044`. Daarna de Release-workflow draaien.
- [ ] Settings → API Keys: bevestig dat Vercel `sb_publishable_…` en `sb_secret_…` gebruikt. Daarna de legacy JWT-sleutels uitzetten. De namen in Vercel zijn al de nieuwe; de waarden zijn niet gecontroleerd (de secret is "sensitive").
- [x] Roadmap 0.1a: `auto_expose_new_tables = false` met expliciete grants (#187, migratie 0044).
- [ ] Na 2026-10-30: de sleutel `auto_expose_new_tables` weghalen als de CLI hem niet meer kent.

## Vercel (project `abas`)

Vastgesteld 2026-10-07:

- Productie serveert `0cfbb56` (PR #173). De vijf productie-deploys sinds #162 faalden op `check:deployment` ("missing or incompatible RPC inspect_money_request; … place_order_once; … top_up_once; … create_member_once"), omdat de database op `0040` staat.
- Elke PR-preview faalt op `check:deployment` ("preview must use a separate Supabase project"). Dat is een bestaande guard: er is geen Supabase-project voor de Vercel-omgeving Preview.
- De Git-koppeling deployde `main` automatisch naar productie. `vercel.json` zet dat nu uit (`git.deploymentEnabled.main = false`); previews blijven.
- SSO-bescherming staat aan op alle deployments behalve custom domains.

Te doen:

- [ ] Na merge van PR #184: controleer dat een push naar `main` geen productiedeploy meer start.
- [ ] Optioneel: Deployment Checks koppelen aan de GitHub-check `check-all`.
- [ ] Previews: een apart Supabase-project (of een Supabase-branch) aan de Vercel-omgeving Preview hangen, of previews uitzetten. Nu is elke preview rood.

## Claude Code

- [ ] Draai in een lokale sessie `/hooks` en controleer dat `rolhek` en `groen-voor-klaar` geladen zijn. Of projecthooks voor subagents in cloudsessies draaien (afhankelijk van trust), is niet geverifieerd.

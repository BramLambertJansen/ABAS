# ABAS — Aurora Bar Automatiserings Systeem

Bar-app voor muziekvereniging Aurora (Driebergen-Rijsenburg): saldobeheer,
bestellingen en bardienstbeheer voor leden, bardienst en beheerder. Eén
Next.js-app, twee shells — `shells/bar` (tablet/desktop, bardienst en
beheerder) en `shells/portal` (telefoon-first, leden).

## Beginpunten

- **`CLAUDE.md`** — de regels: domeinmodel, architectuurbeslissingen (geld
  alleen via RPC, attributie via bezetting), gates die elke commit moet
  doorstaan.
- **`docs/ARCHITECTURE.md`** — het levende document erachter: wat er gebouwd
  is, wat nog open staat, waarom.
- **`docs/features/`** — featurespecs, randgevallen en testplannen voor de
  gebouwde bar-, beheer- en portalfunctionaliteit.
- **[Platformrunbook](docs/operations/platform-runbook.md)** — actuele
  omgevingen, migraties, uitrollen, rollback, backups en open beheeracties.
- **`/designs/`** — de Claude Design-export (klik-prototype, geen
  productiecode) die de eerste bouw van een scherm bepaalt. Ook live te
  bekijken in de draaiende app op `/design`. Zie `designs/README.md` en
  `docs/ARCHITECTURE.md` → Bronmateriaal.

## Development

Gebruik Node.js 24 (`nvm use` leest `.nvmrc`), Docker en Supabase CLI
2.118.0 (de versie uit CI). Ontwikkel tegen de lokale database.

```bash
npm ci
supabase start
cp .env.example .env.local   # vul in, of gebruik `supabase start`'s output
npm run dev
```

De lokale stack wordt gevuld met testaccounts uit `supabase/seed.sql`.
De variabelen en het onderscheid tussen publieke en geheime keys staan in
[.env.example](.env.example).

De pre-commit hook draait `npm run check:fast` (lint, typecheck, unittests,
architectuur-/policy-/RLS-gates — geen database nodig). CI draait op elke PR
de volledige `npm run check:all` (plus build, a11y, db-tests) en is de gate
vóór merge. Lokaal `check:all` draaien kan met `supabase start`, maar is niet
verplicht. Zie `CLAUDE.md` → Verificatie voor wat elke gate bewaakt.

Vercel draait `npm run check:deployment` vóór de build: een read-only controle
van noodzakelijke databasekolommen en RPC-signaturen. Deze vervangt geen
volledige CI of controle van de migratiegeschiedenis. CI moet groen zijn vóór
merge; GitHub handhaaft dat momenteel niet op de private `main`-branch.

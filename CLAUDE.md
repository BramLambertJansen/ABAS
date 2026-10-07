# CLAUDE.md — ABAS

Aurora Bar Automatiserings Systeem, voor muziekvereniging Aurora
(Driebergen-Rijsenburg). Eén app, twee shells: `src/shells/bar` en `src/shells/portal`.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase. Layout in
`docs/ARCHITECTURE.md`; `docs/features/` bevat specs die Bram goedkeurt vóór
de Developer bouwt.

**Regel over regels:** wat een gate kan afdwingen staat hier niet. Dit document
bevat alleen wat een script niet kan controleren. Groeit het voorbij ~100
regels, dan is dat een signaal dat er een gate ontbreekt — geen reden om door
te schrijven. Padspecifieke conventies staan in `.claude/rules/`.

## Verificatie en rails

`node scripts/kit/feiten.mjs` toont de gates en wat ze bewaken, de
RPC-catalogus, de ADR's met status en de afgedwongen conventies. Dat is de
bron, niet dit document (ADR 0025).

CI draait `npm run check:all` op elke PR en moet groen zijn vóór merge; CI
draait alleen op PR's, dus open bij de eerste push meteen een PR. De
pre-commit hook draait `check:fast`; omzeilen kan niet en mag niet.
Bekende schuld staat in een ratchet: tellers mogen alleen dalen.

Een PR die een gate wijzigt of een bestaande test aanpast of verwijdert
(paden: `.claude/hooks/rolhek.lokaal.json` → gates) krijgt het label
`gate-wijziging`; alleen Bram zet dat, ook voor de hoofdsessie. Een nieuwe
test toevoegen mag zonder label. Het
rolhek (`.claude/hooks/rolhek.mjs`) begrenst per rol wat een agent mag
schrijven; de echte grens is branch protection.

Reviewwerk, geen gate: dat `served_by` tegen de bezetting gecontroleerd wordt
bewijzen de tests in `supabase/tests/`, maar of een nieuwe geld-RPC dat ook
doet, leest de Reviewer.

## Domein

- **Lid** — ziet eigen saldo en transacties. Verder niets.
- **Bardienst** — bedient leden, plaatst bestellingen. Ziet saldi om te kunnen
  waarschuwen bij een laag tegoed.
- **Beheerder** — superset van bardienst, plus prijzen, ledenbeheer, design
  system. Geen los adminscherm: beheerder werkt binnen `src/shells/bar`.

Saldo is prepaid. Negatief mag, tot een systeembrede limiet die de beheerder
instelt (€0 kan, als keuze). "Laag saldo" is systeembreed €10.
Prijswijzigingen raken historie niet: `order_lines.unit_cents` bevriest de
prijs.

**Opwaarderen (MVP):** alleen contant, door bardienst, met dezelfde
bezettings-attributie als bestellen en nooit naar het lid van de ingelogde
sessie (A4). Maximaal €500, boven €100 eerst bevestigen — er is geen
saldocorrectie in de app. Online opwaarderen (iDEAL) is een latere fase: een
betaalprovider-webhook krijgt dan een eigen RPC, zonder die €500 (een
kassa-guard, geen eigenschap van de tabel).

**Terugdraaien:** alleen een hele bestelling, met reden — op de bar tijdens
de dienst (bezettings-attributie, alleen die dienst), in beheer elke
bestelling. Telt daarna niet als omzet. Zie
`docs/features/bestelling-terugdraaien.md`.

**Dienst & bezetting.** Wie een dienst start, logt persoonlijk in vanaf de
namenlijst en stelt de bezetting samen — leden die meewerken zonder zelf in
te loggen. De dienst hoort bij die sessie (ADR 0016).

## Architectuurbeslissingen

**Geld beweegt alleen via RPC.** De server bepaalt het bedrag, controleert
saldo (inclusief de negatieflimiet) en schrijft de transactie in één
statement; de app gebruikt de `*_once`-varianten met een request-UUID
(ADR 0024). **De client stuurt nooit een bedrag dat de server gebruikt** —
alleen ids, aantallen of een opwaardeerbedrag. Een subtotaal ter weergave mag;
het bevestigde totaal komt uit de RPC-response.

**`served_by` komt uit de bezetting, niet uit een PIN.** De client stuurt
welk lid uit de actieve bezetting de bestelling afrondde; de RPC verwerpt elk
ander lid. Dat blokkeert attributie aan iemand die niet op dienst staat, maar
bewijst niet wélke aanwezige het scherm bediende — bewust losgelaten voor de
snelheid van geen-PIN-per-rondje.

**Hergebruik eerst.** Voor een nieuw component of een nieuwe hook: eerst
zoeken in `src/components` en `src/hooks` (`node scripts/kit/catalogus.mjs`).
Duplicatie van bestaande UI of logica is een reviewfout, geen stijlkeuze.

## Auth

Portal: magic link of wachtwoord. Bardienst/beheerder: altijd een wachtwoord,
PIN alleen als optionele snelkoppeling voor bar-modus. Beheer eist aal2. Details
in `.claude/rules/auth.md` en ADR 0002/0003/0005/0012/0016/0017.

## Werkstraat

Vijf rollen in `.claude/agents/`: Architect → Developer → Tester → Reviewer →
Docs. Schrijven blijft enkelvoudig: de Developer schrijft code, de Tester
alleen tests, de rest leest of schrijft docs. Mergen doet Bram.

Geen enkele agent verzint een antwoord bij ontbrekende informatie. Ontbreekt
een beslissing (schaal, bedrag, tekst, gedrag bij een edge case) — de agent
stelt de vraag aan Bram en wacht, in plaats van een aanname te kiezen en door
te bouwen.

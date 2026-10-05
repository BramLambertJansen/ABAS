# CLAUDE.md — ABAS

Aurora Bar Automatiserings Systeem, voor muziekvereniging Aurora
(Driebergen-Rijsenburg). Eén app, twee shells: `shells/bar` en `shells/portal`.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase. Layout in
`docs/ARCHITECTURE.md`; `docs/features/` bevat specs die Bram goedkeurt vóór
de Developer bouwt.

**Regel over regels:** wat een gate kan afdwingen staat hier niet. Dit document
bevat alleen wat een script niet kan controleren. Groeit het voorbij ~100
regels, dan is dat een signaal dat er een gate ontbreekt — geen reden om door
te schrijven.

## Verificatie

CI draait `npm run check:all` op elke PR en moet groen zijn vóór merge; CI
draait op PR's en pushes naar main; open bij de eerste push meteen een PR. De
pre-commit hook draait `check:fast` (alles zonder database); `build`,
`check:a11y` en `db:test` laten we aan CI over.

| Gate | Bewaakt |
|---|---|
| `check:arch` | shells geïsoleerd, features shell-onwetend, Supabase-client privé, server-only modules nooit bereikbaar vanuit client-code, ook niet indirect |
| `check:policy` | geen queries of storage-aanroepen buiten de datalaag, geen device-sniffing, geen kale `console.error` in `src/hooks/queries/` (fouten via `src/lib/clientErrors.ts`) |
| `check:rls` | elke tabel RLS, elke policy een negatieve test, geldtabellen REVOKED, elke bucket een type- en groottelimiet, elke storage-policy een negatieve test |
| `check:a11y` | WCAG-AA (axe-core, elk shell-entrypoint) + `eslint-plugin-jsx-a11y`, `lint` faalt op warnings |
| `test` | de pure client-logica (`src/lib/money.ts`, mandjelogica), contrast van de accent-tokens |
| `db:test` | de negatieve tests zelf, tegen een echte database; plus `rpc_catalogus`: elke functie in `public` ingedeeld als client/server/intern met de bijpassende rechten, elke client-RPC via een `require_*`-guard, `search_path` op elke security definer; plus `rls_leespolicies`: leespolicies zijn een allowlist (geen `not caller_…`-tak, `using (true)` alleen op de vaste globale tabellen) |

Reviewwerk, geen gate: dat de client nooit een bedrag berekent (niet
betrouwbaar uit broncode te lezen). Dat `served_by` tegen de bezetting
gecontroleerd wordt, bewijzen de tests in `supabase/tests/`.

## Domein

- **Lid** — ziet eigen saldo en transacties. Verder niets.
- **Bardienst** — bedient leden, plaatst bestellingen. Ziet saldi om te kunnen
  waarschuwen bij een laag tegoed.
- **Beheerder** — superset van bardienst, plus prijzen, ledenbeheer, design
  system. Geen los adminscherm: beheerder werkt binnen `shells/bar`.

Saldo is prepaid. Negatief mag, tot een systeembrede limiet die de beheerder
instelt (€0 kan, als keuze). "Laag saldo" is systeembreed €10.
Prijswijzigingen raken historie niet: `order_lines.unit_cents` bevriest de
prijs.

**Opwaarderen (MVP):** alleen contant, door bardienst, met dezelfde
bezettings-attributie als `place_order` en nooit naar het lid van de
ingelogde sessie (A4). Maximaal €500, boven €100 eerst bevestigen — er is
geen saldocorrectie in de app. Online opwaarderen (iDEAL) is een latere fase:
een betaalprovider-webhook moet er dan naast kunnen via een eigen RPC, zonder
die €500 (een kassa-guard, geen eigenschap van de tabel).

**Terugdraaien:** alleen een hele bestelling, met reden — op de bar tijdens
de dienst (bezettings-attributie, alleen die dienst), in beheer elke
bestelling. Telt daarna niet als omzet. Zie
`docs/features/bestelling-terugdraaien.md`.

**Dienst & bezetting.** Wie een dienst start, logt persoonlijk in vanaf de
namenlijst en stelt de bezetting samen — leden die meewerken zonder zelf in
te loggen. De dienst hoort bij die sessie (ADR 0016).

## Architectuurbeslissingen

**Geld beweegt alleen via RPC.** `place_order` en `top_up` bepalen bedrag,
controleren saldo (inclusief de ingestelde negatieflimiet) en schrijven de
transactie in één statement; `reverse_order_at_bar`/`reverse_order_as_admin`
boeken `orders.total_cents` terug. De client stuurt alleen ids, aantallen of
een opwaardeerbedrag mee — nooit een berekend totaal.

**`served_by` komt uit de bezetting, niet uit een PIN.** De client stuurt
welk lid uit de actieve bezetting de bestelling afrondde; de RPC verwerpt elk
ander lid. Bewust: dat blokkeert attributie aan iemand die niet op dienst
staat, maar bewijst niet wélke aanwezige het scherm bediende — losgelaten
voor de snelheid van geen-PIN-per-rondje.

**Componenten zijn herbruikbaar totdat bewezen anders.** Voor een nieuw
component geschreven wordt: eerst zoeken of het al bestaat in
`src/components`. Duplicatie van bestaande UI of logica is een reviewfout, geen
stijlkeuze.

## Shells

`shells/bar`: tablet/desktop, nooit telefoon (supportuitspraak, geen grens
die de app afdwingt), installable als PWA — geen offline, geen
service-worker caching, bewust uitgesteld. `shells/portal`: telefoon-first,
ook bruikbaar op desktop. Schermen lezen verschillen via `useShell()`
(`density`, `overlay`, `columns`).

## Auth

Zie ADR 0002/0003/0005/0012/0016/0017 (`docs/adr/`); de kern:

- **Portal** (elke rol met een gekoppeld lid): e-mail met magic link of
  wachtwoord.
- **Bardienst/beheerder** hebben altijd een wachtwoord. Een PIN is een
  optionele snelkoppeling (aan/uit in de portal), alleen voor bar-modus, op
  een apparaat waar het lid eerder met het wachtwoord inlogde, met lockout.
  Alleen-PIN is de enige verboden staat.
- **Modi**: na een e-maillogin op `/beheer` kies je bar óf beheer — losse
  sessies, overstappen is uitloggen, geen wisselknop. Bar-modus kan ook
  vanaf de namenlijst (PIN of wachtwoord).
- **Beheer** eist een sessie in modus beheer met tweede factor (TOTP, aal2,
  in te stellen in de portal), server-side afgedwongen. Een PIN-login geeft
  zonder tweede factor nooit beheer.

## Designbestanden

De Claude Design-export in `/designs/` (`Bar App.dc.html`, `Lid App.dc.html`,
toelichting in `designs/README.md` en `designs/chats/`; live te zien op
`/design`) bepaalt UX en visueel ontwerp van de eerste bouw van een scherm,
niet de technische structuur. Daarna is het in-app design system de waarheid;
afwijking van de wireframe is normale evolutie, geen defect. Alleen de
nieuwste versie staat in de repo.

## Werkstraat

Vijf rollen, elk een system prompt in `.claude/agents/`: Architect →
Developer → Reviewer (merge gate) → Tester → Docs. Rolbeschrijvingen staan
daar, niet hier.

Geen enkele agent verzint een antwoord bij ontbrekende informatie. Ontbreekt
een beslissing (schaal, bedrag, tekst, gedrag bij een edge case) — de agent
stelt de vraag aan Bram en wacht, in plaats van een aanname te kiezen en door
te bouwen.

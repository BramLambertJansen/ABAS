# CLAUDE.md — ABAS

Aurora Bar Automatiserings Systeem, voor muziekvereniging Aurora
(Driebergen-Rijsenburg). Eén app, twee shells: `shells/bar` en `shells/portal`.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase. Zie
`docs/ARCHITECTURE.md` voor de layout en `docs/features/` voor goedgekeurde
feature-specs — geschreven en door Bram goedgekeurd vóór de Developer bouwt,
zie Werkstraat hieronder, niet achteraf opgestelde documentatie.

**Regel over regels:** wat een gate kan afdwingen staat hier niet. Dit document
bevat alleen wat een script niet kan controleren. Groeit het voorbij ~100
regels, dan is dat een signaal dat er een gate ontbreekt — geen reden om door
te schrijven.

## Verificatie

CI is de gate: `npm run check:all` draait op elke PR en moet groen zijn vóór
merge. Werkwijze: committen, pushen, PR, en fixen wat CI rood maakt. De
pre-commit hook draait alleen `check:fast` (alles zonder database: lint,
typecheck, `test` en de `check:*`-scripts behalve `check:a11y`) — `build`, `check:a11y` en
`db:test` hebben een draaiende Supabase nodig en laten we aan CI over. CI
draait alleen op PR's: bij de eerste push van een branch meteen een PR openen,
bestaat die al dan alleen committen en pushen.

| Gate | Bewaakt |
|---|---|
| `check:arch` | shells geïsoleerd, features shell-onwetend, Supabase-client privé, service-role-client nooit vanuit client-code |
| `check:policy` | geen queries buiten de datalaag, geen device-sniffing, geen kale `console.error` in `src/hooks/queries/` (fouten via `src/lib/clientErrors.ts`) |
| `check:rls` | elke tabel RLS, elke policy een negatieve test, geldtabellen REVOKED |
| `check:a11y` | WCAG-AA (axe-core, elk shell-entrypoint) + `eslint-plugin-jsx-a11y`, `lint` faalt op warnings |
| `test` | de pure client-logica (`src/lib/money.ts`, mandjelogica), contrast van de accent-tokens |
| `db:test` | de negatieve tests zelf, tegen een echte database |

Wat géén gate afdwingt, en dus reviewwerk blijft: dat de client nooit een
bedrag berekent, en dat `served_by` serverside tegen de actieve bezetting
gecontroleerd wordt. Het eerste is niet betrouwbaar uit broncode te lezen,
het tweede is een database-eigenschap — `supabase/tests/` bewijst het, geen
scanner. Beide stonden hier tot 2026-09-21 als `check:policy`-regel vermeld
terwijl dat script ze nooit heeft gecontroleerd; de regels zelf staan waar
ze horen, onder Architectuurbeslissingen.

## Domein

- **Lid** — ziet eigen saldo en transacties. Verder niets.
- **Bardienst** — bedient leden, plaatst bestellingen. Ziet saldi om te kunnen
  waarschuwen bij een laag tegoed.
- **Beheerder** — superset van bardienst, plus prijzen, ledenbeheer, design
  system. Geen los adminscherm: beheerder werkt binnen `shells/bar`.

Saldo is prepaid. Negatief saldo mag, tot een limiet die de beheerder instelt
(systeembreed, niet per lid) — die limiet kan ook op €0 staan, wat neerkomt op
nooit negatief, maar "nooit" is dan een gekozen instelling, geen harde regel.
Drempel voor de "laag saldo"-waarschuwing is €10, systeembreed, geen instelling
per lid.

Prijswijzigingen raken historie niet. `order_lines.unit_cents` bevriest de
prijs op het moment van bestellen.

**Opwaarderen (MVP):** alleen contant, door bardienst, met dezelfde
bezettings-attributie als `place_order` (zie hieronder) en nooit naar het lid
van de ingelogde sessie (A4) — `top_up` is een RPC, geen tabel-write. Maximaal €500 per opwaardering, boven €100 vraagt de app
eerst om bevestiging: er is geen saldocorrectie in de app, dus een typefout is
alleen met directe databasetoegang terug te draaien. Online opwaarderen
(iDEAL, vanuit de portal) is een latere fase; de RPC-grens moet nu al zo staan
dat een betaalprovider-webhook er later naast kan zonder het patroon (geld
alleen via RPC) te breken — en zonder die €500, die een kassa-guard is en geen
eigenschap van de tabel.

**Terugdraaien:** alleen een hele bestelling, met reden — op de bar tijdens
de dienst (bezettings-attributie, alleen die dienst), in beheer elke
bestelling. Telt daarna niet als omzet. Zie
`docs/features/bestelling-terugdraaien.md`.

**Dienst & bezetting.** Wie een dienst start, logt eerst persoonlijk in vanaf
de namenlijst (PIN op een vertrouwd apparaat, of wachtwoord) en stelt daarna
de bezetting samen — andere leden die meewerken, zonder dat zij zelf inloggen.
De dienst hoort bij die sessie (ADR 0016). Zie Architectuurbeslissingen voor
hoe attributie daaruit werkt.

## Architectuurbeslissingen

**Geld beweegt alleen via RPC.** `place_order` en `top_up` bepalen bedrag,
controleren saldo (inclusief de ingestelde negatieflimiet) en schrijven de
transactie in één statement; `reverse_order_at_bar`/`reverse_order_as_admin`
boeken `orders.total_cents` terug. De client stuurt alleen ids, aantallen of
een opwaardeerbedrag mee — nooit een berekend totaal. Die RPC's
zijn uitsluitend uitvoerbaar voor `authenticated`, en eisen daarbovenop een
geregistreerde bar-sessie die aan de dienst gekoppeld is; interne functies
(`verify_bar_pin`, de guards, de cron-job) zijn voor geen enkele API-rol
uitvoerbaar, of alleen voor `service_role`.

**`served_by` komt uit de bezetting, niet uit een PIN.** Eén persoonlijke sessie per
apparaat, wisselende medewerkers via de bezetting. De client stuurt welk lid uit de
actieve bezetting de bestelling afrondde; de RPC accepteert alleen een
`served_by` die daadwerkelijk in die bezetting staat, en verwerpt al het
andere. Dat is een bewuste keuze: sterk genoeg om attributie aan iemand die
niet op dienst staat te blokkeren, niet sterk genoeg om te bewijzen wélke
aanwezige het scherm bediende — die garantie is losgelaten voor de snelheid
van geen-PIN-per-rondje. Het starten van een dienst gebeurt in de persoonlijke sessie van de starter,
na een login met PIN of wachtwoord.

**Componenten zijn herbruikbaar totdat bewezen anders.** Voor een nieuw
component geschreven wordt: eerst zoeken of het al bestaat in
`src/components`. Duplicatie van bestaande UI of logica is een reviewfout, geen
stijlkeuze.

## Shells

`shells/bar` (tablet/desktop — nooit telefoon, geen fallback, geen
ondersteuning; dat is een supportuitspraak, geen grens die de app afdwingt) en `shells/portal` (telefoon-first, ook bruikbaar op desktop).
Schermen in `features/` weten niet in welke shell ze draaien; ze lezen
capabilities via `useShell()` — `density`, `overlay`, `columns`.

`shells/bar` is installable als PWA (manifest + icons). Geen offline-eisen,
geen service-worker caching — dat is bewust uitgesteld, geen vergeten scope.

## Auth

Portal (elke rol met een gekoppeld lid, `docs/adr/0012-portal-eigen-data-voor-elke-rol.md`): inloggen met e-mail, magic link of wachtwoord, beide actief.
Voor bardienst/beheerder is **e-mail/wachtwoord verplicht**; een PIN is een
optionele snelkoppeling daarbovenop, die het lid zelf aan- of uitzet via de
portal. De PIN is een login voor bar-modus op een apparaat waar het lid eerder
met het wachtwoord inlogde, met lockout. Het wachtwoord blijft altijd werken;
de enige verboden staat is alleen-PIN (ADR 0005, geamendeerd door ADR 0016). Na een e-maillogin op `/beheer` (niet op de portal) volgt
een **modus-keuze: bar of beheer, niet beide tegelijk**. Modi zijn losse
sessies — overstappen vereist uitloggen, geen wisselknop (ADR 0003). Bar-modus:
vanaf de namenlijst (PIN of wachtwoord), of e-mail → "Bar" in de modus-keuze;
bar-modus is daarna identiek (bezetting/attributie: zie
Architectuurbeslissingen). Beheeracties (assortiment, leden, instellingen)
vragen een sessie in modus beheer met een tweede factor (TOTP, aal2; in te
stellen in de portal, alleen voor beheerders), server-side afgedwongen; een
PIN-login geeft zonder tweede factor nooit beheer — zie ADR
0002/0003/0016/0017 (`docs/adr/`).

## Designbestanden

Wireframes in `/designs/`, alleen de nieuwste versie. Ze bepalen de eerste
bouw van een scherm. Daarna is het in-app design system de waarheid; afwijking
van de wireframe is normale evolutie, geen defect.

Huidige versie: de Claude Design-export in `/designs/` (`Bar App.dc.html`,
`Lid App.dc.html`), met `designs/README.md` en `designs/chats/` als
toelichting op de keuzes erachter. Dat is een klik-prototype (dc-runtime),
geen productiecode — het bepaalt UX en visueel ontwerp, niet de technische
structuur.

Ook in de app zelf te bekijken op `/design` (live van schijf, geen kopie) —
zie `docs/ARCHITECTURE.md` → Bronmateriaal.

## Werkstraat

Vijf rollen, elk een system prompt in `.claude/agents/`: Architect →
Developer → Reviewer (merge gate) → Tester → Docs. Rolbeschrijvingen staan
daar, niet hier.

Geen enkele agent verzint een antwoord bij ontbrekende informatie. Ontbreekt
een beslissing (schaal, bedrag, tekst, gedrag bij een edge case) — de agent
stelt de vraag aan Bram en wacht, in plaats van een aanname te kiezen en door
te bouwen.

# 0013 — Accountbestaan is niet geheim op de Supabase Auth-API; de app maskeert alleen haar eigen UI

Status: **concept, wacht op akkoord van Bram.** Hoort bij
[`docs/features/beheer-magic-link-enumeratie.md`](../features/beheer-magic-link-enumeratie.md)
(issue #70). Er is nog niets besloten. Dit ADR beschrijft de aanbevolen
variant (D). Variant C staat eronder, voor het geval Bram daarvoor kiest.
Raakt [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md) alleen
bij variant C. Staat naast ADR
[0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md),
[0008](0008-auth-maillinks-via-token-hash.md) en
[0009](0009-portal-sessie-eigen-cookienaam.md) zonder die te wijzigen.

## Context

Issue #70: de magic link op `/beheer` verraadt of een e-mailadres een
account heeft. #99 maakte de melding in de UI neutraal. Het gedrag lekt
nog steeds, via de statuscode (422 `otp_disabled` of 200), via timing
(SMTP) en via een 429 die alleen een bestaand adres krijgt.

Die signalen komen van GoTrue zelf, niet van onze code:

- `create_user` is een veld in de request body dat de client zelf kiest
  (`@supabase/auth-js`: `create_user: options.shouldCreateUser ?? true`).
- De anon-key is publiek.

Iedereen kan dus `POST /auth/v1/otp` met `create_user: false` sturen, en
dat staat los van wat `/beheer` of `/portal` zelf meestuurt.
`/auth/v1/recover` lekt op dezelfde manier via timing en 429. Zolang de
portal magic-link-login aanbiedt (CLAUDE.md → Auth), blijft dat endpoint
open.

Twee eerdere teksten gingen uit van het tegendeel:

- `portal-login.md` → Besloten door Bram punt 2 ("bij `true` bestaat #70's
  lek voor de portal niet");
- de tekst die #99 zonder akkoord toevoegde ("maskeren in plaats van
  vermijden" als oplossing).

Een volgende feature zou op die aanname kunnen voortbouwen. Daarom dit ADR.

## Beslissing (voorstel, variant D)

1. **Accountbestaan geldt niet als geheim tegenover iemand met de
   anon-key**, zolang het Supabase-project e-mail-OTP of magic link
   aanbiedt. Dit is een aanvaard risico: het verraadt dat een adres een
   account heeft, niet welke rol. Het vraagt wel een expliciet akkoord van
   Bram.
2. **De app vertelt het zelf nooit.** Elk auth-formulier dat een mail laat
   versturen (magic link, wachtwoordherstel) toont bij elke uitkomst
   dezelfde neutrale melding, ook bij een 422 of 429. Dit is het patroon
   van `useWachtwoordResetAanvragen`, `usePortalLogin` en (sinds #99)
   `useBeheerLogin`. Een wachtwoordlogin toont voor een onbekend adres en
   een verkeerd wachtwoord dezelfde fout.
3. **Geen app-side maatregel wordt gepresenteerd als oplossing voor het
   lek.** Maatregelen als `shouldCreateUser`, een server-side proxy of een
   vaste responstijd sluiten het API-orakel niet. Specs en comments
   formuleren het als "de UI toont het niet", niet als "lekt niet".
4. **Het lek echt dichten is een eigen beslissing en een eigen ADR.** Dat
   betekent `/auth/v1/otp` niet meer publiek bruikbaar maken, bijvoorbeeld
   met een eigen magic-link-flow via `auth.admin.generateLink` en
   e-mail-OTP uit. Dat raakt de portal en vervangt een Supabase-functie.

## Variant C (alleen als Bram daarvoor kiest): magic link weg van `/beheer`

Aanvulling op variant D, geen vervanging. `/beheer` biedt alleen nog e-mail
+ wachtwoord (+ "Wachtwoord vergeten?"). Dat amendeert ADR 0002 → Context
("e-mail — magic link of wachtwoord"). ADR 0005 (wachtwoord verplicht voor
bardienst en beheerder) maakt de wachtwoordweg al tot de gegarandeerde
basis. Het API-lek verandert hierdoor niet, want de portal houdt de magic
link. Het gevolg: een uitgenodigd lid zonder wachtwoord (er is geen
instelscherm, #17) komt alleen via de herstelflow binnen.

## Verworpen alternatieven

- **`/beheer` via een server-side route met altijd 200 en een vaste
  responstijd** (spec → optie A). De netwerktab van `/beheer` wordt schoon,
  maar het directe API-orakel blijft bestaan. Daarnaast bundelt het de
  per-IP-rate-limit van GoTrue op het server-IP: één aanvaller blokkeert
  dan de magic link voor iedereen, tenzij er IP-forwarding of een eigen
  limiet komt. Veel mechaniek voor geen winst op het API-oppervlak.
- **`shouldCreateUser: true` op `/beheer` plus een ledenfilter** (spec →
  optie B). Het `create_user: false`-orakel blijft bestaan. Het werkt
  alleen als signup aanstaat, en signup aanzetten opent `/auth/v1/signup`
  voor iedereen. Een weigerende "Before User Created"-hook geeft zelf weer
  een onderscheidbare fout.

## Gevolgen

- **Geen code-wijziging aan gedrag** bij variant D. Wat wel verandert:
  - de comments in `useBeheerLogin.ts` en `usePortalLogin.ts` ("lekt
    nooit", "wachtwoordpad lekt niet");
  - de #99-passages in `portal-login.md` en `wachtwoord-vergeten.md` (spec
    → Documentcorrecties).
- **`portal-login.md` → Besloten door Bram punt 2** houdt zijn besluit,
  maar de motivatie klopt niet meer. Of het besluit blijft staan, beslist
  Bram (spec → Open vraag 3).
- **Geen nieuwe gate.** Een scanner kan niet controleren of een melding
  "neutraal" is. De e2e-tests in `e2e/wachtwoord-vergeten.spec.ts` en
  `e2e/portal-login.spec.ts` leggen de neutrale melding per foutcode al
  vast (422, 429, 500). Nieuwe auth-formulieren volgen dat patroon, en dat
  blijft reviewwerk.
- **`docs/ARCHITECTURE.md`**, na akkoord: een korte regel onder de
  auth-secties, met een verwijzing naar dit ADR. CLAUDE.md verandert niet,
  want dit is een uitwerking en geen nieuwe kernregel.

# Wachtwoord vergeten (`/beheer`)

**Status: gebouwd en gemerged (2026-09-23) —
[PR #69](https://github.com/BramLambertJansen/ABAS/pull/69).** Zie
"Gebouwd vs. gespecificeerd" onderaan voor wat er naast deze spec kwam.
Dashboard-instellingen (hieronder) staan nog bij Bram, ná deploy.

**Oorspronkelijke status: goedgekeurd door Bram (2026-09-23), inclusief minimaal 8
tekens.** Herzien na de review van PR #69 (Bram, 2026-09-23): ook een rate
limit geeft de neutrale melding (Schermflow stap 1); de linkgeldigheid van
1 uur is bevestigd (Email OTP Expiration = 3600); de magic-link-melding
"Open de link in de mail om in te loggen — dat mag ook op een ander
apparaat." is goedgekeurd (hoort bij ADR 0008). Geen open vragen.

Bouwt voort op [ADR 0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)
(de `/beheer`-e-mailsessie vervangt de gedeelde tablet-sessie tot uitloggen),
[ADR 0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
(wachtwoord is altijd vereist voor bardienst/beheerder — dus moet het ook
zonder beheerder te herstellen zijn) en het nieuwe
[ADR 0008](../adr/0008-auth-maillinks-via-token-hash.md) (auth-maillinks
werken apparaat-onafhankelijk via `token_hash`, niet via PKCE).

## Besloten door Bram (2026-09-23)

1. **Waar:** uiteindelijk op `/beheer` én de portal-login; **deze spec
   bouwt alleen `/beheer`.** De portal-login (#15) bestaat nog niet; die
   hergebruikt straks de wachtwoordregels en het herstelscherm uit deze
   spec, zie "Herbruikbaar voor portal en #17".
2. **Na het instellen van een nieuw wachtwoord:** terug naar het
   inlogscherm, opnieuw inloggen — niet direct ingelogd.
3. **Wachtwoordregels, strenger dan de Supabase-standaard:** minimale
   lengte, minstens één kleine letter, één hoofdletter, één cijfer en één
   leesteken.
4. **Geen e-mail-enumeratie:** na het aanvragen altijd dezelfde melding,
   of het adres nu bekend is of niet.

## Onderzocht in /designs/

- `Bar App.dc.html` regel 1418: een "wachtwoord vergeten"-link onder het
  wachtwoordveld, die in het prototype alleen naar de inloglink-methode
  schakelt (`onBarForgot → setBarMethod('link')`). Er is geen
  herstelscherm in het bar-prototype.
- `designs/chats/chat30.md` regel 43 (Lid App): "mailadres → 'check je
  mail' → nieuw wachtwoord → direct ingelogd".
- **Afwijking, bewust:** de plek van de link volgt de Bar App; de flow
  volgt chat30, behalve de laatste stap — Bram koos (punt 2) voor terug
  naar het inlogscherm in plaats van direct ingelogd. Normale evolutie
  t.o.v. de wireframe (CLAUDE.md → Designbestanden), geen defect.

## Doel

Een bardienst- of beheerderlid dat het eigen wachtwoord kwijt is, kan
vanaf het `/beheer`-inlogscherm zelf een nieuw wachtwoord instellen via een
link per mail, zonder dat een beheerder of directe databasetoegang nodig
is.

## Betrokken shell

Alleen `shells/bar`, route `/beheer` en een nieuwe route
`/beheer/wachtwoord-herstellen`. Geen `useShell()`-afhankelijk gedrag: het
formulier is dezelfde enkele kolom als `BeheerLogin.tsx`.

## Geldlaag, datamodel, RPC's

- **Geen geldlaag.** Raakt `place_order`/`top_up` niet.
- **Geen datamodel-wijziging, geen migratie, geen RPC.** Alles loopt via
  Supabase Auth (`resetPasswordForEmail`, `verifyOtp`, `updateUser`,
  `signOut`) — auth-calls, geen `supabase.from()`/`.rpc()`, dus geen
  `check:policy`-/`check:rls`-werk. Ze leven, zoals `useBeheerLogin.ts`,
  in een hook onder `src/hooks/queries/`.

## Wachtwoordregels

- Minimaal **8 tekens**, minstens één kleine
  letter (a–z), één hoofdletter (A–Z), één cijfer (0–9) en één leesteken.
- "Leesteken" = exact de set die Supabase hanteert:
  `` !@#$%^&*()_+-=[]{};':"|<>?,./`~ ``. Dezelfde set client- en
  serverside, zodat de checklist nooit "voldoet" toont voor iets wat
  Supabase daarna weigert.
- **Serverside afgedwongen door Supabase, niet door de client.** Bram zet
  in het dashboard (Authentication → Providers → Email): *Minimum password
  length* = 8 en *Password requirements* = "Lowercase, uppercase letters,
  digits and symbols". Dat geldt dan voor élke wachtwoordwijziging, ook
  straks in de portal en #17. De client-check is alleen UX.
- Pure functie `src/lib/passwordPolicy.ts`: geeft per regel `true/false`
  terug (voor de live checklist) plus één `isValid`. Unit-tests in
  `test/passwordPolicy.test.ts` — valt onder de `test`-gate.
- Bestaande wachtwoorden die niet aan de nieuwe regels voldoen blijven
  werken; Supabase controleert de regels alleen bij het *instellen*.

## Schermflow

### 1. Aanvragen — `BeheerLogin.tsx`

- Onder het wachtwoordveld (alleen zichtbaar bij methode "Wachtwoord"):
  link-knop **"Wachtwoord vergeten?"**.
- Klik → het formulier toont de aanvraagweergave: kop "Wachtwoord
  vergeten", uitleg "Vul je e-mailadres in. Je krijgt een link om een
  nieuw wachtwoord in te stellen.", het e-mailveld (voorgevuld met wat er
  al stond), knop **"Stuur herstellink"** en "← terug naar inloggen".
- Verzenden → `resetPasswordForEmail(email, { redirectTo:
  `${origin}/beheer/wachtwoord-herstellen` })`.
- Daarna, **altijd** (ook bij een onbekend adres, besluit 4):
  "Als er een account bij {email} hoort, hebben we een link gestuurd om een
  nieuw wachtwoord in te stellen. De link is 1 uur geldig." + "← terug naar
  inloggen".
- **Elke fout, ook een rate limit** → dezelfde neutrale melding als
  hierboven, gelogd met `console.error`. *(Herzien, Bram 2026-09-23, na
  Reviewer PR #69: de eerdere uitzondering voor `rate_limited` lekte. GoTrue
  raakt de mail-limiet alleen als er echt gemaild wordt, dus alleen bij een
  bestaand adres; "te veel pogingen" verraadt dan dat het adres een account
  heeft. Nadeel, geaccepteerd: een legitieme gebruiker ziet bij een limiet
  niet waarom er geen mail komt.)*

### 2. De mail

Supabase-template **Reset Password** (dashboard, door Bram — zie
"Dashboard-instellingen"). De link wijst naar
`{{ .SiteURL }}/beheer/wachtwoord-herstellen?token_hash={{ .TokenHash }}&type=recovery`
(ADR 0008: werkt ook als de mail op een ander apparaat geopend wordt).

### 3. Nieuw wachtwoord — `/beheer/wachtwoord-herstellen`

- **Het token wordt pas bij verzenden gebruikt, niet bij het openen van de
  pagina.** Mailscanners (bv. Outlook Safe Links) openen links vooraf; een
  token dat bij een GET al ingewisseld wordt, is dan verbruikt voor de
  gebruiker klikt. De pagina leest `token_hash` en `type` alleen uit de URL.
- Ontbreekt `token_hash` of is `type` niet `recovery` → direct de
  "link ongeldig"-weergave (zie Randgevallen).
- Formulier: kop "Nieuw wachtwoord instellen", velden **Nieuw wachtwoord**
  en **Herhaal wachtwoord** (`autoComplete="new-password"`), daaronder de
  vier regels als live checklist (voldaan / nog niet), knop
  **"Wachtwoord opslaan"** — uitgeschakeld tot alle regels voldaan zijn en
  beide velden gelijk zijn. Ongelijke velden: "de wachtwoorden zijn niet
  gelijk" onder het tweede veld.
- Verzenden:
  1. `verifyOtp({ token_hash, type: "recovery" })` — levert een sessie op
     (vervangt de tablet-sessie, ADR 0002). Overgeslagen als dat in deze
     paginaweergave al gelukt was (zie Randgevallen: tweede poging).
  2. `updateUser({ password })`.
  3. `signOut()`.
  4. Naar `/beheer?wachtwoord=gewijzigd`.
- `BeheerLogin.tsx` toont bij `?wachtwoord=gewijzigd` boven het formulier
  (`role="status"`): **"Je wachtwoord is gewijzigd. Log in met je nieuwe
  wachtwoord."**, met methode "Wachtwoord" voorgeselecteerd.

## Rolzichtbaarheid

- Link en herstelscherm zijn zichtbaar zonder ingelogd te zijn — dat is
  het punt. Wie daadwerkelijk een mail krijgt, bepaalt Supabase: alleen
  adressen met een `auth.users`-rij.
- Een account met rol `lid` (straks portal) kan het wachtwoord hier ook
  herstellen; inloggen op `/beheer` geeft daarna de bestaande
  "denied"-melding van `useBeheerSession.ts`. Geen extra afscherming
  nodig — het herstelt alleen een wachtwoord dat al bestaat.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Link verlopen, al gebruikt of ongeldig (`verifyOtp` faalt, of geen `token_hash`) | "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." + knop naar `/beheer` (aanvraagweergave open). Geen sessie, niets gewijzigd. |
| `verifyOtp` gelukt, `updateUser` faalt | Het token is dan verbruikt, maar de herstelsessie bestaat. Foutmelding onder het formulier; een tweede poging slaat `verifyOtp` over en roept alleen `updateUser` opnieuw aan. |
| `updateUser` weigert op sterkte (`weak_password`) | "Dit wachtwoord voldoet niet aan de eisen." — zou door de checklist niet moeten voorkomen, maar de server is leidend. |
| Nieuw wachtwoord gelijk aan het oude (`same_password`) | "Kies een ander wachtwoord dan je huidige." |
| Gebruiker verlaat de pagina na stap 1 of 2 zonder stap 3 | Een herstelsessie blijft in deze browser staan tot uitloggen, net als na een gewone `/beheer`-login. Geaccepteerd: `useBeheerSession.ts` behandelt die als elke andere e-mailsessie. |
| Mail op de telefoon geopend, aangevraagd op het tablet | Werkt (ADR 0008). De herstelsessie en het uitloggen gebeuren op de telefoon; het tablet blijft ongemoeid. |
| Te veel mails | Supabase's eigen mailverzending laat maar een paar mails per uur toe voor het hele project (magic links, invites en herstel samen). Buiten scope, zie hieronder. De gebruiker ziet de neutrale melding (zie Schermflow stap 1). |

## Dashboard-instellingen (Bram, geen code)

1. **Authentication → Providers → Email:** minimale lengte 8, vereisten
   "Lowercase, uppercase letters, digits and symbols".
2. **Authentication → Emails → Reset Password:** onderwerp "Nieuw
   wachtwoord instellen — Aurora", link zoals in "De mail" hierboven.
3. Pas zetten ná deploy van deze feature — de huidige live-versie kent de
   route nog niet.

## Herbruikbaar voor portal en #17

- `src/lib/passwordPolicy.ts` en het formulier-deel van het herstelscherm
  (twee velden + checklist) komen als component in `src/components/`
  (`NieuwWachtwoordVelden.tsx`), zodat #15 (portal, wachtwoord vergeten)
  en #17 (wachtwoord wijzigen) het hergebruiken in plaats van dupliceren
  (CLAUDE.md → "Componenten zijn herbruikbaar").

## Expliciet buiten scope

- Wachtwoord vergeten in de portal (#15) — volgt, hergebruikt het
  bovenstaande.
- Wachtwoord wijzigen terwijl ingelogd (#17).
- Eigen SMTP-provider om de mail-limiet van Supabase op te heffen.
- Gelekte-wachtwoordcontrole (HaveIBeenPwned) — alleen op een betaald
  Supabase-plan.
- PIN vergeten op het tablet — ander mechanisme.

## Gebouwd vs. gespecificeerd (PR #69, 2026-09-23)

De flow hierboven is gebouwd zoals beschreven. Wat er tijdens de review bij
kwam of anders werd:

- **Rate limit bij aanvragen → neutrale melding.** Besluit van Bram na de
  Reviewer; de spec was al in de PR herzien (Schermflow stap 1).
- **Magic-link-melding** op `/beheer` is nu "Open de link in de mail om in
  te loggen — dat mag ook op een ander apparaat." (goedgekeurd door Bram,
  hoort bij ADR 0008).
- **`/beheer/callback`** accepteert naast `?code=` ook
  `?token_hash=&type=` met `type` = `email`, `magiclink` of `invite`
  (`verifyOtp`). `signup`, `email_change` en `recovery` worden bewust
  niet geaccepteerd — vastgelegd in `test/beheerCallback.test.ts`.
- **`?wachtwoord=gewijzigd`** wordt na het lezen uit de URL gehaald
  (`history.replaceState`), zodat verversen de melding niet opnieuw toont.
- **Focusbeheer (WCAG 2.4.3):** bij wisselen tussen inlog-, aanvraag- en
  verstuurd-weergave verplaatst de focus expliciet naar het nieuwe blok.
- **Herstelscherm, rate limit bij opslaan:** `updateUser` die op een limiet
  stuit geeft de gedeelde "te veel pogingen"-melding; niet in de
  Randgevallen-tabel hierboven genoemd.
- **Gedeelde bouwstenen, niet in de spec genoemd:**
  - `src/components/AuroraMerk.tsx` — logo/kop-blok, gebruikt door
    `BeheerLogin`, `WachtwoordHerstellen`, `ModusKeuze` en `DienstStarten`.
  - `src/lib/authErrors.ts` — `RATE_LIMITED_MESSAGE` en
    `isRateLimitedMessage`, gedeeld door `useBeheerLogin` en
    `useWachtwoordHerstellen`.
  - `src/components/NieuwWachtwoordVelden.tsx` en
    `src/lib/passwordPolicy.ts` zoals gespecificeerd.
- **Tests:** `test/passwordPolicy.test.ts`, `test/beheerCallback.test.ts`
  (met een resolve-hook en fakes in `test/fakes/`),
  `e2e/wachtwoord-vergeten.spec.ts`, en de nieuwe routes in
  `e2e/a11y.spec.ts`.

### Opvolgissues

- [#70](https://github.com/BramLambertJansen/ABAS/issues/70) — de
  magic-link-knop lekt nog of een e-mailadres bestaat.
- [#71](https://github.com/BramLambertJansen/ABAS/issues/71) — a11y-flake
  op de Leden-tab door `transition-colors`.
- [#72](https://github.com/BramLambertJansen/ABAS/issues/72) — focus na
  "Stuur inloglink".
- [#73](https://github.com/BramLambertJansen/ABAS/issues/73) —
  `LidBeherenOverlay` dupliceert de rate-limit-tekst in plaats van
  `authErrors.ts` te gebruiken.

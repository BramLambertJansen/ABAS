# Frontend T01 — persoonlijke sessiegrens

Ticket: [#122](https://github.com/BramLambertJansen/ABAS/issues/122).
Gebouwd bovenop [PR #120](https://github.com/BramLambertJansen/ABAS/pull/120),
basis `fb13014fc9321c718990c6f1b92d3b2c0ab2ca7e`.
Contract: `docs/features/dienst-per-sessie.md`, ADR 0016 en ADR 0017.

## Bevinding en oplossing

PR #120 vervangt de oorspronkelijke lokale modus-keuze en extra PIN bij
dienststart door een persoonlijke, server-geregistreerde sessie. T01 bouwt
daarop voort. Er bleven races bij accountwissels en overlappende reads:

- Een andere ingelogde gebruiker veranderde alleen `signed-in`-gegevens;
  dezelfde provider, schermstatus en `useMijnDienst`-toestand bleven bestaan.
- Een oude ledenlookup of sessiepoll kon na een nieuwer antwoord alsnog de
  vorige identiteit/rol tonen of de nieuwe gebruiker uitloggen.
- Een late modusregistratie kon het bevestigingscookie van de oude sessie
  terugzetten.

De provider krijgt nu een afzonderlijke schermboom per combinatie van
gebruikers-ID en Auth-session-ID. Een tokenverversing of MFA-verificatie
binnen dezelfde sessie behoudt die boom. Reads verwerken alleen het nieuwste
antwoord en worden bij unmount ongeldig. Oude scopes schrijven geen
bevestigingscookie meer. De expliciete namenlijstlogin bevestigt de nieuwe
sessie buiten de oude scope; de afmeldmelding blijft ook buiten de scope
staan zodat de uitleg na uitloggen zichtbaar blijft.

Er zijn geen nieuwe RPC's, policies, migraties of productteksten. Het
architectuurscan-hulpmiddel normaliseert Windows-paden zodat dezelfde
shell-/cookiegrenzen op Windows en Linux worden gecontroleerd.

## Bewijs per acceptatiegebied

| Gebied | Verificatie |
| --- | --- |
| E-mail → Bar → start zonder PIN/andere starter | Nieuwe live T01-test in `e2e/a11y.spec.ts`: Sanne heeft geen PIN; de echte `start_shift` ontvangt uitsluitend het activiteittype en `my_bar_state` noemt Sanne als starter. |
| Refresh en teruggaan naar beheer | Dezelfde live test herlaadt de bar en bezoekt `/beheer`; de geregistreerde bar-modus stuurt terug naar `/`. |
| Uitloggen met open dienst en accountwissel | Dezelfde live test kiest open laten, logt als Femke in, doorloopt opnieuw de modus-keuze, ziet de servermelding en sluit de wees-dienst. |
| Gelijktijdige starts in fase 1 | Nieuwe live T01-test houdt twee echte requests van verschillende persoonlijke sessies tot dezelfde verzending tegen. Eén slaagt, de andere krijgt `shift_already_open`; beide schermen volgen de servertoestand. |
| Vertrouwd apparaat, PIN en wachtwoord | Bestaande live bar-tests in `e2e/a11y.spec.ts`; `supabase/tests/verify_bar_pin.test.sql` voor vertrouwen, lockout en geweigerde gevallen. |
| Rol, archivering en modus server-side | `bar_sessie_guards.test.sql`, `admin_sessie_rpcs_guards.test.sql`, `beheer_rpcs_modus.test.sql`, `bar_sessie_rpcs.test.sql`. |
| PIN alleen portal en cookie-isolatie | `set_own_pin.test.sql`; bestaande live portal-profieltests en portal-cookie-tests; `check:arch` bewaakt de gescheiden clients. |
| Vertraagde responses, MFA-stap en late registratie | Nieuwe `e2e/bar-sessie-wissel.spec.ts`: deterministisch vertraagde netwerkresponses en auth-events, inclusief een nieuwe sessie van hetzelfde account en behoud van de afmeldmelding. Deze mocks bewijzen uitsluitend UI-gedrag. |

## Uitvoeren

Gebruik lokaal **Supabase CLI 2.118.0**, gelijk aan `.github/workflows/ci.yml`,
en de lokale seed. Een andere CLI/containercombinatie gaf ontbrekende
tabelrechten; met de CI-versie slaagden alle 1.258 pgTAP-tests.

```text
npm ci
npm run check:fast
supabase start
# Configureer de lokale URL, publishable key en server-side service-role key
# volgens .env.example; gebruik geen productieproject voor deze tests.
npm run build
npx playwright test --workers=2
supabase test db
```

De uiteindelijke browser- en CI-uitkomsten staan in de vervolg-PR. De
productie-uitrolvoorwaarden van PR #120 blijven daar onderdeel van de uitrol.

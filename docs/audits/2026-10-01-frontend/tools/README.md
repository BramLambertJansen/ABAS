# Lokale audit reproduceren

De fixture is uitsluitend voor visuele/interactionele review. Zij gebruikt fictieve leden en transacties en verbindt nooit met een Supabase-project. Auth accepteert fictieve inloggegevens; zij implementeert geen RLS, volledige queryfilters, echte financiële boekingen of e-mail. Gebruik de resultaten niet als bewijs van backendcorrectheid.

Vanaf de repositoryroot, in een eerste PowerShell-terminal:

```powershell
node docs/audits/2026-10-01-frontend/tools/fixture-server.mjs
```

In een tweede terminal, na de gebruikelijke dependency-installatie:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54329'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='audit-fixture-no-real-key'
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Gebruik een nieuw, geïsoleerd browserprofiel voor `http://127.0.0.1:3100`. Schrijf deze fictieve configuratie niet naar `.env.local` voor normaal ontwikkelwerk. Stop beide processen na afloop; procesvariabelen verdwijnen met de terminal.

Fictieve accounts: `bram@example.test` beheerder met PIN, `tom@example.test` bardienst met PIN, `femke@example.test` bardienst zonder PIN en `anna@example.test` portallid. Het fixturewachtwoord is vrij te kiezen en wordt niet werkelijk gevalideerd. Gebruik geen echt wachtwoord. `/auth/user` is een vereenvoudigde stub; authenticatieherstel is daarmee geen betrouwbare test.

De fixture start met een open dienst. Wijzig het scenario via:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:54329/audit/config `
  -Method Post -ContentType application/json -Body '{"open":false}'
```

Relevante opties: `open` (dienst open/gesloten), `error` (endpointnaam waarvoor HTTP 500 wordt teruggegeven, bijvoorbeeld `members` of `shifts`), `delay` (milliseconden vertraging voor niet-GET-verzoeken), `crew` (array van fictieve member-ID's) en `negativeLimit` (centen). De `balance`-configproperty is een ongebruikte fixtureplaceholder; daadwerkelijke saldo's staan in de ledenlijst. Reset fout/vertraging met `{"error":"","delay":0}`. Herstart de fixture om gemuteerde gegevens te resetten.

Gecontroleerde scenario's uit deze audit:

- F01: `open=false`, Femke inloggen op `/beheer`, Bar kiezen.
- F02: open dienst, Bezetting openen: Femke ontbreekt in de huidige frontend.
- F03: Anna kiezen, Pils toevoegen, Dienst en daarna Verkoop kiezen.
- F05: afrekenen openen, direct Shift+Tab; focus valt buiten het venster.
- F06: actieve afrekenknop hoveren, CSS-transitie laten stabiliseren, contrast meten/axe uitvoeren.
- F07/F18: Anna inloggen op `/portal`; septemberdata vergelijken op Saldo en Transacties bij systeemdatum oktober 2026. De fixturedatums zijn vast, de periodeclaim moet bij reproductie met de gekozen datum worden beoordeeld.
- F13: portal ingelogd, `error=members`, herladen. Voor bar: `error=shifts`, `/` openen.
- F10: beheer → Pils → prijs `2.75`, `delay=5000`, Opslaan, Escape vóór antwoord. Scherm 39 toont pending; 40 de verdwenen dialoog.

Geldmutaties en uitnodiging/recovery niet met deze fixture als geslaagde productflow rapporteren. Voor productievalidatie echte backend-/testdata en relevante rol-/RLS-scenario's gebruiken.

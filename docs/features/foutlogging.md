# Foutlogging (client-fouten centraal i.p.v. alleen in de browserconsole)

Spec voor [issue #94](https://github.com/BramLambertJansen/ABAS/issues/94).
Volgt op [#68](https://github.com/BramLambertJansen/ABAS/issues/68) (PR #93,
`src/lib/loadErrors.ts`); aanleiding is incident
[#67](https://github.com/BramLambertJansen/ABAS/issues/67) (migratie 0019
ontbrak in productie, PostgREST gaf een schemafout).

**Status: Concept — wacht op beslissingen van Bram.** Niets hieronder is
gekozen. Per open beslissing staan de opties en een **aanbeveling**
(zo gemarkeerd), meer niet. De Developer begint pas na akkoord.

## Probleem

Sinds #93 toont elke lees-hook in `src/hooks/queries/` een korte foutcode op
het scherm (`42P01`, `PGRST202`), maar de ruwe fout gaat nog steeds alleen
naar `console.error` (44 aanroepen in `src/hooks/queries/`). Op een bar-tablet
kijkt niemand in die console. Bij #67 wisten we pas van de fout doordat
iemand hem meldde, en de details moesten achteraf gereconstrueerd worden.
Doel: een fout die een lid of bardienst ziet, moet ook zonder melding
terug te vinden zijn: welke hook, welke code, welke build, wanneer.

## Betrokken shell(s)

Allebei, via één gedeelde helper in `src/lib/`, aangeroepen vanuit de hooks.
Geen UI-wijziging: de bestaande meldingen uit `loadErrors.ts` blijven zoals
ze zijn. Features en shells merken niets (`check:arch` blijft ongewijzigd).

## Open beslissing 1: bestemming

| Optie | Voor | Tegen, in déze codebase |
|---|---|---|
| **A. Eigen Route Handler → `console.error` op de server → Vercel-logs** | Geen migratie, geen RLS/REVOKE, geen nieuwe dependency, geen derde partij. Staat los van Supabase: juist bij een #67-achtige fout (PostgREST/schema kapot) komt de melding nog aan. De server kan zelf commit-sha en tijd toevoegen, de client hoeft die niet te sturen. | Retentie en zoekmogelijkheden hangen af van het Vercel-plan (nog na te gaan); geen alerting, je moet zelf gaan kijken. Het endpoint is sessieloos, dus iedereen met de URL kan er regels in schrijven (bij een strikt schema alleen onschuldige ruis). **Middleware:** de matcher sluit alleen `/portal` uit, dus een route buiten `/portal` zou bij een portal-browser de device-login triggeren (het cookieprobleem uit ADR 0009). De route moet expliciet uit de matcher. |
| **B. Supabase-tabel + insert-RPC** | Doorzoekbaar met SQL, blijft zo lang als we willen, later eventueel te tonen in beheer. Past in het RPC-patroon. | Zelfde foutdomein als wat we willen loggen: een Supabase-storing of een ontbrekende migratie van de logtabel zelf, en de melding verdwijnt. Nieuwe tabel betekent RLS + negatieve test (`check:rls`), `REVOKE` op directe writes, `EXECUTE` alleen voor `authenticated` (0018). Fouten vóór het inloggen (portal-login, wachtwoord-herstellen) kunnen dan niet gelogd worden, tenzij `anon` `EXECUTE` krijgt: dat breekt 0018 en vraagt een ADR. Via de service-role-client schrijven (ADR 0006) verruimt dat ADR voor iets dat geen `auth.admin`-call is. |
| **C. Externe dienst (Sentry o.i.d.)** | Dedupe, alerting, stacktraces en releases zitten er standaard in. | Nieuwe dependency en een externe verwerker van data van leden. Standaard worden IP-adres, URL en breadcrumbs meegestuurd, dus PII moet expliciet uit (beslissing 2). Stacktraces en `message` gaan standaard mee, precies wat `loadErrors.ts` bewust van het scherm houdt. Een account en kosten die bij Bram liggen. |

**Aanbeveling: A.** Die optie heeft het kleinste oppervlak en overleeft het
incident dat de aanleiding was. De helper aan de clientkant wordt zo
opgezet dat een latere overstap naar B of C alleen de server-kant raakt.

## Open beslissing 2: welke velden

Wel veilig (vaste vocabulaire, geen gebruikers- of servergegevens):
hook-naam (`"useProducts"`), `kind` en `code` uit `classifyLoadError`, shell
(`bar`/`portal`), route-pad zonder query-string (de huidige paden bevatten
geen ids), tijdstip en build (aan de serverkant), en een teller bij dedupe.

Niet: naam, e-mail, saldo, member-id of `auth.uid()`, RPC-argumenten
(bedragen, product-ids), `details`/`hint`, stacktrace, IP-adres en
user-agent (dat laatste grenst bovendien aan device-sniffing).

Twijfelgeval: **`message`**. Bij schemafouten (`PGRST2xx`, SQLSTATE-klasse
`42`) bevat die de naam van de ontbrekende tabel of functie, en dat is
precies wat bij #67 had geholpen. Bij andere codes kan hij waarden bevatten
(bv. `23505`: "Key (email)=(…) already exists"). **Aanbeveling:** `message`
alleen meesturen voor schemafouten, anders weglaten. De server kapt hem af
op een vaste lengte.

## Open beslissing 3: welke hooks

- **Alleen de lees-hooks** (die al `loadErrorMessage` gebruiken): klein, en
  deze klasse gaf #67.
- **Ook de schrijf-hooks, inclusief `usePlaceOrder`/`useTopUp`**: alleen de
  *onverwachte* fouten, niet de domeinuitkomsten die de RPC bewust teruggeeft
  (`insufficient_balance`, `product_not_available`, `served_by_not_in_roster`
  en dergelijke zijn normaal gedrag en geen fout). Voor geld-RPC's geldt
  hetzelfde veldenlijstje als hierboven: nooit bedrag of lid.
- **Ook de auth-hooks** (`usePortalLogin`, `useWachtwoordHerstellen`, …):
  daar is de fout vaak pre-sessie. Met optie A kan dat, met B niet (zie
  hierboven).

**Aanbeveling:** lees- én schrijf-hooks, alleen onverwachte fouten, zelfde
velden. Een mislukte `place_order` tijdens een dienst is voor de beheerder
minstens zo belangrijk als een mislukte lijst. Auth-hooks alleen als Bram
optie A kiest.

## Open beslissing 4: dedupe / rate-limit

Feit: geen enkele hook pollt vandaag (`refetchInterval`/`setInterval` op
queries komen in `src/` niet voor). Herhaling ontstaat door opnieuw mounten,
`refetch()` na een actie, of een bardienstlid dat op "opnieuw" tikt. Toch kan
een kapotte hook op een tablet die de hele avond aanstaat honderden keren
dezelfde fout geven.

- **Clientkant, in geheugen:** per (hook, code) maximaal één melding per
  tijdvenster per pagina-load, met een teller die bij de volgende melding
  meegaat. Goedkoop, pure logica, dus testbaar in `test`.
- **Serverkant:** alleen relevant bij B/C. Bij A volstaat een limiet op
  de grootte van de body.

**Aanbeveling:** alleen aan de clientkant, venster van 5 minuten (Bram
kiest het getal). Geen persistente buffer (geen `localStorage`): meldingen
tijdens een netwerkstoring gaan verloren. Dat past bij "geen offline-eisen"
(CLAUDE.md → Shells).

## Gedrag (ongeacht de keuzes)

- Melden is fire-and-forget: het blokkeert nooit de UI, gooit nooit, en een
  mislukte melding wordt niet opnieuw gemeld (geen lus).
- `console.error` blijft naast de melding bestaan voor wie lokaal debugt.
- De helper maakt de payload zelf op basis van een allowlist. Hij accepteert
  geen vrij object van de aanroeper, zodat een hook niet per ongeluk een
  rij met naam/saldo meestuurt.
- In `next dev` en CI (geen env) zou melden alleen console-ruis geven. Hoe
  de helper zich daar gedraagt beslist de Developer, maar CI mag er niet
  door falen.

## Rolzichtbaarheid

Geen scherm. Bij A: wie toegang heeft tot het Vercel-project. Bij B: niemand
via de app zolang er geen leesscherm is (buiten scope). Bij C: wie toegang
heeft tot het account van de dienst.

## Gevolgen voor gates, ADR, migratie

- **ADR: ja, 0011**, geschreven zodra Bram gekozen heeft. "Waar gaan
  client-fouten heen en wat mag erin" is een beslissing die een volgende
  feature kan tegenspreken. Bij B of C weegt dat zwaarder (nieuw schrijfpad
  zonder geld, resp. een externe verwerker).
- **Migratie:** alleen bij B (tabel, RLS, `REVOKE`, RPC met `EXECUTE`
  ingetrokken voor `PUBLIC`, pgTAP-negatieve test).
- **`check:arch`:** geen wijziging. De helper in `src/lib/` importeert geen
  SDK en geen `admin.ts`.
- **`check:policy`:** geen wijziging nodig. **Aanbevolen nieuwe regel:**
  een kale `console.error(` in `src/hooks/queries/` is een fout, alleen de
  centrale helper is toegestaan. Dat is een regex-check (zie CLAUDE.md →
  "Regel over regels") en voorkomt dat hook 45 het weer vergeet.
- **`check:rls`:** alleen bij B, automatisch (nieuwe tabel wordt gevonden).
  Geen geldtabel, dus geen toevoeging aan `MONEY_TABLES`.
- **`src/middleware.ts`:** bij A het pad van de route uit de matcher halen.
- **`test`:** payload-allowlist en dedupe als pure functies.

## Expliciet buiten scope

Een logscherm in beheer. Alerting of notificaties. Server-side fouten
(Route Handlers, middleware; die staan al in de serverlogs). Performance- of
gebruiksstatistieken. Een persistente offline-buffer. Het ombouwen van
`loadErrors.ts` zelf.

## Open beslissingen voor Bram

1. Bestemming: A (Route Handler → Vercel-logs), B (Supabase-tabel + RPC) of
   C (externe dienst, en zo ja welke)?
2. Bij A: welk Vercel-plan draait productie, en is de logretentie daarvan
   genoeg, of wil je er later een log drain bij?
3. Mag `message` mee voor schemafouten (`PGRST2xx`/`42xxx`), of alleen code
   en `kind`?
4. Reikwijdte: alleen lees-hooks, ook schrijf-hooks (inclusief `place_order`
   / `top_up`, alleen onverwachte fouten), en ook auth-hooks van vóór het
   inloggen?
5. Dedupe-venster: één melding per (hook, code) per hoeveel minuten?
6. Is een sessieloos meld-endpoint (iedereen met de URL kan er ruis in
   schrijven, geen data eruit) acceptabel, zoals bij #34 voor de
   device-login?
7. Moet de voorgestelde `check:policy`-regel ("geen kale `console.error` in
   `src/hooks/queries/`") meekomen in deze feature?

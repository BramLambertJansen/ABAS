# 0011 — De gedeelde device-sessie komt alleen tot stand op een gekoppelde tablet

Status: **concept, wacht op akkoord van Bram** (2026-09-28). Hoort bij
[`docs/features/tablet-koppelen.md`](../features/tablet-koppelen.md).
**Vervangt** het geaccepteerde risico uit
[issue #34](https://github.com/BramLambertJansen/ABAS/issues/34)
(`docs/ARCHITECTURE.md` → "Accepted risk: device sign-in has no tablet-trust
check", 2026-08-26). **Raakt** ADR
[0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md) (stap 3: herstel
van de device-sessie na uitloggen) en ADR
[0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) (de
PIN-route naar bar-modus). Beide worden aangevuld, geen van beide wordt
vervangen. Staat naast ADR
[0009](0009-portal-sessie-eigen-cookienaam.md) zonder die te wijzigen.

## Context

`src/middleware.ts` logt elke bezoeker zonder sessie op een
niet-`/portal`-URL server-side in als het gedeelde device-account (#32,
`docs/ARCHITECTURE.md` → "Device sign-in mechanism"). Welk apparaat de
bezoeker gebruikt, wordt niet gecontroleerd.

In augustus is dat voor de MVP geaccepteerd (#34), onder de aanname dat
"writes still require the PIN inside `place_order`/`top_up`/`start_shift`".
**Die aanname was onjuist.** Alleen `start_shift` controleert een PIN. De
andere bar-RPC's (`place_order`, `top_up`, `reverse_order_at_bar`,
`end_shift`, `add_shift_member`, `remove_shift_member`) controleren alleen of
`served_by`/`reversed_by` in de bezetting van de open dienst staat. Die ids
kan de device-sessie lezen: `shifts` en `shift_members` staan op `using
(true)` (ADR 0007). Wie tijdens een open dienst de URL opent, kan dus
onbeperkt opwaarderen (€500 per aanroep, zonder maximum aantal
aanroepen), bestellingen terugdraaien en de dienst afsluiten. Daarnaast kan
diegene alle leden en saldi lezen.

`0023_bar_rpcs_weigeren_lid.sql` (A2 uit
`docs/features/bar-rpc-autorisatie.md`) sluit dit voor een lid-sessie, maar
niet voor de device-sessie, want `caller_is_lid()` is voor dat account
onwaar. Dat was ook bewust zo: de device-sessie moet alles kunnen wat de bar
nodig heeft.

De bar-flow rust op een aanname die nergens was vastgelegd: **wie de
device-sessie heeft, staat achter de bar**. De zwakke
`served_by`-attributie (CLAUDE.md → Architectuurbeslissingen) is alleen te
verdedigen als die aanname klopt. Dit ADR maakt haar waar.

## Beslissing

**De middleware maakt alleen een device-sessie aan voor een browser die een
geldig koppelcookie meestuurt. Dat cookie geeft de server eenmalig uit
nadat iemand op `/koppel` het provisioning-secret heeft ingevoerd.**

1. **Secret**: `BAR_DEVICE_SECRET`, server-only, minstens 128 bit
   entropie. Ontbreekt het secret of is het te kort, dan faalt alles dicht:
   er wordt nergens een device-sessie aangemaakt.
2. **Koppelen**: een formulier-POST (Server Action) op `/koppel`. De code
   komt nooit in een URL, want een query-string komt in de serverlogs en
   de browsergeschiedenis terecht, en een fragment in de
   browsergeschiedenis van de tablet. De server vergelijkt de code in
   constante tijd.
3. **Cookie**: `abas_tablet`, `HttpOnly`, `SameSite=Strict`, `Path=/`, en
   `Secure` op https. De waarde is `v1.<iat>.<nonce>.<HMAC>`. De
   HMAC-sleutel is van het secret afgeleid, en het secret zelf staat niet in
   het cookie. De koppeling is **stateless**: er is geen tabel met
   gekoppelde apparaten, en de database weet niets van koppelingen.
4. **Middleware**: een pure beslisfunctie (spec → Middleware) kijkt naar
   drie dingen: het soort sessie (geen, device of persoonlijk), of de
   koppeling geldig is, en of het pad vrijgesteld is (`/koppel`, `/beheer/**`,
   `/auth/**`). Zonder sessie en zonder koppeling op een bar-pad volgt een
   redirect naar `/koppel`. Een device-sessie zonder geldige koppeling wordt
   uitgelogd met `scope: "local"`, nooit `global`, zodat een bezoeker met
   een oud cookie de echte tablet niet mee uitlogt. Een persoonlijke
   e-mailsessie laat de middleware ongemoeid.
5. **Intrekken = roteren**: een nieuw secret maakt alle koppelingen in één
   keer ongeldig. Daarbij horen altijd ook het intrekken van de lopende
   Supabase-sessies van het device-account en het opnieuw koppelen van de
   tablet. Dat geldt ook voor de eenmalige overgang bij de uitrol van dit
   ADR.

Waarom stateless: met één tablet is "alles intrekken" hetzelfde als "deze
tablet intrekken". Een tabel met gekoppelde apparaten voegt dan een
schrijfpad, een beheerscherm en een databasecheck per request toe (de
middleware draait op Edge, en elke request zou een query kosten), terwijl
er geen verschil in gedrag tegenover staat. Komt er een tweede tablet die
los moet kunnen worden ingetrokken, dan is dat het moment voor een nieuw
ADR (spec → open vraag 3).

**Geldlaag: ongewijzigd, en dat is bewust.** Geen RPC krijgt een extra
controle. Geld beweegt nog steeds alleen via RPC en de attributie komt nog
steeds uit de bezetting. Dit ADR regelt alleen *wie* een sessie krijgt, niet
*wat* een sessie mag. Dat laatste blijft in
`docs/features/bar-rpc-autorisatie.md` (A3/A4/B1–B3). Dat document wordt hier
niet bijgewerkt.

## Verworpen alternatieven

- **Vercel Deployment Protection.** Die beschermt de hele deployment en kent
  geen uitzondering per pad. `/portal` zou er dan ook achter komen te zitten,
  en leden moeten daar zonder extra drempel kunnen inloggen (CLAUDE.md →
  Auth). Als je portal en bar over twee deployments of domeinen verdeelt om
  dit te omzeilen, verandert de routing (`src/app/(bar)/layout.tsx` noemt
  pad-gebaseerd routeren al een niet-bevestigde default). Dat is een grotere
  architectuurwijziging dan het probleem vraagt.
- **IP-allowlist** (alleen verzoeken vanaf het IP-adres van het
  verenigingsgebouw). Dat heeft vier problemen. Een consumentenaansluiting
  heeft meestal geen vast IP-adres. Iedereen op hetzelfde netwerk
  (gasten-wifi, leden met hun telefoon in de zaal) komt er ook door. Een
  tablet die via 4G of een ander netwerk verbindt, valt eruit. En de
  bescherming zit in configuratie buiten de repo, wat testen in CI en
  lokaal lastig maakt. Een provisioning-secret bindt de
  vertrouwensrelatie aan het apparaat, niet aan de plek.
- **A3 uit `bar-rpc-autorisatie.md`: het device-account expliciet in het
  datamodel (`device_accounts`, allowlist in de RPC's).** Dat lost een
  andere vraag op. A3 regelt dat alleen het device-account (of een bar-rol)
  bar-RPC's mag aanroepen. Hier gaat het erom dat iedereen dat
  device-account nu krijgt. Met A3 zonder dit ADR mag "het device-account"
  alles, en heeft nog steeds iedereen met de URL dat account. A3 is dus
  geen alternatief. Dit ADR is juist een voorwaarde om A3/B3 iets te laten
  betekenen. Beide kunnen naast elkaar bestaan.
- **Een koppeling met status in de database** (tabel met koppelingen,
  intrekken per tablet): zie Beslissing → "Waarom stateless". Dit is uitgesteld,
  niet verworpen.
- **De code in de koppel-URL** (`/koppel?code=…` of `#…`), omdat je dan
  alleen een link hoeft te openen. Verworpen vanwege logs en
  browsergeschiedenis, zie Beslissing punt 2.
- **Een dev-bypass op basis van `NODE_ENV`, zoals `designPreviewGate`.**
  Verworpen: `/design` beschermt een mockup, deze afscherming beschermt de
  geldlaag. Een bypass zou een codepad in de productiebundel zijn dat de
  device-sessie openzet, alleen afhankelijk van één env-waarde. Lokaal
  koppel je één keer per dev-browser.

## Gevolgen

- **Een buitenstaander krijgt geen sessie meer**: geen leestoegang tot
  leden en saldi, en geen bar-RPC's. De aanname "device-sessie = achter de
  bar" klopt weer. Dat maakt de zwakke `served_by`-attributie weer
  verdedigbaar, zoals bedoeld.
- **Restrisico, aanvaard**: het Supabase-authcookie is niet `HttpOnly`. Wie
  fysiek bij de gekoppelde tablet kan, kan het refresh token kopiëren en
  elders gebruiken. De koppeling bindt de Supabase-sessie niet aan het
  apparaat. Die dreigingsgrens hoort bij "achter de bar staan" (vergelijk B3
  in `bar-rpc-autorisatie.md`). Bij verlies van de tablet: roteren.
- **Restrisico bij de uitrol en bij elke rotatie**: al uitgegeven
  access tokens (JWT) blijven geldig tot `jwt_expiry`. Het intrekken van
  sessies stopt alleen het verversen daarvan.
- **ADR 0002, stap 3** ("de eerstvolgende bar-request zonder sessie
  herstelt de device-sessie") geldt voortaan alleen op een gekoppelde
  tablet. Op elk ander apparaat komt de bezoeker na uitloggen op `/koppel`.
  Het mechanisme "vervangen en weer herstellen" zelf blijft zoals het is.
- **ADR 0003**: bar-modus via PIN vereist een gekoppelde tablet. Bar-modus
  via e-mail (ModusKeuze → "Bar") blijft op elk apparaat werken, tenzij Bram
  anders beslist (spec → open vraag 7).
- **ADR 0009**: het koppelcookie is geen Supabase-cookie. De naamscheiding
  tussen bar- en portalsessie blijft intact. Dat `abas_tablet` ook naar
  `/portal` wordt meegestuurd, kan geen kwaad: niets daar leest het.
- **`/beheer` op een niet-gekoppeld apparaat** toont het inlogformulier
  zonder de `denied`-melding die de device-sessie nu veroorzaakt. Dat lost
  [#78](https://github.com/BramLambertJansen/ABAS/issues/78) gedeeltelijk
  op. Op de tablet blijft #78 open.
- **CI en e2e**: CI krijgt een vast test-`BAR_DEVICE_SECRET`. Tests die de
  device-sessie nodig hebben, koppelen eerst via de echte `/koppel`-flow.
  `/beheer`-specs draaien in CI voortaan zonder device-sessie.
- **Ops**: `BAR_DEVICE_SECRET` moet vóór de deploy in Vercel staan, anders
  werkt de bar na de deploy nergens meer. Direct na de deploy moeten de
  device-sessies ingetrokken worden, en daarna koppel je de tablet.
- **Documentatie, na akkoord**: `docs/ARCHITECTURE.md` → "Accepted risk…"
  wordt vervangen door een verwijzing naar dit ADR. "Shared bar-tablet
  session mechanism", "Device sign-in mechanism" en "Local/CI device
  account" worden aangevuld. CLAUDE.md → Auth krijgt één zin. Er komt geen
  nieuwe gate: `import "server-only"` op `src/lib/tabletKoppeling.ts`
  dwingt al af dat het secret niet in clientcode belandt. Wat een gate niet
  kan controleren, blijft reviewwerk: `scope: "local"` bij uitloggen, en
  nergens `===` op secret of handtekening.

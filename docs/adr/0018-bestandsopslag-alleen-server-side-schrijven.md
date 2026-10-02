# 0018 — Bestandsopslag: schrijven alleen server-side na sessieverificatie, geen schrijfpolicies op `storage.objects`

Status: **geaccordeerd (2026-10-02), geïmplementeerd (2026-10-02, PR
[#146](https://github.com/BramLambertJansen/ABAS/pull/146), merge-commit
`7efc6ad`).** Zie "Implementatie" onderaan. Bram gaf akkoord samen met de
spec
[`docs/features/productafbeeldingen.md`](../features/productafbeeldingen.md)
(spec → Besluit 10; het akkoord is via de coördinator doorgegeven). Breidt
de reikwijdte van
[ADR 0006](0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
uit van Auth Admin-calls naar Supabase Storage. Vervangt niets.

Bijgewerkt na rebase op `origin/main` `6816dbc` (2026-10-02), alleen
mechanisch:
- punt 2 en 6 noemen de gate `rpc_catalogus`, die sinds 2026-10-01 bestaat;
- Gevolgen: de logica van het entrypoint is wel zonder database te testen.

De beslissing zelf is niet veranderd.

## Context

Productafbeeldingen maken de eerste Supabase Storage-bucket in ABAS. Storage
heeft een eigen toegangsmodel naast dat van de tabellen: RLS op
`storage.objects`, plus per bucket een vlag `public`, een `file_size_limit`
en `allowed_mime_types`. Geen van de bestaande beslissingen zegt hier iets
over:

- "Geld alleen via RPC" en ADR 0004 gaan over tabellen en kolommen.
- ADR 0006 gaat over `auth.admin.*` en noemt Storage niet.
- `check:rls` ziet alleen tabellen uit onze eigen migraties
  (`create table`). `storage.objects` en `storage.buckets` maakt Supabase
  zelf aan, dus een bucket of een storage-policy valt buiten elke gate.
  `check:policy` vangt `supabase.storage.from(` niet.

Een volgende feature (een tweede bucket, bv. profielfoto's van leden) zou
zonder vastgelegde regel een andere route kunnen kiezen: een
`insert`-policy voor `authenticated`, een publieke bucket voor
persoonsgebonden beeld, of uploads zonder limieten. Dat is de reden voor een
ADR (Architect → "elke beslissing die een volgende feature zou kunnen
tegenspreken").

## Beslissing

1. **Geen enkele policy op `storage.objects` geeft `anon` of
   `authenticated` schrijfrecht** (`INSERT`, `UPDATE`, `DELETE`, `ALL`).
   Schrijven naar Storage gebeurt alleen door een server-only entrypoint
   (Route Handler onder `src/app/`, logica in `src/lib/`) met de
   service-role-client (`src/lib/supabase/admin.ts`). Dat entrypoint eerst
   de aanroeper verifieert met de sessie-gebonden client: actorcheck (ADR
   0002) en de sessiecheck die bij de actie hoort (voor beheer
   `check_beheer_session`, ADR 0016 en 0017). Dit is ADR 0006 → Beslissing
   punt 1 t/m 4, toegepast op Storage in plaats van `auth.admin`.
2. **De verwijzing naar het bestand staat in een tabel en wordt alleen via
   een `security definer`-RPC gezet**, aangeroepen met de sessie-gebonden
   client (ADR 0006 → punt 3). De RPC doet zelf de sessiecheck en de
   actorcheck opnieuw, en controleert dat het pad bij de rij hoort en het
   object bestaat. Een bestand dat in de bucket staat maar nergens naar
   verwezen wordt, is een weesbestand en geen geldige staat. Zo'n RPC is in
   `supabase/tests/rpc_catalogus.test.sql` een client-functie met
   `require_*`-guard. Een guardvrije uitzondering is voor deze RPC's niet
   toegestaan.
3. **Elke bucket wordt in een migratie aangemaakt** (niet via
   `config.toml` of het dashboard), met een `file_size_limit` en
   `allowed_mime_types`. Wat in de bucket komt, is zo mogelijk door de
   server zelf gemaakt (opnieuw gecodeerd), zodat de MIME-limiet een
   werkelijke eigenschap van de inhoud is en niet van de header van een
   client.
4. **`public = true` alleen voor niet-gevoelig, niet-persoonsgebonden
   materiaal** (productfoto's). Bestanden van of over een lid (profielfoto,
   documenten) horen in een private bucket met een eigen, apart besloten
   leespad. Dat vraagt een nieuwe spec en is geen uitbreiding van deze
   bucket.
5. **Paden zijn onveranderlijk:** elke upload krijgt een nieuw willekeurig
   pad, vervangen betekent een nieuw object plus het oude opruimen. Geen
   `upsert` op een vast pad. Dat voorkomt een verouderde CDN-cache bij een
   publieke bucket en maakt compenseren bij een halve mislukking eenduidig.
6. **Gates:** `check:rls` controleert dat elke bucket in de migraties een
   type- en groottelimiet heeft en in `supabase/tests/` voorkomt, en dat
   elke `create policy ... on storage.objects` een test heeft.
   `check:policy` verbiedt `.storage.from(` buiten `src/hooks/queries/` en
   `src/lib/`. Een pgTAP-invariant toetst dat `storage.objects` geen
   schrijfpolicy heeft, over alle buckets (zoals
   `rpc_execute_grants.test.sql` voor functies). De RPC uit punt 2 valt
   onder de bestaande gate `rpc_catalogus`, en daarvoor is geen uitbreiding
   nodig.

## Verworpen alternatieven

- **Direct uploaden vanuit de browser met een `insert`-policy op
  `storage.objects`** (bv. `bucket_id = 'product-images' and
  is_beheer_session()`). Verworpen om drie redenen:
  - De policy wordt geëvalueerd als de aanroepende rol. De sessiecheck moet
    dan een `boolean`-functie zijn met `EXECUTE` voor `authenticated`, en
    de beheergrens staat op twee plekken (policy en RPC) die uit elkaar
    kunnen lopen.
  - `allowed_mime_types` toetst de `Content-Type` die de client meestuurt,
    niet de inhoud.
  - Er is geen server-side moment om te schalen of metadata (EXIF, GPS)
    te verwijderen.
  Het voordeel (geen bodylimiet van Vercel, geen nieuwe afhankelijkheid)
  weegt daar niet tegenop voor bestanden van een paar MB.
- **Signed upload URL's** (de server geeft na verificatie een
  `createSignedUploadUrl`, de browser uploadt zelf). Dit lost het
  policyprobleem op, maar niet de andere twee: geen inhoudscontrole en geen
  verwerking vóór opslag. Kan later een uitbreiding zijn als bestanden
  structureel boven de bodylimiet uitkomen, met verwerking ná de upload.
- **Een private bucket als standaard, ook voor productfoto's.** Verworpen
  voor dit soort materiaal: signed URL's verlopen op een tablet die uren
  openstaat, en er valt niets geheims te beschermen. Punt 4 houdt privé
  verplicht voor alles wat persoonsgebonden is.
- **Het oude object verwijderen vanuit SQL** (in de RPC). Kan niet: Supabase
  blokkeert direct `delete` op `storage.objects`, verwijderen moet via de
  Storage-API. Daarom ruimt het server-entrypoint op, na de RPC.

## Gevolgen

- `src/lib/supabase/admin.ts` krijgt een tweede soort gebruik
  (Storage-schrijfacties) naast `auth.admin.*`. Het commentaar bovenin dat
  bestand en ADR 0006 → "Reikwijdte" krijgen een verwijzing naar dit ADR.
- Weesbestanden zijn mogelijk (een compenseer- of opruimstap mislukt). Ze
  zijn onschadelijk, worden gelogd en zijn handmatig op te ruimen. Een
  automatische opruimtaak kan niet in pg_cron (verwijderen gaat via de
  Storage-API) en vraagt een eigen besluit.
- pgTAP kan de RPC, de bucketconfiguratie en het ontbreken van
  schrijfpolicies toetsen, maar niet het server-entrypoint zelf. De
  volgorde in de `src/lib/`-module kan wel zonder database getest worden in
  `test`, met nepclients, zoals `test/inviteMember.test.ts` dat doet voor de
  invite:
  - de verificatie komt vóór elke verwerking;
  - compenseren als de RPC faalt;
  - het vorige object opruimen.

  De Route Handler zelf en de echte Storage-API blijven, zoals bij ADR 0006,
  handmatig of e2e.
- De bodylimiet van Vercel (4,5 MB) begrenst wat via een server-entrypoint
  kan. Een feature die grotere bestanden nodig heeft, moet dit ADR
  heroverwegen (zie signed upload URL's hierboven) en mag er niet omheen
  werken.

## Implementatie (PR #146, 2026-10-02)

Gebouwd zoals besloten. De eerste toepassing is
[`docs/features/productafbeeldingen.md`](../features/productafbeeldingen.md)
→ "Zoals gebouwd". Per punt:

1. Er is geen policy op `storage.objects`. Schrijven gebeurt alleen via
   `src/app/(bar)/beheer/productafbeelding/route.ts` →
   `src/lib/productImage.ts`, met de service-role-client en pas na
   `getUser`, de actorcheck en `check_beheer_session` met de
   sessie-gebonden client.
2. De verwijzing `products.image_path` wordt gezet via `set_product_image`
   (migratie `0038`). Die RPC doet de sessiecheck, de actorcheck, de padcheck
   en de bestaanscheck. In `rpc_catalogus` staat hij als client-functie met
   guard.
3. De bucket `product-images` wordt aangemaakt in `0038`, met
   `file_size_limit` (1 MB) en `allowed_mime_types` (`{image/webp}`). De
   server codeert elke upload opnieuw met `sharp`
   (`src/lib/productImageProcessing.ts`).
4. De bucket is publiek. Hij bevat alleen productfoto's.
5. Elk pad is nieuw (`products/<id>/<uuid>.webp`, `upsert: false`). Bij
   vervangen wordt het oude object na de RPC opgeruimd.
6. De gates bestaan:
   - `check:rls` controleert de bucketlimieten, of de bucket in de tests
     voorkomt, en of storage-policies op naam in de tests staan;
   - `check:policy` verbiedt `.storage.from(` buiten de datalaag;
   - de pgTAP-invariant "geen schrijfpolicy op `storage.objects`" staat in
     `supabase/tests/productafbeeldingen.test.sql`.

Wat volgens "Gevolgen" niet automatisch te toetsen is, blijft handmatig: de
echte Storage-API en de bodylimiet van Vercel. Dat staat met de stand van
zaken in de spec → Zoals gebouwd → Open. Op het gehoste project is ook nog
niet gecontroleerd dat de functie-eigenaar `storage.objects` mag lezen, wat
de bestaanscheck van punt 2 nodig heeft. Dat moet vóór `supabase db push`.

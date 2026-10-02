# Productafbeeldingen

Featureverzoek van Bram (2026-10-02): *"maak het mogelijk om afbeeldingen toe
te voegen aan producten"*. Nog geen issuenummer.

**Status: goedgekeurd door Bram (2026-10-02), nog niet gebouwd.** Het
akkoord is via de coördinator doorgegeven. Bram volgde bij alle dertien
vragen de aanbeveling van de Architect en koos nergens het alternatief. De
vragen en antwoorden staan onder "Besluiten van Bram". Verwijzingen als
"(Besluit 4)" in de tekst wijzen daarnaar. De Developer kan beginnen. Wijkt
de bouw af van een besluit, dan gaat dat terug naar de Architect en wordt
het niet zelf ingevuld.

**Changelog.** 2026-10-02, bijgewerkt na rebase op `origin/main` `6816dbc`
(was geschreven tegen `faa32bd`). Alleen mechanische updates, geen besluit
gewijzigd en geen nieuw besluit:
- Product beheren volgt het pending-model van #126: `OpslaanSectie`,
  serialisatie per product, foutregel per sectie en 30 s-time-out. "Bezig
  met uploaden…" staat nu in de knop en niet meer in een eigen
  `aria-live`-regel.
- `set_product_image` moet in de catalogus van `rpc_catalogus`.
- Twee overgebleven verwijzingen naar "Open vraag 2/7" wijzen nu naar het
  besluit.
- De grants verwijzen niet meer naar de oude CLAUDE.md-tekst.
- `check:rls` gecorrigeerd: het script controleert policies vandaag niet.
- De testrunner is `node --test`. De route-logica is met nepclients te
  unit-testen.
- Verwijzing naar de open PR #145 (galerij).

2026-10-02, bij de bouw: Besluit 14 (plek van het afbeeldingsblok) en
Besluit 15 (bezig-tekst in de knop) toegevoegd onder "Aanvullende besluiten
van Bram". PR #145 is inmiddels gemerged; de bouw is gebaseerd op
`origin/main` `c48d063`.

Deze spec bouwt voort op
[`assortimentbeheer.md`](assortimentbeheer.md) (producten, `/beheer`,
`ProductBeherenOverlay`) en op het server-actiepatroon van
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md).
Er komt een nieuwe architectuurbeslissing bij, de eerste bestandsopslag in
het project. Die staat in
[ADR 0018](../adr/0018-bestandsopslag-alleen-server-side-schrijven.md)
(zie Besluit 10).

## Onderzocht

Per Architect-randvoorwaarden zijn drie bronnen gelezen vóór het schrijven.

**Wireframe (`designs/Bar App.dc.html`).** Het prototype heeft al vier
`<image-slot>`-plekken voor een productafbeelding. Dat zijn klik-prototype
drop-zones uit `designs/image-slot.js`, geen datamodel:

| Plek | Regel | Afmeting | Vorm |
|---|---|---|---|
| Verkoop, galerij-kaart | 100 | volle kaartbreedte × 92px, in een `#faf7f3`-kader met 6px padding | `rounded`, radius 8 |
| Verkoop, lijstrij | 119 | 42 × 42px | `rounded`, radius 8 |
| Beheer, productenlijst-rij | 563 | 38 × 38px | `rounded`, radius 8 |
| Beheer, "Product beheren"-kop | 910 | 52 × 52px | `rounded`, radius 12 |

De lege staat (`placeholder="{{ p.name }}"`) toont de productnaam in het
vlak. Uit `designs/chats/chat1.md` (r. 204) en `chat2.md` (r. 31) blijkt dat
dit van het begin af bedoeld was: *"Productfoto's zijn drop-slots — sleep je
eigen beelden erin"*. Het prototype zegt niets over uploadflow, validatie,
bijsnijden of wie mag uploaden. `designs/Lid App.dc.html` heeft geen
productafbeeldingen. De enige `image-slot` daar (r. 69) is een
intro-illustratie. `designs/README.md` noemt het onderwerp niet.

**Bestaande code.**
- `src/features/verkoop/Assortiment.tsx` zegt het letterlijk (commentaar
  boven de `return`): *"Geen productfoto's: die bestaan niet in het datamodel
  (het prototype toont daar een lege image-slot)."* De galerij- en lijstvorm
  bestaan al, dus de afbeelding wordt een toevoeging aan bestaande markup en
  geen nieuw scherm.
- Producten worden geschreven via drie beheer-RPC's (`create_product`,
  `update_product_price`, `set_product_archived`). De laatste versie staat in
  `0029_bar_rpcs_eisen_bar_sessie.sql`: eerst `perform
  require_beheer_session()` (modus `beheer` en sinds `0034` `aal2`), daarna
  de ADR 0002-actorcheck. `products` is sinds `0005` `REVOKE insert, update,
  delete ... from authenticated`. Lezen gebeurt met een platte `select` in
  `useProducts()` (verkoop) en `useAlleProducten()` (beheer).
- Mutatiehooks (`useCreateProduct.ts`, `useUpdateProductPrice.ts`,
  `useSetProductArchived.ts`) geven een `AssortimentProduct` terug die uit de
  `products`-rij van de RPC gemapt wordt. Ze kennen de sessiecodes niet:
  `wrong_mode` en dergelijke worden daar `unknown`.
- `ProductBeherenOverlay.tsx` volgt sinds #126
  ([`opslaan-sluiten-pending.md`](opslaan-sluiten-pending.md), PR #142) het
  gedeelde pending-model:
  - per actie een `OpslaanSectie` (`aria-busy`, eigen `role="alert"`-foutregel,
    uitleg "wacht tot de lopende wijziging klaar is");
  - serialisatie per product via `isBezig(...)` uit `src/lib/opslaan.ts`;
  - `useOpslaanBlokkade(busy)` voor `closeBlocked`, met een 30 s-time-out en
    `ONBEKENDE_UITKOMST_TEKST`;
  - `useHerstelFocus` na afloop;
  - `onopgeslagen` voor een ingevulde prijs;
  - bij succes alleen het gewijzigde veld toepassen
    (`setProduct((current) => ({ ...current, ... }))`).

  De gedeelde `lastAction`-foutregel bestaat niet meer.
- Een server-only actie bestaat al één keer: `/beheer/invite`
  (`src/app/(bar)/beheer/invite/route.ts` → `src/lib/inviteMember.ts` →
  `src/lib/supabase/admin.ts`). Daar zitten de verificatie met de
  sessie-gebonden client (`getUser` + actorcheck + `check_beheer_session`),
  de service-role-client voor het deel dat geen SQL is, en de
  database-schrijving terug via een gewone RPC. `test/inviteMember.test.ts`
  test die volgorde zonder database, met nepmodules
  (`test/fakes/invite-member-resolve.mjs`).
- Supabase Storage wordt nergens gebruikt: geen bucket, geen
  `storage.objects`-policy, geen `[storage]`-sectie in
  `supabase/config.toml` (lokaal gelden de standaardwaarden).
- `src/components/`: geen beeldcomponent. `InitialsAvatar.tsx` laat zien hoe
  hier een gedeeld component met vaste `size`-varianten werkt (geen vrije
  px-waarden bij de aanroeper). `initials()` uit `src/lib/staff.ts` is
  herbruikbaar voor een lege staat (Besluit 2).
- `sharp` staat in `package-lock.json` als transitieve afhankelijkheid van
  `next` en wordt al gebruikt door `scripts/generate-pwa-icons.mjs`. Het
  staat niet als directe afhankelijkheid in `package.json`.

**Kaders.**
- CLAUDE.md → Architectuurbeslissingen. Deze feature raakt **geen geld**:
  geen prijs, geen saldo en geen `order_lines`. `place_order` leest
  `products` via een rijvariabele (`v_product products`), en een extra
  nullable kolom verandert daar niets aan. Deze feature raakt **ook geen
  attributie**: er is geen `served_by` en geen bezetting, het is een
  beheeractie. Daarom is er geen uitzondering op een van de twee
  kernbeslissingen. De beheerkant volgt ADR 0002, 0003, 0016 en 0017
  ongewijzigd.
- ADR 0006: een bevoegde actie die geen SQL is (daar: `auth.admin.*`, hier:
  een object in Storage zetten of verwijderen) loopt via een server-only
  entrypoint, met een eigen verificatie via de sessie-gebonden client. De
  databasekant loopt terug via een gewone RPC met de sessie-gebonden client.
  ADR 0006 → "Reikwijdte" noemt alleen Auth Admin-calls. Toepassen op
  Storage is daarom een uitbreiding en geen herhaling, en daarom bestaat ADR
  0018.
- Gates: `check:rls` en `check:policy` dekken Storage vandaag **niet**. Zie
  "Gates" hieronder. CLAUDE.md → "Regel over regels" vraagt dat dit een gate
  wordt en geen zin in CLAUDE.md. Sinds 2026-10-01 eist de gate
  `rpc_catalogus` (`db:test`, CLAUDE.md → Verificatie) dat elke nieuwe
  functie in `public` ingedeeld is.
- Open PR's op `main` die dezelfde bestanden raken: #145
  (tablet-bruikbaarheid, T04) en #137 (verkoopconcept bewaren, T03) wijzigen
  allebei `Assortiment.tsx`. #145 vervangt de kolommen van de galerij
  (`shell.columns`) door `auto-fill` met een minimale kaartbreedte en
  herschikt de kaart. Dat is geen inhoudelijk conflict met deze spec. Wie als
  tweede merget, past de markup aan.

## Doel

Een beheerder kan in `/beheer` één afbeelding aan een product hangen, die
vervangen of weghalen. Bardienst ziet die afbeelding op het verkoopscherm,
zodat een product sneller te vinden is. Zonder afbeelding werkt alles zoals
nu.

## Betrokken shell(s)

`shells/bar` alleen, via shell-onafhankelijke componenten:
- **Tonen:** `src/features/verkoop/Assortiment.tsx` (galerij en lijst) en
  `src/features/assortimentbeheer/ProductenLijst.tsx` en
  `ProductBeherenOverlay.tsx`. Dat zijn de vier plekken uit de wireframe
  (Besluit 1).
- **Beheren:** `ProductBeherenOverlay.tsx`, in modus `beheer`.
- **`shells/portal`: niets.** De Lid App heeft geen productafbeeldingen, en
  `list_own_transactions` (`0024`) geeft bewust geen productregels terug
  (commentaar r. 20–22). Een afbeelding in de portal zou eerst een
  productregel in de portal vragen. Dat is een eigen feature en valt buiten
  deze scope (Besluit 1).

Geen nieuwe `useShell()`-capability. De galerij bepaalt haar kolommen al
zelf: vandaag met `shell.columns`, na PR #145 met `auto-fill`.

## Datamodel

Nieuwe migratie, het volgende vrije nummer bij de bouw (vandaag `0038`;
`check:migrations` bewaakt dat).

**1. Kolom op `products`.**
`alter table products add column image_path text`, nullable, met een
check-constraint op het padformaat (zie 3). `null` betekent geen afbeelding.
Er wordt alleen het pad binnen de bucket opgeslagen, geen volledige URL. Een
URL hangt af van de omgeving (lokaal, hosted) en het projectadres, en hoort
niet in de data.

Schrijven alleen via de RPC hieronder. De `REVOKE insert, update, delete on
products from authenticated` uit `0005` dekt de nieuwe kolom automatisch:
een tabel-REVOKE geldt voor alle kolommen. Lezen gaat via de bestaande
`products_select`-policy. Iedereen die producten mag zien, mag ook het pad
zien. Een pad is niet gevoelig (zie Rolzichtbaarheid).

Geen alt-tekstkolom (Besluit 11).

**2. Bucket `product-images`**, aangemaakt in dezelfde migratie met
`insert into storage.buckets (id, name, public, file_size_limit,
allowed_mime_types)`. Dus niet via `supabase/config.toml`: dat geldt alleen
voor de lokale stack. Een migratie geldt ook voor het gehoste project
(`supabase db push`), en lokaal en productie lopen zo niet uiteen.

| Instelling | Besloten | Waarom |
|---|---|---|
| `public` | `true` (Besluit 5) | Niet-gevoelige productfoto's. CDN-cache, geen verlopende URL's op een tablet die uren openstaat. |
| `allowed_mime_types` | `{image/webp}` | De server codeert elke upload opnieuw naar WebP (Besluit 6). De bucket weigert dan alles wat niet via die route kwam. |
| `file_size_limit` | `1048576` (1 MB) | Grens voor het **opgeslagen** bestand na opnieuw coderen. Een WebP van 512px is in de praktijk 20–100 kB, dus dit is een vangnet en geen UX-grens. De grens voor de **upload** zelf ligt in de route (Besluit 7). |

`allowed_mime_types` en `file_size_limit` worden door de Storage-API zelf
afgedwongen, ook voor de service-role-client. Ze zijn daarmee de laatste
server-side laag, los van de route.

**3. Padconventie:** `products/<product_id>/<uuid>.webp`. Bij elke upload
komt er een nieuwe willekeurige `uuid`, en het pad wordt nooit overschreven.
- Elke vervanging krijgt een nieuwe URL. Dat voorkomt een verouderde
  CDN-cache bij een publieke bucket. Daarom krijgt een object een lange,
  onveranderlijke `cacheControl` (een jaar).
- Paden zijn niet te raden. Er is geen lijst-policy (zie hieronder), dus
  ook niet op te sommen.
- Een check-constraint op `products.image_path` dwingt de vorm af
  (`^products/<uuid>/<uuid>\.webp$`, het eerste uuid gelijk aan `id`; dat
  laatste controleert de RPC, een constraint kan het ook). De exacte regex
  bepaalt de Developer.

**4. Geen policies op `storage.objects`** voor `anon` of `authenticated`,
voor geen enkele operatie (ADR 0018). Gevolg: RLS op
`storage.objects` blokkeert elke upload, wijziging of verwijdering met de
publishable key, ook voor een beheerder in een `aal2`-beheersessie. Er is
ook geen `select`-policy, dus objecten zijn via de API niet te zien of op te
sommen. Een publieke bucket serveert zijn objecten via
`/storage/v1/object/public/...` zonder RLS, en dat is precies wat het
verkoopscherm nodig heeft. Schrijven gebeurt alleen door de server-actie
hieronder, met de service-role-client, ná verificatie van de sessie.

Waarom geen `insert`-policy met een sessiecheck, zodat de browser direct kan
uploaden: zie ADR 0018 → Verworpen alternatieven. Kort gezegd zou de policy
de sessiecheck als `boolean`-functie met `EXECUTE` voor `authenticated`
nodig hebben, en dan zit de grens op twee plekken (policy en RPC) in plaats
van één. Daarnaast komt het MIME-type bij een directe upload uit de
`Content-Type`-header van de client, en kan dat niet server-side gedecodeerd
of geschaald worden.

## RPC's

**Nieuw: `set_product_image(p_product_id uuid, p_image_path text) returns
text`.** `security definer`, `set search_path = public`. De volgorde volgt
`update_product_price` (`0029`):

1. `perform require_beheer_session();` geeft de bestaande sessiecodes
   (`no_bar_session`, `session_ended`, `session_inactive`, `wrong_mode`,
   `no_bar_role`, `aal2_required`).
2. De ADR 0002-actorcheck, letterlijk zoals in `0029` (`select * into
   v_actor`, de rij-getypeerde vorm, zie assortimentbeheer.md →
   "Post-implementatie fix"), geeft `actor_not_found` of `no_admin_role`.
3. `select ... from products where id = p_product_id for update`, en anders
   `product_not_found`. Een gearchiveerd product mag een afbeelding krijgen,
   net zoals het een prijs mag krijgen (assortimentbeheer.md → Randgevallen).
4. `p_image_path` is `null`: de afbeelding weghalen. Anders moet het pad de
   vorm `products/<p_product_id>/<uuid>.webp` hebben, en anders volgt
   `invalid_image_path`. Daarna moet het object bestaan
   (`exists (select 1 from storage.objects where bucket_id =
   'product-images' and name = p_image_path)`), en anders volgt
   `image_not_found`. Zo kan een rechtstreekse RPC-aanroep door een
   beheerder (die altijd kan, zie Rolzichtbaarheid) geen pad naar een ander
   product of naar niets zetten. **Te verifiëren door de Developer:** dat de
   functie-eigenaar op het gehoste project `storage.objects` mag lezen.
   Lukt dat niet, dan vervalt de bestaanscheck (de padcheck blijft) en meldt
   de Developer dat in de PR. Dat is geen stille aanpassing.
5. `update products set image_path = p_image_path`. De functie geeft de
   **vorige** `image_path` terug (`null` als er geen was). Dezelfde waarde
   opnieuw zetten is een no-op en geeft die waarde terug. De aanroeper
   verwijdert dan niets (zie de server-actie, stap 6).

Waarom `returns text` en niet `returns products`, zoals de andere
product-RPC's: de server-actie moet weten welk bestand weg mag. Alleen de
waarde die de RPC onder de rijvergrendeling las, is zonder race de goede.
Lezen vóór de aanroep zou bij twee gelijktijdige vervangingen het verkeerde
bestand laten opruimen. De nieuwe productstaat kent de aanroeper al (die
stuurde het pad zelf mee).

Grants zoals in `0018_rpc_execute_alleen_authenticated.sql`: `revoke
execute on function set_product_image(uuid, text) from public, anon; grant
execute ... to authenticated;`. Twee bestaande gates bewaken dit
(`db:test`):
- `supabase/tests/rpc_execute_grants.test.sql` bewaakt `anon` en `PUBLIC`
  voor elke functie.
- `supabase/tests/rpc_catalogus.test.sql` faalt zolang de nieuwe functie niet
  in de catalogus staat. De regel wordt `('set_product_image', 'client',
  null)`: een client-functie met guard. Die indeling klopt alleen als
  `authenticated` `EXECUTE` heeft (test 2) en de functietekst
  `require_beheer_session(` bevat (test 3). Test 4 eist ook de
  `set search_path`.

Omdat `search_path` op `public` staat, verwijst stap 4 voluit naar
`storage.objects`.

**Bestaand, aangepast: geen.** `create_product`, `update_product_price` en
`set_product_archived` geven `products` terug, en die rij heeft na de
migratie vanzelf `image_path`. Hun SQL verandert niet.

**Geen nieuwe lees-RPC.** `image_path` gaat mee in de bestaande platte
`select`.

## Server-actie (ADR 0006-patroon, toegepast op Storage)

**Route Handler** `src/app/(bar)/beheer/productafbeelding/route.ts` (`POST`
voor uploaden en vervangen, `DELETE` voor weghalen), naast
`/beheer/invite`. Bewust een Route Handler en geen Server Action: een Server
Action heeft standaard een bodylimiet van 1 MB, en de route doet zelf geen
`.from()`/`.rpc()`/`.storage`-aanroep (`check:policy`). Alles staat in
**`src/lib/productImage.ts`**, het enige bestand dat `sharp` en
`src/lib/supabase/admin.ts` importeert voor deze feature. Dat bestand is
alleen voor de server (`check:arch` regel 4 bewaakt de `admin.ts`-import
vanuit client-code). De Developer mag de pure beeldverwerking (stap 2 en 3)
naar een eigen server-only module in `src/lib/` splitsen, zodat `test` die
zonder nepclients kan draaien. `sharp` blijft dan alleen in `src/lib/`.

`POST` (multipart: `productId`, `file`):
1. **Verificatie met de sessie-gebonden client** (`src/lib/supabase/server.ts`),
   in dezelfde volgorde als `inviteMember.ts` stap 1 en 1b: `getUser()`, dan
   het actor-lid met rol `beheerder`, dan `rpc("check_beheer_session")`. Dit
   gebeurt **vóór** er iets wordt gedecodeerd of geüpload. Een sessiecode
   gaat ongewijzigd terug naar de client. Let op: `inviteMember.ts`
   (`toMarkErrorCode`) maakt van zo'n code nu `unknown`. Dat deel niet
   overnemen.
2. **Invoer controleren:** `file` aanwezig, en anders `file_missing`. De
   grootte mag niet boven de uploadgrens liggen (Besluit 7), en anders
   `file_too_large`. Dit wordt eerst op `Content-Length` en `File.size`
   gecontroleerd, vóór het decoderen.
3. **Decoderen en opnieuw coderen met `sharp`** (Besluit 6). Het formaat
   komt uit `metadata()` (de echte bytes, niet de extensie of
   `Content-Type`) en moet in de allowlist staan: JPEG, PNG of WebP
   (Besluit 7). Anders volgt `unsupported_type`, ook als decoderen mislukt.
   Daarna: `rotate()` (EXIF-oriëntatie toepassen), schalen naar maximaal
   512 × 512 zonder bijsnijden (Besluit 4), uitvoer WebP. Metadata zoals
   EXIF en GPS gaat niet mee (`sharp` neemt die standaard niet over). Een
   bewegende afbeelding gaat terug naar het eerste frame. Een
   pixelgrensbeveiliging staat aan (`limitInputPixels`, de standaard van
   `sharp`) tegen decompressiebommen.
4. **Uploaden met de service-role-client** naar
   `products/<productId>/<randomUUID()>.webp`, met `contentType:
   "image/webp"`, `upsert: false` en een lange `cacheControl`. Mislukt dat,
   dan volgt `upload_failed`.
5. **`rpc("set_product_image", { p_product_id, p_image_path })` met de
   sessie-gebonden client**, nooit met de service-role-client (ADR 0006 →
   Beslissing punt 3: `auth.uid()` en `session_id` moeten van de beheerder
   zijn). Faalt de RPC, dan verwijdert de route het zojuist geüploade object
   (compenseren) en geeft de RPC-foutcode terug.
6. **Opruimen:** geeft de RPC een vorig pad terug dat verschilt van het
   nieuwe, dan verwijdert de route dat met de service-role-client
   (`storage.remove`). Direct `delete from storage.objects` in SQL kan niet:
   Supabase blokkeert dat, verwijderen moet via de Storage-API. Mislukt het
   opruimen, dan logt de route dat server-side en meldt alsnog succes. Het
   product klopt, er blijft alleen een weesbestand over (Besluit 13).
7. Antwoord `{ ok: true, imagePath }`, of `{ ok: false, errorCode }`.

`DELETE` (JSON `{ productId }`): stap 1, daarna stap 5 met `p_image_path =
null` en stap 6. Is er geen afbeelding, dan is het resultaat
`{ ok: true, imagePath: null }` (idempotent, zoals `set_product_archived`).

Foutcodes van de route: de sessiecodes uit `SESSION_ERROR_CODES`,
`actor_not_found`, `no_admin_role`, `product_not_found`, `file_missing`,
`file_too_large`, `unsupported_type`, `upload_failed` en `unknown`.
`invalid_image_path` en `image_not_found` horen via deze route nooit voor te
komen. Komen ze toch, dan worden ze `unknown` en gelogd.

**Nieuwe directe afhankelijkheid:** `sharp`, in `package.json` vastgezet op
de versie die `next` al meebrengt (vandaag 0.34.x volgens de lockfile). Er
komt dus geen tweede kopie. Draait alleen in de Node-runtime van de route.
Mag nooit in een `"use client"`-bestand belanden.

## Datalaag (client)

- **`useProducts()` en `useAlleProducten()`** selecteren ook `image_path` en
  geven `imageUrl: string | null` door. Dat is een toevoeging: filter,
  sortering en de rest van het contract blijven gelijk (assortimentbeheer.md
  → "Contract met #8's `useProducts()`" ging over filter en parameter, en
  wordt niet herzien). `Product` en `AssortimentProduct` krijgen elk het
  veld `imageUrl`.
- **Eén helper voor pad → URL**, in `src/hooks/queries/`
  (`supabase.storage.from("product-images").getPublicUrl(path)`, alleen
  stringwerk, geen netwerk). Die helper wordt gebruikt door beide leeshooks
  én door de drie bestaande mutatiehooks (`useCreateProduct`,
  `useUpdateProductPrice`, `useSetProductArchived`). Die mappen hun
  `products`-rij naar `AssortimentProduct`, en dat type krijgt `imageUrl`
  als verplicht veld. Sinds #126 past `ProductBeherenOverlay` na een
  prijswijziging of archivering alleen het gewijzigde veld toe, dus de
  afbeelding raakt daar niet meer kwijt. Een mutatiehook die toch een
  volledig `AssortimentProduct` teruggeeft, moet wel de echte `imageUrl`
  bevatten, en geen verzonnen `null`. Een tweede plek die de URL bouwt, is
  een reviewfout (CLAUDE.md → "Componenten zijn herbruikbaar"). Liefst één
  gedeelde mapper voor `products`-rij → `AssortimentProduct` voor alle vier
  de hooks. Hoe precies, beslist de Developer.
- **Nieuwe mutatiehook `useProductAfbeelding()`** met `upload(productId,
  file)` en `remove(productId)`, via `fetch("/beheer/productafbeelding")`.
  Zelfde vorm als `useSendMemberInvite.ts`: eigen `ErrorCode`-type,
  idle/pending/error, `reportClientError` alleen bij `unknown`, en
  sessiecodes via de bestaande centrale afhandeling (`isSessionErrorCode` en
  `notifySessionCode` uit `src/lib/barSessie.ts`, zoals
  `useAddShiftMember.ts`). In de overlay is de inline tekst voor een
  sessiecode leeg (`SESSION_CODE_INLINE_MESSAGE`), want de melding komt van
  `BarSessieProvider`. Na succes geeft de hook `imageUrl` terug (gemapt met
  dezelfde helper). Een HTTP 413 van Vercel heeft geen JSON-body. De hook
  vertaalt die status naar `file_too_large` vóór hij `response.json()`
  probeert (zie Randgevallen).
- Componenten en features roepen nooit `supabase.storage` aan. Dat wordt
  hard gemaakt in `check:policy` (zie Gates).

## Componenten

**Nieuw gedeeld component `src/components/ProductAfbeelding.tsx`.** Er
bestaat geen beeldcomponent, en hetzelfde vlak komt op vier plekken. Vaste
`size`-varianten naar de wireframe, net als `InitialsAvatar` (geen vrije
px-waarden bij de aanroeper):
- `"tile"`: verkoop-galerij, volle breedte × 92px, in het canvas-kader
  (Besluit 3).
- `"row"`: verkoop-lijst, 42px.
- `"beheerRow"`: beheer-lijst, 38px.
- `"detail"`: Product beheren, 52px.

Props: `imageUrl: string | null`, `name: string` (voor de lege staat en de
alt-tekst), `size`, en `decorative?: boolean`.

- Met afbeelding: `next/image` met `unoptimized` (de server levert al de
  juiste maat, en zo is er geen optimalisatiequotum van Vercel nodig) plus
  vaste `width`/`height` of `fill` en `loading="lazy"`. Een kale `<img>` laat
  `lint` falen (`@next/next/no-img-element` is een warning, en
  `--max-warnings=0`). Mocht `next/image` met `unoptimized` toch een
  `remotePatterns`-regel voor de Supabase-host eisen, dan voegt de Developer
  die toe in `next.config.mjs`, met als host de host uit
  `NEXT_PUBLIC_SUPABASE_URL`.
- `object-contain` op een canvas-achtergrond (Besluit 4).
- **Lege staat** (geen `imageUrl`, of de afbeelding laadt niet): zie
  Besluit 2. Laden mislukt (`onError`) betekent: zelfde lege staat, geen
  kapot-beeldicoon.

## Schermflow

**Verkoop (`Assortiment.tsx`).**
- Galerij: elke kaart krijgt bovenaan `ProductAfbeelding size="tile"`
  `decorative` (Besluit 1–3). De knop, de `aria-label` (`addLabel`) en de
  tik-op-de-hele-kaart blijven gelijk.
- Lijst: `size="row"` links van de naam, `decorative`.
- Geen invloed op mandje, afrekenen of `place_order`.

**Beheer, productenlijst (`ProductenLijst.tsx`).** `size="beheerRow"` links
in elke rij, `decorative`. Een gearchiveerd product behoudt zijn
afbeelding, gedempt zoals de rest van de rij.

**Beheer, Product beheren (`ProductBeherenOverlay.tsx`).**
- Kop (zoals de wireframe, r. 910): `ProductAfbeelding size="detail"` naast
  naam en categorie. Hier **niet** decoratief: alt `Afbeelding van {naam}`.
  Is er geen afbeelding, dan de lege staat met `aria-hidden`.
- Nieuw blok **"Afbeelding"**: een derde `OpslaanSectie` (met de standaard
  omlijsting, zoals "Prijs wijzigen"), met een titel en een korte
  toelichting met de toegestane types en de maximale grootte. Het blok staat
  bovenaan, direct onder de kop, boven de prijs ("Huidige prijs" en "Prijs
  wijzigen") en "Uit assortiment" (Besluit 14). Het blok volgt het
  pending-model van #126 ([`opslaan-sluiten-pending.md`](opslaan-sluiten-pending.md)
  → "Zoals gebouwd"), net als prijs en archief. Er komt geen eigen variant.
  - Zonder afbeelding de knop **"Afbeelding kiezen"**, met afbeelding
    **"Vervangen"** en **"Verwijderen"**.
  - "Kiezen" of "Vervangen" opent de bestandskiezer (`<input type="file"
    accept="image/jpeg,image/png,image/webp">`, met een zichtbaar label of
    een knop die het input aanstuurt, toetsenbord-bereikbaar, minimaal 44px
    tikdoel). Na een keuze start de upload meteen. Er is geen apart
    "Opslaan" en geen voorbeeld vóór het uploaden (Besluit 4: er is niets
    bij te snijden). Een gekozen bestand is dus nooit "onopgeslagen", en
    `onopgeslagen` blijft alleen `isPrijsOnopgeslagen(...)`.
  - Client-side voorcontrole op type en grootte, alleen voor de UX: een
    duidelijke melding zonder upload, in de foutregel van deze sectie. De
    server controleert opnieuw, wat de client ook toeliet. Een nieuwe keuze
    wist die melding.
  - **Serialisatie per product:** de upload- en verwijderstatus van
    `useProductAfbeelding()` telt mee in `busy`:
    `isBezig(priceBusy, archiveBusy, imageBusy)`. Zolang een van de drie
    loopt, zijn de andere twee secties disabled en tonen ze via
    `wachtOpAnder` "wacht tot de lopende wijziging klaar is". Dat geldt ook
    andersom: tijdens een prijs- of archiefwijziging kan er geen
    bestandskiezer open.
  - **Sluiten:** `useOpslaanBlokkade(busy)` (met time-out: Product beheren
    is een beheerdialoog zonder geld, #126 besluit 1) geeft `closeBlocked`
    voor Escape, backdrop en de knop "Sluiten". Na 30 s zonder antwoord valt
    de blokkade en staat `ONBEKENDE_UITKOMST_TEKST` bovenaan, zoals bij prijs
    en archief. Het verzoek wordt niet afgebroken.
  - **Bezig-tekst:** de ingedrukte knop toont tijdens het uploaden "Bezig met
    uploaden…" (de tekst uit deze spec) en tijdens het verwijderen
    `OPSLAAN_BEZIG_TEKST` ("Opslaan…", zoals de archiefknop). De sectie
    krijgt `aria-busy` via `OpslaanSectie`. Er komt geen eigen
    `aria-live`-regio: binnen de dialoog blijft de `role="status"` van
    `Overlay` de enige (Besluit 15).
  - **Na afloop:** bij succes past de overlay alleen het gewijzigde veld toe
    (`setProduct((current) => ({ ...current, imageUrl }))`), en verschijnt de
    nieuwe afbeelding in de kop. Daarna roept de overlay `onChanged()` aan
    (de lijst ververst), en blijft de overlay open. Bij een fout staat de
    Nederlandse melding in de eigen foutregel van de sectie (`fout` van
    `OpslaanSectie`), en een fout van prijs of archief verdringt die niet.
    De focus gaat daarna met `useHerstelFocus` naar een element dat in beide
    staten bestaat. "Afbeelding kiezen" en "Vervangen/Verwijderen" wisselen
    elkaar af, dus het mag niet de knop zijn die net verdween.
  - "Verwijderen" werkt zonder bevestigingsstap (Besluit 9), net als
    "Uit assortiment halen".
- Teksten per foutcode schrijft de Developer, in de stijl van
  `priceErrorMessage` en zonder ruwe fouttekst. Wel vast: `file_too_large`
  noemt de grens (bv. "dit bestand is te groot — maximaal 4 MB") en
  `unsupported_type` noemt de toegestane types ("kies een JPG, PNG of
  WebP").

**Nieuw product (`NieuwProductOverlay.tsx`).** Ongewijzigd: een afbeelding
komt pas na het aanmaken, via Product beheren (Besluit 8).

## Rolzichtbaarheid

- **Uploaden, vervangen, verwijderen:** alleen een `beheerder` in een sessie
  in modus `beheer` met `aal2` (ADR 0002, 0003, 0016 en 0017). Dit wordt
  twee keer afgedwongen: in de route (`check_beheer_session` en de
  actorcheck, vóór enige verwerking) en in `set_product_image`
  (`require_beheer_session` en de actorcheck). Storage zelf staat geen
  enkele schrijfactie toe vanuit een API-rol. Een PIN-sessie (altijd modus
  `bar`) krijgt `wrong_mode`. Een bardienst krijgt `no_admin_role`.
- **Zien in de app:** iedereen die producten ziet (bar-sessies, beheer). Een
  lid ziet geen producten in de portal, dus ook geen afbeeldingen.
- **Zien buiten de app (publieke bucket, Besluit 5):** wie de URL heeft,
  kan het bestand openen zonder in te loggen. De URL bevat twee
  willekeurige uuid's en er is geen lijst-API, dus raden of opsommen lukt
  niet. Wel kan een URL die eenmaal gedeeld is, niet worden ingetrokken
  zonder het bestand te vervangen. Dat is acceptabel voor een foto van een
  flesje bier en **niet** voor iets persoonsgebondens. ADR 0018 legt die
  grens vast voor een volgende bucket.
- **Rechtstreekse RPC-aanroep:** een beheerder kan `set_product_image` ook
  buiten de route aanroepen. De pad- en bestaanscheck (RPC stap 4) beperkt
  dat tot een object dat al in de bucket staat onder het eigen product, en
  zo'n object kan alleen via de route ontstaan.

## Randgevallen

- **Upload slaagt, RPC faalt** (sessie net verlopen, product net
  verdwenen): de route verwijdert het nieuwe object en geeft de RPC-code
  terug. Mislukt ook dat, dan blijft er een weesbestand (gelogd, Besluit
  13).
- **RPC slaagt, oud bestand verwijderen faalt:** succes voor de gebruiker,
  weesbestand, gelogd.
- **Twee beheerders vervangen tegelijk:** `for update` in de RPC zet ze op
  volgorde. Elke aanroep krijgt zijn eigen voorganger terug en ruimt die op.
  De eindstaat is de laatste upload en er blijft geen weesbestand over.
- **Product gearchiveerd:** de afbeelding blijft staan (archiveren is
  omkeerbaar) en blijft in de beheer-lijst zichtbaar. Een afbeelding zetten
  of weghalen mag ook bij een gearchiveerd product (Besluit 13).
- **Product verwijderen:** bestaat niet (assortimentbeheer.md → "Geen echte
  delete"), dus er is geen opruimpad nodig.
- **Pad in de database, bestand weg** (handmatig verwijderd in Studio):
  `onError` toont de lege staat. Opnieuw uploaden herstelt het. De RPC geeft
  het oude pad terug, het verwijderen daarvan mislukt onschuldig of doet
  niets.
- **Bestand te groot:** client-melding vóór de upload. Komt het toch door,
  dan weigert de route vóór het decoderen (`file_too_large`). Boven 4,5 MB
  weigert Vercel de request al voordat de route draait. De hook vertaalt
  zo'n status 413 ook naar `file_too_large` en niet naar `unknown`.
- **Verkeerd of vals type** (SVG, HEIC, PDF, of een HTML-bestand hernoemd
  naar `.png`): `sharp` herkent het formaat niet of het staat niet in de
  allowlist, dus `unsupported_type`. SVG komt nooit in de bucket (geen
  scriptrisico). Wat in de bucket staat, is altijd een WebP die de server
  zelf heeft gemaakt.
- **Een iPad-foto in HEIC:** iOS Safari zet die bij een
  `accept`-lijst zonder HEIC zelf om naar JPEG vóór de upload. Op desktop
  geeft een HEIC-bestand `unsupported_type`, met de melding welke types wel
  mogen.
- **Heel kleine afbeelding** (bv. 40 × 40): wordt niet vergroot
  (`withoutEnlargement`) en staat klein in een groter vlak. Geen
  minimumformaat in deze scope.
- **Transparante PNG:** WebP behoudt de transparantie, met de
  canvas-achtergrond van het vlak eronder.
- **Sessie verloopt tijdens het kiezen van een bestand:** de route geeft een
  sessiecode, de centrale afhandeling (`BarSessieProvider`) doet de rest.
- **Upload duurt langer dan 30 s** (traag netwerk op de bar, 4 MB): de
  time-out van #126 laat `closeBlocked` vallen en toont
  `ONBEKENDE_UITKOMST_TEKST`. De knoppen blijven disabled zolang het verzoek
  loopt, want `busy` volgt de hook en niet de time-out. Er kan dus geen
  tweede upload starten. Komt het antwoord later, dan verwerkt de overlay
  het gewoon. Sluit de beheerder de overlay eerder, dan maakt de route het
  werk toch af (inclusief compenseren en opruimen). Na opnieuw openen toont
  de lijst de werkelijke staat.
- **e2e-mocks en seed:** bestaande mocks van `products`-rijen hebben geen
  `image_path`. De hooks moeten een ontbrekend veld als `null` behandelen en
  mogen daar niet op falen. De seed krijgt geen afbeeldingen (objecten
  komen via de Storage-API in de bucket, niet via `seed.sql`), dus lokaal
  en in CI is de lege staat de standaard.

## Gates

Gevonden bij het lezen van de scripts. Vandaag dekt geen enkele gate
Storage.

- **`check:rls`** (`scripts/check-rls.mjs`) zoekt alleen naar `create table`
  in onze eigen migraties. Per tabel controleert het RLS en of de tabelnaam
  ergens in `supabase/tests/` voorkomt. Policies zelf telt het niet, ook al
  noemt de CLAUDE.md-tabel "elke policy een negatieve test".
  `storage.buckets` en `storage.objects` maakt Supabase zelf aan, dus een
  bucket of een policy op `storage.objects` wordt nooit gecontroleerd.
  Uitbreiding in deze feature:
  1. Elke `insert into storage.buckets` in de migraties moet
     `file_size_limit` én `allowed_mime_types` noemen.
  2. Elke bucket-id die zo wordt aangemaakt, moet in `supabase/tests/`
     voorkomen.
  3. Elke `create policy <naam> on storage.objects` moet met zijn naam in
     `supabase/tests/` voorkomen. Op de tabelnaam controleren zegt hier
     niets, want `storage.objects` staat na deze feature altijd in een test.
     Daarom de policynaam. Na deze feature bestaat zo'n policy niet, dus de
     regel bewaakt een volgende feature. De policyregel voor gewone tabellen
     valt buiten deze scope.
- **`check:policy`** (`scripts/check-policy.mjs`) vangt
  `supabase.from(`/`supabase.rpc(`, maar niet `supabase.storage.from(` (na
  `supabase.` staat dan `storage`). Uitbreiding: elk `.storage.from(` (welke
  variabelenaam er ook voor staat) buiten `src/hooks/queries/` en
  `src/lib/` is een fout.
- **`rpc_catalogus`** (`db:test`): geen uitbreiding van de gate, alleen de
  catalogusregel voor `set_product_image` (zie RPC's). Zonder die regel is
  `db:test` rood.
- **CLAUDE.md → Verificatie-tabel:** de rijen `check:rls` ("… elke bucket
  een type- en groottelimiet, elke storage-policy een negatieve test") en
  `check:policy` ("geen queries of storage-aanroepen buiten de datalaag")
  worden bijgewerkt in dezelfde PR, omdat de gate nu echt bestaat. Er komt
  geen nieuwe regel in CLAUDE.md voor iets wat het script afdwingt.

## Tests (voor de Tester)

`supabase/tests/productafbeeldingen.test.sql` (pgTAP):
- **Bucket:** `product-images` bestaat, met `public`, `file_size_limit` en
  `allowed_mime_types` exact zoals besloten.
- **Invariant, voor álle buckets:** `pg_policies` heeft geen policy op
  `storage.objects` met `cmd` in `INSERT`, `UPDATE`, `DELETE` of `ALL`. Net
  als `rpc_execute_grants.test.sql` toetst dit de regel uit ADR 0018 over
  het geheel, niet over een handgetypte lijst.
- **Direct schrijven naar Storage geweigerd:** als `authenticated` met
  beheer- en `aal2`-claims (de sterkste sessie die er is), en als `anon`:
  `insert into storage.objects (bucket_id, name, …)` geeft 42501 (RLS).
  `update` en `delete` raken 0 rijen of worden geweigerd. De exacte vorm
  bepaalt de Tester, inclusief de delete-beveiliging van Supabase zelf.
- **`products.image_path` direct schrijven geweigerd:** `update products set
  image_path = …` als `authenticated` geeft `permission denied for table
  products`.
- **`set_product_image`:** zonder sessie `no_bar_session`, bar-modus
  `wrong_mode`, beheer op `aal1` `aal2_required`, een bardienst-actor
  `no_admin_role` (of de sessiecode die `require_session` eerder geeft),
  een onbekend product `product_not_found`, een pad van een ander product,
  een verkeerde extensie of `../` `invalid_image_path`, een geldig pad
  zonder object `image_not_found`. Daarnaast de gewone gevallen: eerste keer
  zetten geeft `null` terug, vervangen geeft het vorige pad terug,
  `null` geeft het vorige pad terug en maakt de kolom leeg, en een
  gearchiveerd product mag. Objecten voor de testopzet worden als
  `postgres` in `storage.objects` gezet.
- `rpc_execute_grants.test.sql` dekt `anon`/`PUBLIC` automatisch.
  `rpc_catalogus.test.sql` krijgt de catalogusregel (zie RPC's).

Overig:
- `test` (`node --test`, `test/**/*.test.ts`):
  - De pure client-voorcontrole (type, grootte).
  - De beeldverwerking op fixtures: een JPEG met EXIF-rotatie wordt
    rechtop, een PNG van 3000px wordt maximaal 512px WebP, een SVG of een
    als `.png` vermomd tekstbestand wordt `unsupported_type`, en een bestand
    boven de grens wordt `file_too_large` zonder te decoderen.
  - De volgorde in `src/lib/productImage.ts`, met nepclients zoals
    `test/inviteMember.test.ts` (`register(...)` met een resolve-hook in
    `test/fakes/`):
    - een sessiecode of `no_admin_role` betekent geen decode, geen upload en
      geen RPC;
    - faalt de RPC, dan wordt het nieuwe object verwijderd;
    - het vorige pad wordt opgeruimd, maar niet als het gelijk is aan het
      nieuwe;
    - een mislukte opruimstap geeft toch `ok`.
- e2e (Playwright, vertraagde routes via `page.route`, zoals
  `e2e/opslaan-sluiten-pending.spec.ts`):
  - een vertraagde upload blokkeert Escape, backdrop en Sluiten, en zet
    prijs en archief op disabled met de wacht-uitleg;
  - een vertraagde prijswijziging zet de afbeeldingsknoppen op disabled;
  - een fout van de upload blijft staan naast een fout van de prijs;
  - de focus komt nooit op `body` terecht.
- `check:a11y`: Product beheren met het afbeeldingsblok (met en zonder
  afbeelding), en de verkoop-galerij met de lege staat. Product beheren heeft
  sinds #126 alleen een axe-scan in pending-toestand
  (`e2e/opslaan-sluiten-pending.spec.ts`). `e2e/a11y.spec.ts` heeft nog
  steeds geen scenario voor de overlays van assortimentbeheer
  (assortimentbeheer.md → Randgevallen). Dit is het moment om dat in te
  halen.
- Handmatig of e2e, niet in `test` of pgTAP: de Route Handler zelf (parsing
  van multipart en `Content-Length`) en de echte Storage-API (limieten van
  de bucket, `storage.remove`). Zelfde gat als ADR 0006 → Gevolgen voor de
  `auth.admin`-aanroep.

## Expliciet buiten scope

- Meer dan één afbeelding per product, galerij of zoomweergave.
- Bijsnijden of uitsnede kiezen in de app (Besluit 4).
- Afbeeldingen in de portal, in het mandje, in de afrekenbevestiging of in
  het logboek.
- Een automatische opruimtaak voor weesbestanden. pg_cron kan dat niet:
  verwijderen moet via de Storage-API (Besluit 13).
- Supabase Image Transformations (alleen op betaalde plannen) en de
  beeldoptimalisatie van Vercel: de server levert de juiste maat al.
- Een alt-tekstveld per product (Besluit 11).
- Afbeeldingen in de seed of in de demo-data.
- Offline beschikbaarheid of caching door een service worker (CLAUDE.md →
  Shells: bewust uitgesteld).

## Bij akkoord bijgewerkt (2026-10-02)

- ADR 0018 staat op geaccordeerd. `docs/ARCHITECTURE.md` heeft de entry
  "Bestandsopslag (Storage)". ADR 0006 → "Reikwijdte" verwijst naar ADR
  0018.

Nog te doen bij de bouw, door de Developer:
- Het commentaar in `Assortiment.tsx` ("Geen productfoto's …") vervalt.
- Het kopcommentaar van `src/lib/supabase/admin.ts` (nu: alleen
  `auth.admin.*`) krijgt Storage-schrijfacties erbij, met een verwijzing
  naar ADR 0018.
- De Verificatie-tabel in CLAUDE.md voor `check:rls` en `check:policy`,
  zie Gates. Dat zijn wijzigingen binnen bestaande rijen, geen nieuwe
  regels. CLAUDE.md staat al boven de ~100 regels.
- De catalogusregel voor `set_product_image` in
  `supabase/tests/rpc_catalogus.test.sql`.
- `docs/ARCHITECTURE.md` → "Dienst per sessie, fase 1" → *Server*: daar
  staat dat alleen `barLogin.ts` en `inviteMember.ts` de
  service-role-client gebruiken. `productImage.ts` komt erbij.

## Besluiten van Bram (2026-10-02)

Bram koos bij elke vraag de aanbeveling van de Architect. De verworpen
alternatieven blijven hieronder staan als motivatie. Ze zijn niet open.

1. **Waar is de afbeelding te zien?**
   *Besloten:* op de vier plekken uit de wireframe: de verkoop-galerij,
   de verkoop-lijst, de beheer-productenlijst en de kop van Product beheren.
   Niet in de portal.
   *Verworpen alternatief:* alleen de verkoop-galerij (minder werk, beheer ziet de
   afbeelding dan alleen in Product beheren). Of ook in de portal-transacties
   (vraagt eerst productregels in de portal, een eigen feature).

2. **Wat toont een product zonder afbeelding?**
   *Besloten:* een neutraal vlak in dezelfde maat (canvas-kleur) met de
   eerste letter(s) van de productnaam (`initials()`), `aria-hidden`. Zo
   blijven kaarten in de galerij even hoog, ook als maar een deel van de
   producten een foto heeft. Dit volgt de lege staat van de wireframe, die
   daar de naam toont.
   *Verworpen alternatief A:* geen vlak zonder afbeelding (de kaart blijft zoals nu),
   met als nadeel ongelijke kaarthoogtes in een gemengde galerij.
   *Verworpen alternatief B:* een vast icoon per categorie (vraagt zes iconen en een
   koppeling van categorie naar icoon, terwijl categorieën vrije tekst zijn).

3. **Hoe groot wordt het vlak in de galerij?**
   *Besloten:* zoals de wireframe: volle kaartbreedte × 92px. Een kaart
   wordt dan ongeveer 170px hoog in plaats van ongeveer 66px, dus er passen
   minder producten op het scherm zonder scrollen. De bestaande schakelaar
   naar "lijst" (42px-vlak) blijft de compacte weergave.
   *Verworpen alternatief:* een kleiner vlak in de galerij (bv. 56px, links van naam
   en prijs), zodat de galerij bijna even compact blijft als nu.

4. **Beeldverhouding en bijsnijden?**
   *Besloten:* niet bijsnijden. De server schaalt naar maximaal
   512 × 512 met behoud van verhouding, en het vlak toont de afbeelding
   passend (`object-contain`) op de canvas-achtergrond. Een flesje blijft
   dan heel en de beheerder hoeft niets te kaderen.
   *Verworpen alternatief A:* de server snijdt vierkant uit het midden en het vlak
   vult (`object-cover`). Strakker, maar een staande fles verliest boven en
   onder, vooral in het brede galerij-vlak.
   *Verworpen alternatief B:* een uitsnede-tool in de app (aanzienlijk meer werk,
   buiten scope voor een eerste versie).

5. **Publieke of private bucket?**
   *Besloten:* publiek. Productfoto's zijn niet gevoelig. Een publieke
   URL wordt via het CDN gecachet, verloopt nooit (een bar-tablet staat uren
   open) en vraagt geen extra leesrecht op `storage.objects`. De paden zijn
   niet te raden en er is geen lijst-API.
   *Verworpen alternatief:* privé met signed URL's. Dan is er een `select`-policy op
   `storage.objects` voor `authenticated` nodig, de leeshooks moeten URL's
   ondertekenen, en de tablet moet ze vóór het verlopen verversen. Dat is
   extra code en extra policy-oppervlak zonder dat er iets geheims te
   beschermen valt.

6. **Server-side opnieuw coderen met `sharp` (nieuwe directe
   afhankelijkheid)?**
   *Besloten:* ja. De upload gaat via `/beheer/productafbeelding`, de
   server decodeert de echte bytes, schaalt, haalt EXIF en GPS eraf en slaat
   altijd een WebP op die hij zelf maakte. `sharp` zit al in de lockfile
   (via `next`) en in `scripts/generate-pwa-icons.mjs`.
   *Verworpen alternatief:* de browser uploadt direct naar Storage (een
   `insert`-policy met sessiecheck), met alleen de bucket-limieten
   (`allowed_mime_types` op basis van de `Content-Type` van de client) en
   eventueel schalen in de browser. Geen nieuwe afhankelijkheid, maar het
   type wordt dan niet echt gecontroleerd, metadata gaat mee, en de
   beheergrens zit op twee plekken (policy en RPC). Zie ADR 0018 →
   Verworpen alternatieven.

7. **Maximale uploadgrootte en toegestane types?**
   *Besloten:* 4 MB per bestand, JPEG, PNG en WebP. Productie draait op
   Vercel, dat een request-body boven 4,5 MB weigert vóór de route draait.
   Met 4 MB blijft de eigen, Nederlandse foutmelding altijd zichtbaar. Geen
   HEIC (`sharp` leest het niet standaard; iOS Safari zet het zelf om naar
   JPEG), geen GIF, geen SVG.
   *Verworpen alternatief A:* een lagere grens (2 MB) als extra rem. Dan moeten
   telefoonfoto's vaker eerst verkleind worden.
   *Verworpen alternatief B:* de browser verkleint eerst (canvas, bv. naar 1600px),
   zodat ook grote camerafoto's passen. Prettiger voor foto's van een
   telefoon of iPad, maar extra client-logica.

8. **Ook een afbeelding kiezen bij "Nieuw product"?**
   *Besloten:* nee, in deze eerste versie alleen via Product beheren. Het
   product moet eerst bestaan (het pad bevat het product-id), en een
   gecombineerde stap vraagt afhandeling van "product aangemaakt, upload
   mislukt".
   *Verworpen alternatief:* een optioneel afbeeldingsveld in Nieuw product, dat ná
   een geslaagde `create_product` de upload start, met een aparte melding
   als alleen de upload mislukt.

9. **Bevestiging bij "Verwijderen"?**
   *Besloten:* geen bevestigingsstap, net als "Uit assortiment halen".
   Een afbeelding is opnieuw te uploaden.
   *Verworpen alternatief:* een korte bevestiging ("Afbeelding verwijderen?"), omdat
   het bestand echt weg is en de beheerder het origineel misschien niet
   meer heeft.

10. **Een ADR voor bestandsopslag?**
    *Besloten:* ja, ADR 0018. Dit is de eerste
    bucket, en de regels "schrijven alleen server-side, geen schrijfpolicies
    op `storage.objects`, publiek alleen voor niet-persoonsgebonden beeld"
    zijn precies wat een volgende feature (bv. profielfoto's van leden) zou
    kunnen tegenspreken.
    *Verworpen alternatief:* geen eigen ADR, maar een "Aanvulling" op ADR 0006 (zoals
    die van 2026-09-21), omdat het hetzelfde server-actiepatroon is. Dan
    staat de regel over publiek versus privé nergens als besluit vast.

11. **Alt-tekst: een veld per product of afgeleid?**
    *Besloten:* geen veld. Op het verkoopscherm en in de beheer-lijst is
    de afbeelding decoratief (`alt=""`): de productnaam staat er direct
    naast en zit al in de `aria-label` van de knop, dus een alt-tekst zou
    alles dubbel laten voorlezen. In Product beheren is de alt-tekst
    `Afbeelding van {naam}`.
    *Verworpen alternatief:* een optioneel veld "Beschrijving afbeelding" per product
    (nieuwe kolom, en de RPC krijgt een parameter erbij). Alleen zinvol als
    afbeeldingen informatie gaan dragen die niet in de naam staat.

12. **Gate-uitbreiding (`check:rls`, `check:policy`) in dezelfde PR?**
    *Besloten:* ja. Zonder die uitbreiding komt de eerste bucket binnen
    zonder dat een gate hem ziet, en dat is precies het gat dat CLAUDE.md →
    "Regel over regels" wil voorkomen.
    *Verworpen alternatief:* een apart ticket direct na deze feature. Tot die tijd
    bewaakt alleen de review dat de bucket limieten heeft en dat
    `.storage`-aanroepen in de datalaag blijven.

13. **Opruimen en weesbestanden?**
    *Besloten:* opruimen bij vervangen en verwijderen (in de route). De
    afbeelding blijft staan bij archiveren. Een weesbestand na een mislukte
    opruimstap wordt geaccepteerd en gelogd, en is zo nodig handmatig in
    Studio op te ruimen. Geen automatische opruimtaak.
    *Verworpen alternatief:* een periodieke opruimtaak (een server-route die objecten
    zonder `products.image_path` verwijdert, aangeroepen door een cron van
    Vercel). Of de afbeelding ook verwijderen bij archiveren, wat betekent
    dat terugzetten in het assortiment ook een nieuwe upload vraagt.

## Aanvullende besluiten van Bram (2026-10-02, bij de bouw)

14. **Waar staat het afbeeldingsblok in Product beheren?**
    *Besloten:* het blok "Afbeelding" (uploaden, vervangen, verwijderen) is
    een eigen `OpslaanSectie` bovenaan, direct onder de kop met de
    52px-afbeelding, en boven de prijs ("Huidige prijs" en "Prijs
    wijzigen") en "Uit assortiment". Dit
    vult het punt in dat Schermflow aan de Developer liet.

15. **Hoe wordt "Bezig met uploaden…" aangekondigd?**
    *Besloten:* als label van de ingedrukte knop, met `aria-busy` op de
    sectie via `OpslaanSectie`, zoals bij #126. Geen eigen
    `aria-live`-regel. Dit bevestigt wat Schermflow → "Bezig-tekst" al
    beschrijft.

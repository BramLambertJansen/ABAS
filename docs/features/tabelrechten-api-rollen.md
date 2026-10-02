# Tabelrechten van API-rollen: geen rechten die RLS omzeilen

**Status: goedgekeurd door Bram (2026-10-02), nog niet gebouwd.** Het
akkoord is via de coördinator doorgegeven. Bram volgde bij alle vijf vragen
de aanbeveling van de Architect en koos nergens het alternatief. De vragen
en antwoorden staan onder "Besluiten van Bram". Verwijzingen als
"(Besluit 2)" in de tekst wijzen daarnaar. De Developer kan beginnen. Eén
voorwaarde ligt bij Bram zelf: de controle op het gehoste project vóór
`supabase db push` (zie Migratie `0039`). Wijkt de bouw af van een besluit,
dan gaat dat terug naar de Architect en wordt het niet zelf ingevuld.

Gevonden bij de review van PR #146 (productafbeeldingen, gemerged als
`7efc6ad`) door Tester en Reviewer. Nog geen issuenummer. Geschreven tegen
`origin/main` `7efc6ad`.

Er komt een nieuwe architectuurbeslissing bij:
[ADR 0019](../adr/0019-api-rollen-geen-rls-omzeilende-tabelrechten.md)
(Besluit 5).

## Aanleiding (lokaal geverifieerd)

Alles hieronder is op de gedeelde lokale database gecontroleerd met
read-only queries of in een transactie met `rollback`. De lokale database
staat op migratie `0037` (`0038` is er nog niet op gezet). Voor de
tabelrechten maakt dat geen verschil; voor de bucket wel (zie Randgevallen).

**1. API-rollen hebben TRUNCATE, REFERENCES en TRIGGER op bijna elke tabel.**
De standaardrechten van Supabase (`pg_default_acl` voor de rol `postgres` in
`public`) geven elke nieuwe tabel `arwdDxt` voor `anon`, `authenticated` en
`service_role`. Onze migraties trekken `insert, update, delete` in, en soms
`select`, maar `D` (TRUNCATE), `x` (REFERENCES) en `t` (TRIGGER) bijna nooit.
Stand van nu:

| Tabel | `anon` | `authenticated` |
|---|---|---|
| `orders`, `order_lines`, `top_ups`, `order_reversals`, `products`, `shifts`, `shift_members`, `activity_types`, `app_settings` | `arwdDxt` | `rDxt` |
| `members` | `arwdDxt` | `Dxt` (`select` is kolomgewijs, `0009`/`0010`) |
| `bar_sessions`, `shift_sessions`, `admin_notifications` | geen | `r` (`0027` r. 216–219) |
| `bar_devices`, `bar_device_members`, `pin_failures`, `client_errors`, `login_throttle` | geen | geen (`revoke all`) |
| `storage.objects`, `storage.buckets`, `storage.buckets_analytics` | `arwdDxt` | `arwdDxt` |

Wat elk recht doet, voor wie willekeurige SQL als `authenticated` kan
draaien:
- **TRUNCATE** leegt een tabel zonder RLS en zonder rij-triggers. `begin;
  set local role authenticated; truncate storage.objects; rollback;` slaagt.
  Dat omzeilt ook `storage.protect_delete` (een `BEFORE DELETE`-trigger, geen
  `BEFORE TRUNCATE`). Op `orders` of `top_ups` wist het de historie.
- **TRIGGER** laat de rol een trigger aan de tabel hangen met een
  bestaande triggerfunctie waarop hij `EXECUTE` heeft. Geverifieerd:
  `authenticated` kan `create trigger ... before insert on public.orders for
  each statement execute function storage.protect_delete()` uitvoeren. Daarna
  faalt elke `place_order` (de bar ligt stil) tot iemand de trigger weghaalt.
- **REFERENCES** laat de rol een foreign key naar de tabel maken. Dat vraagt
  ook `CREATE` op een schema, en dat heeft geen API-rol (`public`, `storage`,
  `extensions`, `graphql_public`: allemaal `false`). Vandaag niet te
  misbruiken, maar zonder nut.

Geen van de drie heeft een API-pad: PostgREST en pg_graphql kennen geen
TRUNCATE of DDL, `storage` staat niet in `api.schemas`, en elke RPC voert
vaste SQL uit (alle functies in `public` behalve `bar_inactivity_limit` zijn
`security definer` en draaien als `postgres`). Dit is dus defense-in-depth.
De bestaande regel "geldtabellen REVOKED" in `check:rls` eist alleen een
`revoke ... from authenticated`, en zegt niets over deze drie rechten.

**2. De storage-regels in `check:rls` zijn lexicaal.** `scripts/check-rls.mjs`
r. 64–105 zoekt naar `insert into storage.buckets`. Een `insert into
"storage"."buckets"` of een latere `update storage.buckets set
file_size_limit = null` glipt erlangs. Daarbij zijn `file_size_limit` en
`allowed_mime_types` in `storage.buckets` nullable (`is_nullable = YES`).

**3. Nieuw gevonden bij het uitzoeken: een `revoke` op de storage-tabellen
doet niets.** `storage.objects` en `storage.buckets` zijn eigendom van
`supabase_storage_admin`. Die rol gaf `anon` en `authenticated` hun rechten.
`postgres` (de rol van de migraties) is geen lid van `supabase_storage_admin`
(`set role supabase_storage_admin` geeft `permission denied`) en heeft alleen
rechten met grant option (`postgres=a*r*w*d*D*x*t*`). Postgres trekt bij een
`revoke` door een niet-eigenaar alleen in wat die rol zelf gaf. Geverifieerd
in een transactie: `revoke truncate, references, trigger on storage.objects,
storage.buckets from anon, authenticated` meldt `REVOKE` zonder fout of
waarschuwing, en de ACL is daarna ongewijzigd. Een migratie met die regel zou
dus groen draaien en niets doen. Alleen een database-invariant ziet dat.

Wat `postgres` wel kan op die tabellen: een trigger aanmaken (het heeft
`TRIGGER` met grant option). Geverifieerd in een transactie: een `BEFORE
TRUNCATE ... FOR EACH STATEMENT`-trigger op `storage.objects` met een
triggerfunctie zonder `EXECUTE` voor API-rollen laat `truncate
storage.objects` als `authenticated` falen. Een triggerfunctie heeft bij het
afgaan geen `EXECUTE` van de aanroeper nodig.

## Onderzocht

**Wireframe:** niet van toepassing. Geen scherm, geen tekst, geen gedrag in
de app.

**Bestaande code en migraties.**
- `0027_bar_sessies_datamodel.sql` r. 211–219 is het enige precedent: `revoke
  insert, update, delete, truncate, references, trigger on bar_sessions,
  shift_sessions, admin_notifications from authenticated`, met de motivatie
  "RLS alleen is niet genoeg tegen een latere policy per ongeluk".
- `0018_rpc_execute_alleen_authenticated.sql` is hetzelfde probleem voor
  functies: een standaardrecht van het platform dat geen migratie introk.
  Opgelost met een intrekking voor alles wat bestaat, plus `alter default
  privileges` voor wat komt, plus een tellende pgTAP-invariant
  (`supabase/tests/rpc_execute_grants.test.sql`). Deze spec volgt dat
  patroon. ARCHITECTURE.md → "RPC-grens gold niet voor sessieloze
  aanroepers" beschrijft het.
- `supabase/tests/rpc_catalogus.test.sql` eist dat elke functie in `public`
  ingedeeld is. De nieuwe triggerfunctie (Besluit 1) valt daaronder.
- `supabase/tests/productafbeeldingen_negatief.test.sql` r. 98 maakt binnen
  zijn eigen transactie een bucket zonder limieten aan (`pan-ander`). Dat
  bijt een bucket-invariant niet, zolang die in een eigen bestand staat.
- Geen enkele migratie, test, seed of script gebruikt `truncate` (alleen
  `0027` noemt het in een `revoke`). Er zijn geen triggers op tabellen in
  `public`.
- `supabase/config.toml`: `api.schemas = ["public", "graphql_public"]`.

**Kaders.**
- CLAUDE.md → Architectuurbeslissingen: "Geld beweegt alleen via RPC", met
  het `REVOKE` op geldtabellen als technische afdwinging. Deze spec maakt
  dat `REVOKE` volledig. Hij verandert niets aan de RPC's.
- CLAUDE.md → Regel over regels: wat een gate kan afdwingen, wordt een gate.
  De invariant hieronder is die gate. `check:rls` blijft een structurele
  scan zonder database.
- ADR 0018 → punt 3 en 6: elke bucket in een migratie, met `file_size_limit`
  en `allowed_mime_types`, bewaakt door `check:rls`. Deze spec verplaatst de
  echte bewaking van punt 3 naar de database. ADR 0018 verandert niet.
- Open PR's #148 en #137 raken geen bestanden onder `supabase/`. Geen
  andere remote branch heeft een migratie `0039` of hoger.

## Doel

Geen API-rol (`anon`, `authenticated`) kan een tabel legen, er een trigger
aan hangen of ernaar verwijzen, ook niet met willekeurige SQL. Dat geldt voor
elke tabel die er nu is en voor elke tabel die een migratie later toevoegt.
Elke bucket heeft een werkzame type- en groottelimiet. Beide eigenschappen
worden in de database getoetst, niet in de broncode van de migraties.

## Betrokken shell(s)

Geen. Er verandert niets in `shells/bar`, `shells/portal`, `src/features/`,
`src/components/` of `src/hooks/queries/`. De app gebruikt geen van de
ingetrokken rechten.

## Geldlaag en attributie

**Raakt het geld: nee.** Deze spec verandert geen RPC, geen bedrag, geen
saldocontrole en geen `served_by`. De motivatie:
- `place_order`, `top_up`, `reverse_order_at_bar` en `reverse_order_as_admin`
  zijn `security definer` en draaien als hun eigenaar `postgres`. Een
  `revoke` op `anon` of `authenticated` raakt die rechten niet.
- De ingetrokken rechten (TRUNCATE, REFERENCES, TRIGGER) gebruikt geen enkele
  code. De client heeft op geldtabellen al sinds `0001` alleen `select`, en
  die blijft (zie Gates: "de intrekking mag niet te ver gaan").
- Het effect op geld is alleen beschermend: `truncate orders` of een trigger
  die `place_order` blokkeert, kan na deze migratie niet meer. Dat is een
  aanvulling op het `REVOKE` uit CLAUDE.md → "Geld beweegt alleen via RPC",
  geen uitzondering erop.
- Attributie (`served_by` uit de bezetting) raakt dit niet. Er wordt geen
  functie en geen policy aangepast.

## Migratie `0039`

Het volgende vrije nummer is `0039` (hoogste op `origin/main` is `0038`;
`0013` bestaat niet en blijft leeg, zie `check:migrations`). Naam
bijvoorbeeld `0039_api_rollen_geen_rls_omzeilende_rechten.sql`. De
migratie-eigenaar is `postgres`: alle tabellen in `public` zijn van
`postgres`, en `supabase db push` en de lokale `supabase start` draaien de
migraties als die rol.

**1. `public`: intrekken voor wat er is.**
`revoke truncate, references, trigger on all tables in schema public from
public, anon, authenticated;` Lokaal geverifieerd in een transactie: dit
werkt, `orders` gaat daarna van `anon=arwdDxt`/`authenticated=rDxt` naar
`anon=arwd`/`authenticated=r`. `all tables in schema` dekt ook views en
foreign tables (die er nu niet zijn), geen sequences. `PUBLIC` staat erbij
omdat de invariant ook naar `PUBLIC` kijkt; het heeft er vandaag geen
rechten.

Daarbij, breed (Besluit 2):
- `revoke all on all tables in schema public from anon;` `anon` houdt op
  geen enkele relatie in `public` nog een recht. Alle policies zijn `to
  authenticated`, dus `anon` las en schreef hier al niets; RLS is daarmee
  niet langer de enige laag.
- `revoke all on all sequences in schema public from public, anon,
  authenticated;` Alle functies behalve `bar_inactivity_limit` (die niets
  schrijft) zijn `security definer` en draaien als `postgres`, dus geen
  inserts via de app hebben een sequence-recht van de aanroeper nodig.

**Te verifiëren door de Developer** (Besluit 2): dat geen code in de app een
tabel leest zonder sessie. Een `select` als `anon` geeft na deze migratie
`permission denied` (42501) in plaats van nul rijen. Ook de bestaande tests
met `set local role anon` nalopen (zie Randgevallen).

**2. `public`: intrekken voor wat komt.**
- `alter default privileges in schema public revoke truncate, references,
  trigger on tables from public, anon, authenticated;`
- `alter default privileges in schema public revoke all on tables from
  anon;`
- `alter default privileges in schema public revoke all on sequences from
  public, anon, authenticated;`

Zonder `for role` geldt dit voor de standaardrechten van `postgres`, de rol
die onze tabellen aanmaakt. Lokaal geverifieerd (alleen de eerste regel, in
een transactie): een nieuwe tabel krijgt daarna `anon=arwd`/
`authenticated=arwd` in plaats van `arwdDxt`. Zoals in `0018`:
belt-and-braces, geen vervanging van de invariant. Het dekt geen tabel die
door een andere rol wordt aangemaakt (bv. `supabase_admin` voor een
extensie in `public`); de invariant wel.

Dezelfde drie regels ook voor `in schema storage` (de standaardrechten van
`postgres` daar geven ook `arwdDxt`). Wij maken daar geen tabellen aan, dus
het zijn drie regels om een gat te dichten dat er vandaag niet is. Supabase'
eigen storage-tabellen (van `supabase_storage_admin`) raken ze niet.

**3. `storage`: geen `revoke`.** Een `revoke` op de storage-tabellen werkt
niet (Aanleiding punt 3) en hoort daarom **niet** in de migratie. Een regel
die niets doet en toch "revoke" heet, is erger dan geen regel.

**4. `storage`: de `BEFORE TRUNCATE`-guard (Besluit 1, ADR 0019 → punt 3).**
- Eén triggerfunctie in `public`, `language plpgsql`, `security invoker`
  (geen `security definer`: hij leest alleen `current_user`), met `set
  search_path`. Hij weigert met een eigen foutcode (bv. `raise exception
  'truncate_forbidden' using errcode = 'P0001'`) als `current_user` `anon`
  of `authenticated` is, en laat elke andere rol door. De exacte naam en
  foutcode bepaalt de Developer.
- `revoke execute ... from public, anon, authenticated, service_role`, en in
  `rpc_catalogus` als `intern`. Lokaal bewezen: de trigger gaat ook af voor
  een rol zonder `EXECUTE` op de functie.
- Een `BEFORE TRUNCATE ... FOR EACH STATEMENT`-trigger met die functie op
  elke tabel in `storage` waar `anon` of `authenticated` TRUNCATE heeft.
  Lokaal zijn dat `storage.objects`, `storage.buckets` en
  `storage.buckets_analytics`. De Developer bepaalt de lijst uit de
  catalogus van de database waartegen hij bouwt, niet uit deze spec.

**Voorwaarde vóór `supabase db push`: de controle op het gehoste project.**
Wij (Architect, Developer, Reviewer, Tester) hebben geen toegang tot het
gehoste project. **Bram draait de drie queries hieronder zelf**, read-only,
in de SQL-editor van het dashboard (die draait als `postgres`). De Developer
bouwt en test de guard lokaal en in CI zoals beschreven. Maar migratie
`0039` gaat pas naar productie nadat Bram het resultaat heeft bekeken.
Lokaal en gehost horen gelijk te lopen, maar Supabase beheert de
storage-rechten zelf en de gehoste versie kan afwijken:

```sql
select relname, relacl from pg_class
 where oid in ('storage.objects'::regclass, 'storage.buckets'::regclass);
select has_table_privilege('postgres', 'storage.objects', 'TRIGGER');
select pg_get_userbyid(defaclrole), defaclacl from pg_default_acl
 where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
```

Verwacht:
1. dezelfde ACL's als lokaal: `supabase_storage_admin` als grantor, en
   `postgres=a*r*w*d*D*x*t*` (met grant option);
2. `true`;
3. een regel voor `postgres` met `arwdDxt` voor `anon` en `authenticated`.

**Wijkt query 1 of 2 af, dan valt de guard terug op optie B** (Besluit 1:
besloten restrisico, geen guard; de invariant legt de uitzondering vast, zie
Gates). De migratie gaat dan niet met de guard naar productie. Het gaat
terug naar de Architect, die de spec en ADR 0019 bijwerkt. De Developer
vult dat niet zelf in. Wijkt alleen query 3 af, dan blijft de guard staan,
maar gaat de migratie evenmin naar productie: de `alter default
privileges`-regels gaan uit van die standaardrechten, en ook dat gaat terug
naar de Architect.

## `service_role`: niet aanraken

`service_role` houdt `arwdDxt` op alle tabellen, in `public` en in
`storage`. De migratie en de invariant laten die rol bewust buiten
beschouwing:
- **Het voegt niets toe.** `service_role` heeft `bypassrls` en volledige DML.
  Wie die sleutel heeft, kan alles al verwijderen. TRUNCATE is daar een
  snellere vorm van, geen nieuwe bevoegdheid. Het omzeilt alleen rij-triggers,
  en `public` heeft er geen.
- **De sleutel komt nooit bij een client.** `check:arch` regel 4 verbiedt
  `src/lib/supabase/admin.ts` vanuit client-code. De grens voor
  `service_role` ligt bij wie de sleutel heeft, niet bij tabelrechten.
- **Supabase-tooling rekent erop.** De Storage-API wisselt per verzoek naar
  `service_role` (onze `src/lib/productImage.ts` gebruikt dat), en het
  dashboard en `supabase db dump` gaan uit van volledige rechten. Intrekken
  riskeert breuk voor een winst van nul.
- **Op storage kan het ook niet**, om dezelfde reden als bij `anon` en
  `authenticated` (Aanleiding punt 3).

De invariant kijkt dus naar `PUBLIC`, `anon` en `authenticated`, niet naar
`service_role` of `postgres`. Wel toetst de invariant dat `service_role` zijn
rechten houdt op de tabellen die server-code schrijft (zie Gates).

## Gates

### pgTAP-invariant 1: tabelrechten van API-rollen

Nieuw bestand, bijvoorbeeld `supabase/tests/tabelrechten_api_rollen.test.sql`.
Zelfde opbouw als `rpc_execute_grants.test.sql`: een tellende assertie over
de catalogus (dekt ook een tabel van morgen) plus een paar benoemde checks
(een rode run laat meteen zien waar het zit). `has_table_privilege` en
`has_any_column_privilege` lezen de ACL rechtstreeks, zonder iets te legen.

1. **Tellend, `public`:** geen enkele relatie in `public` (`relkind` in `r`,
   `p`, `v`, `m`, `f`) waarop `PUBLIC`, `anon` of `authenticated` TRUNCATE of
   TRIGGER heeft (`has_table_privilege`) of REFERENCES
   (`has_any_column_privilege`, omdat REFERENCES ook per kolom kan bestaan).
   De assertie geeft de lijst van overtreders terug (`array_agg`), zoals
   `rpc_catalogus` dat doet, niet alleen een aantal.
2. **Tellend, `storage`** (Besluit 1): elke tabel in `storage` waarop
   `anon` of `authenticated` TRUNCATE heeft, heeft de `BEFORE
   TRUNCATE`-guard. Plus een gedragstest: `truncate storage.objects` als
   `authenticated` geeft de foutcode van de guard (`throws_ok`, binnen de
   transactie van de test), en als `anon` ook.

   Valt de guard terug op optie B (Migratie `0039` → Voorwaarde), dan wordt
   dit een assertie die de bekende uitzondering vastlegt: API-rollen hebben
   hier TRUNCATE, en dat is besloten restrisico. Die wordt rood zodra
   Supabase het zelf intrekt, en dan kan de uitzondering weg. Die omzetting
   loopt via de Architect.
3. **Benoemd:** `orders`, `order_lines`, `top_ups`, `order_reversals` en
   `members` (de `MONEY_TABLES` uit `check:rls`) hebben geen TRUNCATE,
   REFERENCES of TRIGGER voor `anon` en `authenticated`.
4. **De intrekking mag niet te ver gaan** (zoals sectie 3 van
   `rpc_execute_grants`): `authenticated` houdt `select` op `orders`,
   `top_ups`, `products`, `shifts` en `bar_sessions`; `service_role` houdt
   `insert` en `delete` op `login_throttle`, `client_errors` en
   `bar_devices`. De Developer mag de lijst aanvullen, niet inkorten.
5. **Tellend, breed** (Besluit 2): geen enkel recht (`SELECT`, `INSERT`,
   `UPDATE`, `DELETE`, plus de drie hierboven, ook kolomgewijs) voor
   `PUBLIC` of `anon` op een relatie in `public`; en geen enkel recht
   (`USAGE`, `SELECT`, `UPDATE`) voor `PUBLIC`, `anon` of
   `authenticated` op een sequence in `public`
   (`has_sequence_privilege`).

### pgTAP-invariant 2: elke bucket heeft werkzame limieten

Nieuw bestand, bijvoorbeeld `supabase/tests/storage_bucket_limieten.test.sql`.
Een eigen bestand, zodat de testbucket zonder limieten uit
`productafbeeldingen_negatief.test.sql` (eigen transactie) er niet in
meetelt.

- Tellend over **elke rij** in `storage.buckets` (Besluit 3), met de
  lijst van overtredende bucket-id's als uitkomst:
  - `file_size_limit is not null` en `file_size_limit > 0`;
  - `allowed_mime_types is not null` en `cardinality(allowed_mime_types) >
    0`;
  - geen element van `allowed_mime_types` bevat een `*` (dus geen
    `image/*` en geen `*/*`).
- Een benoemde check dat `product-images` bestaat, zodat de tellende
  assertie niet stil groen is op een lege tabel.

Deze invariant toetst de stand na alle migraties, dus ook een latere
`update storage.buckets` of een `insert` met aanhalingstekens. Hij toetst
niet een bucket die iemand op het gehoste project via het dashboard
aanpast (zie Buiten scope).

### `check:rls`

Twee wijzigingen, en één die bewust niet gebeurt (Besluit 4):
- **De invarianten zijn verplicht.** `check:rls` faalt als een van de twee
  testbestanden ontbreekt, of als het bestand de kern van de invariant niet
  meer bevat (bv. de woorden `'TRUNCATE'`, `'TRIGGER'`, `'REFERENCES'` in het
  eerste bestand, en `file_size_limit` en `allowed_mime_types` in het
  tweede). Dat is lexicaal en daarmee zwak, maar het doel is beperkt: wie het
  bestand weghaalt of uitkleedt, krijgt al bij de pre-commit hook een fout.
  Of de invariant klopt, bewijst `db:test`.
- **De lexicale bucketregel blijft, als vroege waarschuwing.** Regel 1 en 2
  (r. 64–94) draaien in `check:fast` zonder database, en vangen het gewone
  geval al bij het committen. Het commentaar zegt voortaan dat de invariant de
  echte gate is en waarom de scan dat niet kan zijn (aanhalingstekens, latere
  `update`).
- **De geldtabelregel eist geen `truncate`** (Besluit 4). De
  invariant dekt de geldtabellen al, net als elke andere tabel, en een
  lexicale `truncate`-eis zou op dezelfde manier te omzeilen zijn als de
  bucketregel.

## Randgevallen

- **`0038` staat lokaal nog niet op de database.** Lokaal is
  `storage.buckets` daardoor leeg. Na `supabase db reset` (CI doet dat bij
  elke run; lokaal niet op de gedeelde database zonder overleg) bestaat
  `product-images`. De benoemde check in invariant 2 voorkomt dat een lege
  tabel als groen telt.
- **Een tabel die een extensie in `public` aanmaakt** valt niet onder `alter
  default privileges` van `postgres`. De invariant wordt dan rood. De fix is
  een `revoke` in de migratie die de extensie toevoegt, of de extensie in
  `extensions` zetten.
- **Een toekomstige tabel met een eigen `grant all ... to authenticated`**
  geeft TRUNCATE alsnog. De invariant wordt rood. Dat is de bedoeling.
- **Een Supabase-CLI-upgrade die een nieuwe storage-tabel toevoegt** maakt
  invariant 1 deel 2 rood (tabel zonder guard). De CLI-versie
  in CI staat vast, dus dit gebeurt alleen bij een bewuste upgrade, en dan
  hoort de guard erbij.
- **Bestaande tests met `set local role anon`** (`bar_sessies_rls`,
  `client_errors`, `login_throttle`, `productafbeeldingen`,
  `productafbeeldingen_negatief`, `verify_bar_pin`): door de brede
  intrekking (Besluit 2) verschuift een `select` als `anon` van "nul
  rijen" naar `permission denied` (42501), en een `insert` van een
  RLS-fout naar een rechtenfout (dezelfde SQLSTATE, een andere melding). De
  Developer loopt die tests na. Een test die op de melding toetst in plaats
  van op de code, past hij aan; de bedoeling van de test verandert niet.

## Expliciet buiten scope

- **TRIGGER en REFERENCES op storage-tabellen.** Die zijn met geen enkele
  migratie in te trekken. Een `BEFORE TRUNCATE`-trigger blokkeert geen
  `CREATE TRIGGER`; daarvoor is een event trigger nodig, en die vraagt
  superuser-rechten die wij op het gehoste project niet hebben. Restrisico:
  wie willekeurige SQL als `authenticated` kan draaien, kan een trigger aan
  `storage.objects` hangen en uploads blokkeren. Geen geld, geen API-pad.
  REFERENCES is zonder `CREATE` op een schema niet te gebruiken.
- **Supabase vragen de storage-rechten in te trekken.** Kan naast deze spec,
  hoort er niet in.
- **Drift op het gehoste project** (een bucket of recht dat via het dashboard
  verandert). `db:test` draait alleen tegen de migraties. Een periodieke
  controle op productie is een eigen besluit.
- **Andere schema's** (`graphql_public`, `extensions`, `auth`). Daar maken
  wij geen tabellen, en ze zijn niet onderzocht. Wil Bram dat ook
  nagelopen, dan is dat een eigen ticket.
- **De algemene uploadlimiet van Storage** (`[storage] file_size_limit` in
  `config.toml`). Staat los van de limiet per bucket.
- **Wijzigingen aan RPC's, policies of de app.** Geen.

## ADR

[ADR 0019](../adr/0019-api-rollen-geen-rls-omzeilende-tabelrechten.md),
geaccordeerd met deze spec (Besluit 5), nog niet geïmplementeerd.

## Documentatie na de bouw

Voor de Docs-rol, na de merge:
- ARCHITECTURE.md → "Money & attribution": de zin "Money tables are
  `REVOKE`d from `authenticated`" wordt "… inclusief TRUNCATE, REFERENCES en
  TRIGGER, voor elke tabel, bewaakt door de invariant". Plus een alinea naast
  "RPC-grens gold niet voor sessieloze aanroepers" met wat hier gevonden is.
- CLAUDE.md → Verificatie: de rij `db:test` noemt de invarianten
  (tabelrechten, bucketlimieten), en de rij `check:rls` noemt dat die
  verplicht zijn. Een CLAUDE.md-wijziging is aan Bram.
- `scripts/check-rls.mjs`: het kopcommentaar.

## Besluiten van Bram

Beantwoord door Bram op 2026-10-02, via de coördinator. Bij elke vraag
volgde Bram de aanbeveling. De vragen en opties staan er nog bij, zodat
zichtbaar blijft wat er verworpen is.

### Besluit 1: wat doen we met TRUNCATE op de storage-tabellen?

Een `revoke` werkt daar niet (Aanleiding punt 3).

- **Optie A: een `BEFORE TRUNCATE`-guard.** Eén interne triggerfunctie (in
  `public`, ingedeeld als `intern` in `rpc_catalogus`, `EXECUTE` voor geen
  enkele API-rol) die weigert als `current_user` `anon` of `authenticated`
  is. Een `BEFORE TRUNCATE ... FOR EACH STATEMENT`-trigger op elke
  storage-tabel waar die rollen TRUNCATE hebben (nu `objects`, `buckets`,
  `buckets_analytics`). Lokaal bewezen dat het werkt. Nadeel: we hangen iets
  aan een tabel die Supabase beheert, en dat is een eerste keer (ADR 0019).
  Werkt alleen als de verificatie op het gehoste project `TRIGGER` voor
  `postgres` laat zien.
- **Optie B: besloten restrisico.** Geen guard. De spec en ARCHITECTURE.md
  leggen vast dat storage TRUNCATE houdt voor API-rollen, zonder API-pad, en
  de invariant legt die uitzondering vast zodat we het merken als Supabase
  het ooit zelf intrekt. Nadeel: `storage.objects` blijft te legen door wie
  willekeurige SQL als `authenticated` krijgt. Gevolg: alle
  productafbeeldingen geven 404 tot ze opnieuw geüpload zijn. Geen geld.

**Aanbeveling van de Architect: optie A**, mits de verificatie op het
gehoste project slaagt; lukt dat niet, dan optie B. Het is klein (één functie, drie triggers, één
test), volgt het mechanisme dat Supabase zelf gebruikt
(`storage.protect_delete` is ook een statement-trigger), en het precies dát
recht dat de Reviewer vond, gaat dicht.

**Besluit 1 (Bram, 2026-10-02): optie A, de `BEFORE TRUNCATE`-guard**, op
voorwaarde dat de controle op het gehoste project slaagt (Migratie `0039` →
Voorwaarde). Bram draait die queries zelf. Slaagt de controle niet, dan
geldt optie B en gaat het terug naar de Architect.

### Besluit 2: alleen TRUNCATE/REFERENCES/TRIGGER, of ook de overige rechten van `anon`?

`anon` heeft vandaag `arwd` (select, insert, update, delete) op de
geldtabellen, `members` en de andere tabellen uit `0001`–`0020`. Alleen RLS
houdt het tegen: elke policy is `to authenticated`. API-rollen hebben ook
`rwU` op de sequences `client_errors_id_seq` en `login_throttle_id_seq`
(`UPDATE` maakt `setval` mogelijk), terwijl ze op die tabellen niets mogen.

- **Optie 1: breed.** In dezelfde migratie ook `revoke all on all tables in
  schema public from anon` en `revoke all on all sequences in schema public
  from anon, authenticated`, met de bijbehorende `alter default privileges`,
  en invariant 1 deel 5. Waarom: een latere `create policy` zonder `to`-clausule
  geldt voor `PUBLIC`, dus ook voor `anon`, en met de huidige rechten staat
  er dan meteen een tabel open voor iedereen met de publishable key. Dat is
  precies de "policy per ongeluk" uit `0027`. Bijkomend: pg_graphql en de
  OpenAPI van PostgREST tonen `anon` alleen tabellen waarop het rechten
  heeft, dus het schema is daarna niet meer zonder login te bekijken. Alle
  functies zijn `security definer`, dus de sequences zijn voor de app niet
  nodig. Te verifiëren door de Developer: dat geen code een tabel leest
  zonder sessie (een `select` als `anon` geeft daarna een fout in plaats van
  nul rijen).
- **Optie 2: smal.** Alleen de drie rechten uit de bevinding. Anon-DML en
  sequences worden een eigen ticket.

**Aanbeveling van de Architect: optie 1.** Zelfde mechanisme, zelfde
migratie, zelfde invariant. De extra regressiekans is klein: alle policies zijn `to
authenticated`, dus een `select` als `anon` levert vandaag al niets op, en
een leespad zonder sessie zou dus al stuk zijn. `db:test` vangt de tests die
op het oude gedrag leunen; een leespad in de app zonder sessie moet de
Developer zelf uitsluiten.

**Besluit 2 (Bram, 2026-10-02): optie 1, breed.** `revoke all` voor `anon`
op `public`, plus de sequences.

### Besluit 3: hoe streng is de bucket-invariant?

- **Optie 1: werkzaam.** `file_size_limit > 0`, `allowed_mime_types` niet
  leeg (`cardinality > 0`), en geen element met een `*` (bv. `image/*`). Een
  lege array, een limiet van 0 of een wildcard laten de bucket in de praktijk
  zonder beperking, en `image/*` laat SVG toe, wat op een publieke bucket
  script kan uitvoeren. ADR 0018 → punt 3 wil dat de limiet "een werkelijke
  eigenschap van de inhoud" is.
- **Optie 2: alleen niet-null**, zoals de Tester voorstelde.

**Aanbeveling van de Architect: optie 1.** `product-images` voldoet er
al aan (`1048576`, `{image/webp}`), dus het kost niets, en een wildcard is de waarschijnlijkste
manier waarop een volgende bucket te ruim wordt.

**Besluit 3 (Bram, 2026-10-02): optie 1, streng.** Limiet `> 0`, mime-types
niet leeg, geen wildcard.

### Besluit 4: moet `check:rls` op de geldtabellen ook `truncate` eisen?

- **Optie 1: nee.** De invariant dekt elke tabel, ook de geldtabellen,
  benoemd (Gates, invariant 1 punt 3). `check:rls` eist alleen dat de
  invariantbestanden er zijn. De bestaande geldtabelregel blijft zoals hij
  is.
- **Optie 2: ja.** De geldtabelregel eist voortaan `truncate`, `references`
  en `trigger` in een `revoke ... from authenticated`. Geeft al bij de
  pre-commit hook een fout, maar is lexicaal net zo te omzeilen als de
  bucketregel, en is na de projectbrede `revoke ... on all tables` van `0039`
  meteen voldaan zonder dat het iets bewijst.

**Aanbeveling van de Architect: optie 1.** Eén plek die het bewijst (de
database), en één structurele check dat die plek niet verdwijnt.

**Besluit 4 (Bram, 2026-10-02): optie 1.** Geen lexicale `truncate`-eis.

### Besluit 5: is een ADR nodig?

- **Optie 1: ja, ADR 0019** (concept staat er). Het legt vast wat geen gate
  afdwingt en wat een volgende feature zou kunnen tegenspreken: dat
  `service_role` bewust buiten de regel valt, dat wij bij optie A van
  Besluit 1 een guard aan een Supabase-tabel hangen (en waarom een `revoke` daar niets
  doet), en wat het restrisico op storage is.
- **Optie 2: geen ADR**, alleen een alinea in ARCHITECTURE.md, zoals bij
  `0018` en `rpc_execute_grants`. De regel zelf ("geen RLS-omzeilende rechten
  voor API-rollen") wordt door de invariant afgedwongen, en volgens de
  Architect-rol krijgt wat een gate afdwingt geen ADR.

**Aanbeveling van de Architect: optie 1 als bij vraag 1 optie A gekozen
wordt, anders optie 2.**
Een guard op een tabel van Supabase is een precedent dat een volgende sessie
zonder ADR als "rommel in andermans schema" kan weghalen. Bij optie B is er
geen nieuwe beslissing: dan volstaat ARCHITECTURE.md en vervalt het concept.

**Besluit 5 (Bram, 2026-10-02): optie 1, ADR 0019.** Geaccordeerd, nog
niet geïmplementeerd. Valt Besluit 1 terug op optie B, dan herziet de
Architect ADR 0019 → punt 3 voordat de migratie naar productie gaat.

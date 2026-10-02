# 0019 — API-rollen krijgen geen tabelrechten die RLS omzeilen; waar een `revoke` niet kan, blokkeert een guard

Status: **geaccordeerd (2026-10-02), nog niet geïmplementeerd.** Bram gaf
akkoord samen met de spec
[`docs/features/tabelrechten-api-rollen.md`](../features/tabelrechten-api-rollen.md)
(spec → Besluit 1 en 5; het akkoord is via de coördinator doorgegeven).
Punt 3 geldt onder voorwaarde: Bram controleert vóór `supabase db push`
zelf op het gehoste project dat `postgres` daar `TRIGGER` heeft op de
storage-tabellen (spec → Migratie `0039` → Voorwaarde). Wijkt dat af, dan
vervalt punt 3, geldt het besloten restrisico (spec → Besluit 1, optie B),
en herziet de Architect dit ADR voordat de migratie naar productie gaat.
Vervangt niets. Vult het
`REVOKE` uit CLAUDE.md → "Geld beweegt alleen via RPC" aan en staat naast
[ADR 0018](0018-bestandsopslag-alleen-server-side-schrijven.md).

## Context

Bij de review van PR #146 bleek dat `anon` en `authenticated` TRUNCATE,
REFERENCES en TRIGGER hebben op bijna elke tabel in `public`, ook op de
geldtabellen, en op `storage.objects` en `storage.buckets`. Dat komt uit de
standaardrechten van Supabase (`arwdDxt` voor elke nieuwe tabel). Onze
migraties trokken `insert, update, delete` in, maar deze drie bijna nooit
(alleen `0027` voor drie sessietabellen).

TRUNCATE omzeilt RLS en rij-triggers (ook `storage.protect_delete`).
TRIGGER laat een API-rol een bestaande triggerfunctie aan een tabel hangen,
bv. een die elke insert in `orders` weigert. Er is geen API-pad naar een van
beide; het risico bestaat alleen voor wie al willekeurige SQL als die rol
kan draaien.

Twee eigenschappen maken dit meer dan een eenmalige fix:
- Elke volgende `create table` krijgt de rechten opnieuw, tenzij de
  standaardrechten veranderen.
- Op de storage-tabellen (eigendom van `supabase_storage_admin`) kan de rol
  van onze migraties (`postgres`) de rechten niet intrekken. Een `revoke`
  daar slaagt zonder fout en doet niets. Een migratie met zo'n regel ziet er
  goed uit en beschermt niet.

## Beslissing

1. **`PUBLIC`, `anon` en `authenticated` hebben op geen enkele relatie in
   `public` TRUNCATE, REFERENCES of TRIGGER.** Ingetrokken voor wat er is en
   via `alter default privileges` voor wat komt. Een tabel die het later toch
   krijgt, is een fout, geen keuze. Daarnaast heeft `anon` op geen enkele
   relatie in `public` een recht, en hebben `PUBLIC`, `anon` en
   `authenticated` geen recht op een sequence in `public` (spec → Besluit
   2). Alle functies die schrijven zijn `security definer` en hebben die
   rechten niet nodig.
2. **De database bewijst het, niet de broncode.** Een tellende
   pgTAP-invariant over de catalogus (zoals `rpc_execute_grants` voor
   functies) toetst punt 1 en punt 3. `check:rls` eist alleen dat die
   invariant bestaat.
3. **Waar een `revoke` niet werkt (tabellen van Supabase in `storage`),
   blokkeert een `BEFORE TRUNCATE ... FOR EACH STATEMENT`-guard** TRUNCATE
   voor `anon` en `authenticated`. De triggerfunctie is intern (geen
   `EXECUTE` voor een API-rol). Dit is de enige wijziging die wij aan een
   tabel van Supabase maken, en het is hetzelfde mechanisme dat Supabase zelf
   gebruikt (`storage.protect_delete`). Een `revoke` op die tabellen hoort
   niet in een migratie, omdat het niets doet.
4. **`service_role` valt bewust buiten deze regel.** Die rol heeft
   `bypassrls` en volledige DML, de sleutel komt nooit bij een client
   (`check:arch`), en Supabase-tooling (Storage-API, dashboard) gaat uit van
   volledige rechten. TRUNCATE voegt voor die rol geen bevoegdheid toe.

## Verworpen alternatieven

- **Per tabel intrekken in de migratie die de tabel aanmaakt** (het patroon
  van `0027`). Werkt, maar vergeten is de normale fout, en `0001`–`0026`
  laten zien dat het vergeten wordt. De standaardrechten plus de invariant
  vangen het zonder dat iemand eraan hoeft te denken.
- **Een `revoke` op de storage-tabellen.** Doet niets (zie Context), en zou
  een vals gevoel van veiligheid geven.
- **Een event trigger die `CREATE TRIGGER` door API-rollen blokkeert.**
  Vraagt superuser-rechten die wij op het gehoste project niet hebben.
- **De rechten ook voor `service_role` intrekken.** Geen winst (zie punt 4),
  wel risico op breuk in Supabase-tooling, en op storage niet mogelijk.

## Gevolgen

- Een migratie die een tabel in `public` aanmaakt, hoeft niets extra's te
  doen. Een migratie die een extensie in `public` installeert of zelf een
  `grant all` doet, laat de invariant falen.
- Een Supabase-upgrade die een storage-tabel toevoegt, laat de invariant
  falen tot de guard erop staat. De CLI-versie in CI staat vast, dus dat
  gebeurt alleen bij een bewuste upgrade.
- **Restrisico op storage:** TRIGGER en REFERENCES voor API-rollen blijven
  daar bestaan. Wie willekeurige SQL als `authenticated` kan draaien, kan een
  trigger aan `storage.objects` hangen en uploads blokkeren. Geen geld, geen
  API-pad. REFERENCES is zonder `CREATE` op een schema niet te gebruiken.
- Op het gehoste project moet `postgres` `TRIGGER` hebben op de
  storage-tabellen. Bram controleert dat zelf vóór `supabase db push`, met
  read-only queries in de SQL-editor (spec → Migratie `0039` → Voorwaarde).
  De werkstraat heeft geen toegang tot het gehoste project. Ontbreekt het,
  dan vervalt punt 3 en wordt dit ADR herzien.
- Naast TRUNCATE, REFERENCES en TRIGGER verliest `anon` ook alle andere
  rechten op `public`, en verliezen API-rollen hun rechten op de sequences
  in `public` (spec → Besluit 2). Een policy zonder `to`-clausule opent
  daardoor niets meer voor `anon`.

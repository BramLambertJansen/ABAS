# 0019 — API-rollen krijgen geen tabelrechten die RLS omzeilen; waar een `revoke` niet kan, blokkeert een guard

Status: **geaccordeerd (2026-10-02), gebouwd in PR #150, nog niet
gemerged.** Bram gaf akkoord samen met de spec
[`docs/features/tabelrechten-api-rollen.md`](../features/tabelrechten-api-rollen.md)
(spec → Besluit 1, 5 en 6; het akkoord is via de coördinator doorgegeven).
Punt 3 geldt onder voorwaarde: Bram controleert vóór `supabase db push`
zelf op het gehoste project dat `postgres` daar `TRIGGER` heeft op de
storage-tabellen (spec → Migratie `0042` → Voorwaarde, query 2 en 4).
- Geldt dat voor geen enkele tabel, of niet voor `storage.objects`
  (query 2), dan vervalt punt 3 en geldt het besloten restrisico (spec →
  Besluit 1, optie B).
- Geldt het voor een deel van de tabellen (query 4), dan geldt punt 3 voor
  dat deel (spec → Besluit 6). De rest wordt besloten restrisico, met naam.

In beide gevallen herziet de Architect dit ADR voordat de migratie naar
productie gaat. Vervangt niets. Vult het
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

   De lijst van tabellen wordt bij het draaien van de migratie uit de
   catalogus bepaald (elke tabel in `storage` waarop `anon` of
   `authenticated` TRUNCATE heeft), niet met de hand: de storage-versie
   verschilt per omgeving. Een tabel waarop de guard niet kan, wordt niet
   stil overgeslagen; de migratie faalt dan. Blijkt dat op het gehoste
   project, dan krijgt elke tabel waar het wel kan de guard, en wordt de
   rest met naam een uitzondering, in de spec, in dit ADR, in de migratie
   en in de invariant (spec → Besluit 6).
4. **`service_role` valt bewust buiten deze regel.** Die rol heeft
   `bypassrls` en volledige DML, de sleutel komt nooit bij een client
   (`check:arch`), en Supabase-tooling (Storage-API, dashboard) gaat uit van
   volledige rechten. TRUNCATE voegt voor die rol geen bevoegdheid toe.

5. **Aanvalsmodel.** Deze maatregelen gelden voor SQL die als `anon` of
   `authenticated` draait. Ze gelden niet voor wie willekeurige SQL kan
   draaien in de sessie van PostgREST zelf. Die verbindt als
   `authenticator`, en die rol is lid van `anon`, `authenticated` en
   `service_role`. Met `set role service_role` komt zo iemand langs RLS,
   langs de tabelrechten en langs de guard. Daartegen beschermt dat elke
   RPC vaste SQL uitvoert, niet dit ADR. Dat geldt voor elke RLS-maatregel
   in ABAS.

## Verworpen alternatieven

- **Per tabel intrekken in de migratie die de tabel aanmaakt** (het patroon
  van `0027`). Werkt, maar vergeten is de normale fout, en `0001`–`0026`
  laten zien dat het vergeten wordt. De standaardrechten plus de invariant
  vangen het zonder dat iemand eraan hoeft te denken.
- **Een `revoke` op de storage-tabellen.** Doet niets (zie Context), en zou
  een vals gevoel van veiligheid geven.
- **Bij een tabel waarop de guard niet kan, alles terugdraaien** (geen guard
  op storage). Verworpen voor het tussengeval (spec → Besluit 6): dan
  vervalt ook de bescherming van `storage.objects` en `storage.buckets`,
  zonder winst.
- **Een event trigger die `CREATE TRIGGER` door API-rollen blokkeert.**
  Vraagt superuser-rechten die wij op het gehoste project niet hebben.
- **De rechten ook voor `service_role` intrekken.** Geen winst (zie punt 4),
  wel risico op breuk in Supabase-tooling, en op storage niet mogelijk.

## Gevolgen

- Een migratie die een tabel in `public` aanmaakt, hoeft niets extra's te
  doen. Een migratie die een extensie in `public` installeert of zelf een
  `grant all` doet, laat de invariant falen.
- De guardlijst wordt één keer bepaald, toen `0042` draaide. Een
  storage-tabel die later bijkomt, krijgt geen guard:
  - in CI (een upgrade van de Supabase-CLI) wordt de invariant rood tot een
    migratie de guard erop zet. De CLI-versie in CI staat vast, dus dat
    gebeurt alleen bij een bewuste upgrade;
  - op het gehoste project (een storage-upgrade door Supabase) merken we het
    niet. Dat is drift en valt buiten de gates. Query 4 uit de spec toont het
    bij een volgende push.
- De guard op `storage.buckets` gaat voor `authenticated` vandaag in de
  praktijk niet af: zonder `cascade` weigert de foreign key, met `cascade`
  ontbreekt TRUNCATE op `storage.s3_multipart_uploads`. Hij staat er toch,
  omdat de lijst de rechten volgt en niet de vraag of een aanval vandaag
  lukt.
- **Restrisico op storage:** TRIGGER en REFERENCES voor API-rollen blijven
  daar bestaan. Wie willekeurige SQL als `authenticated` kan draaien, kan een
  trigger aan `storage.objects` hangen en uploads blokkeren. Geen geld, geen
  API-pad. REFERENCES is zonder `CREATE` op een schema niet te gebruiken.
- Op het gehoste project moet `postgres` `TRIGGER` hebben op de
  storage-tabellen. Bram controleert dat zelf vóór `supabase db push`, met
  read-only queries in de SQL-editor (spec → Migratie `0042` → Voorwaarde).
  De werkstraat heeft geen toegang tot het gehoste project. Ontbreekt het
  op `storage.objects`, dan vervalt punt 3; ontbreekt het op een deel van
  de tabellen, dan geldt spec → Besluit 6. In beide gevallen wordt dit ADR
  herzien.
- Naast TRUNCATE, REFERENCES en TRIGGER verliest `anon` ook alle andere
  rechten op `public`, en verliezen API-rollen hun rechten op de sequences
  in `public` (spec → Besluit 2). Een policy zonder `to`-clausule opent
  daardoor niets meer voor `anon`.

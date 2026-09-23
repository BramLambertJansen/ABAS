# Activiteittypes per dienst (Training/Wedstrijddag/…)

Spec voor [issue #18](https://github.com/BramLambertJansen/ABAS/issues/18)
("[Beslissing nodig] Activiteittypes per dienst (Training/Wedstrijddag)").

**Status: gebouwd (2026-09-22) — [PR #65](https://github.com/BramLambertJansen/ABAS/pull/65),
CI groen, geen merge-conflict, klaar voor Bram's merge (nog niet
gemerged).** De rest van dit document beschrijft de daadwerkelijk gebouwde
staat, niet langer alleen een plan. Op een paar punten week de bouw af van
de letterlijke spec-schets hieronder — elk zo'n punt is inline gemarkeerd
met **"(bouw)"** en heeft een eigen motivatie: Datamodel (het
migratienummer), RPC's (`search_path`, expliciete `revoke execute`),
Schermflow §1 (twee WCAG-contrastfixes, met een verwijzing naar
[issue #66](https://github.com/BramLambertJansen/ABAS/issues/66) voor de
bredere, nog openstaande variant van die bug) en Schermflow §2
(`PinPad`'s nieuwe `backLabel`-prop). Geen van deze afwijkingen wijzigt een
RPC-contract, foutcode of gedrag dat hieronder al beschreven stond — stuk
voor stuk correcties/aanvullingen die pas tijdens het bouwen aan het licht
kwamen, geen scopewijziging.

De ene openstaande vraag (verplicht of optioneel kiezen bij dienst starten)
is beantwoord: **verplicht** — de Architect-aanbeveling die deze spec al
volledig uitwerkte, zie "Beantwoorde vraag" onderaan. Er staat in dit
document geen open vraag meer.

Was tot dit ticket expliciet niet-besloten scope: `docs/ARCHITECTURE.md` →
"Wat het prototype deed maar hier nog niet is besloten" noemde "Activity
types linked to a shift ('Training' / 'Wedstrijddag' / …)" met naam, en
`docs/features/bezetting-beheren.md`/`dienst-afsluiten.md` sloten het allebei
expliciet uit met precies die verwijzing. Bram heeft dit nu principieel
goedgekeurd voor bouw — deze spec vult het in. Twee letterlijke beslissingen
van Bram, niet ter discussie in deze spec:

1. Activiteittypes worden nu meegenomen (niet uitgesteld, niet geschrapt).
2. Het zijn geen twee vaste typen — het is een **eigen, door de beheerder
   beheerbare entiteit**, qua patroon vergelijkbaar met hoe assortiment
   beheerd wordt (`docs/features/assortimentbeheer.md`).

## Onderzocht in /designs/

Drie bronnen gelezen vóór het schrijven van deze spec, per Architect →
Randvoorwaarden:

- **`designs/Bar App.dc.html`** (regel 347, 613–614, 1292, 1580–1585,
  1707–1714, 2004, 2032–2064, 2688–2690, 2769–2772, 2966, 3209–3231,
  3331–3332): de enige velden op een activiteittype zijn `id`/`name`/
  `archived` — geen kleur, icoon of categorie. Beheer gebeurt op de
  Instellingen-pagina, naast de negatieflimiet-instelling (regel 613–614:
  *"Elke dienst wordt gestart voor één van deze activiteiten. De bardienst
  kiest bij het inloggen; jij beheert de lijst."*). De keuze bij het starten
  van een dienst blokkeert de bevestigknop tot er iets gekozen is
  (`activityMissing = s.crewSheetIntro && !s.shiftActivityId`,
  `closeCrewSheet` weigert te sluiten zolang dat zo is).
- **`designs/chats/chat36.md`–`chat38.md`** (de drie chats die
  `docs/ARCHITECTURE.md` → Bronmateriaal met naam noemt voor dit onderwerp):
  - `chat36.md`, Bram's eigen openingszin bij het laten bouwen van dit stuk
    van het ontwerp: *"een dienst moet gekoppeld zitten aan een activiteit.
    het activiteitstype moet beheerbaar zijn door een beheerder. bij het
    starten van een dienst moet je aan geven voor welke activiteit het is."*
    Drie losse uitspraken, alle drie met "moet" — geen "kan" of "optioneel".
  - `chat37.md`: de keuze bij het starten evolueerde van losse chips naar een
    dropdown ("Kies een activiteit…"), met de rand die oranje kleurt zolang
    er niets gekozen is — een visuele, niet alleen functionele, verplicht-
    markering. Instellingen kreeg daarnaast een teller ("x in gebruik") en
    een waarschuwing als er geen actief type meer over is.
  - `chat38.md`: activiteittypes zijn ook bewerkbaar (inline hernoemen),
    archiveren/herstellen als icoonknop, archiveren in de "danger"-kleur.
  Deze chats zijn volgens `docs/ARCHITECTURE.md` "useful for *why*, not
  binding on *what we build*" — ze bepalen dus niet automatisch het gedrag,
  maar zijn wél het enige directe bewijs van Bram's eigen intentie toen dit
  voor het eerst ontworpen werd. Zie "Beantwoorde vraag" onderaan voor
  waarom dit ondanks dat bewijs destijds niet als aanname gebouwd is, maar
  eerst aan Bram voorgelegd.
- **Bestaande code** (`docs/features/dienst-starten.md`,
  `bezetting-beheren.md`, `assortimentbeheer.md`,
  `negatieve-saldolimiet.md`, en de bijbehorende bestanden onder
  `src/features/`/`src/hooks/queries/`/`supabase/migrations/`) — bepaalt het
  patroon hieronder vrijwel volledig: een nieuwe, beheerder-beheerde
  lookup-tabel volgt letterlijk `products`'/`activity_types`' aanstaande
  vorm (archiveren i.p.v. verwijderen, ADR 0002-actorcheck, twee leeshooks
  voor twee leesbehoeften), en de Instellingen-tab
  (`BeheerTabs.tsx`/`NegatieveLimietInstellingen.tsx`) bestaat al als de
  plek waar een tweede instellingen-kaart naast kan komen — precies waar het
  ontwerp 'm ook al toonde.

Geen nieuwe ADR nodig: dit ticket introduceert geen nieuw architectuur*type*
beslissing, het past drie al vastgelegde patronen toe (beheerder-only RPC via
ADR 0002, archiveren i.p.v. verwijderen, twee-leeshooks-voor-twee-behoeftes)
op een nieuwe entiteit.

## Doel (MVP-afbakening, want niet letterlijk door Bram ingevuld)

Bram's antwoord liet het "waarom" van activiteittypes open (rapportage?
filtering in het nieuwe Logboek-scherm, #19? iets anders?) — #19 is een
aparte, nog te schrijven spec die dit ticket niet hoeft te blokkeren. Op
basis van onderzoek (hierboven) is het minimale, zinvolle MVP-doel:

**Een dienst registreert voor welke activiteit hij was, zichtbaar op het
dienst-actief-scherm zelf — de datalaag die een latere #19 (Logboek/
rapportage per activiteit) nodig zou hebben, zonder dat #19 zelf hier gebouwd
wordt.** Dit ticket bouwt dus:

1. Een door de beheerder beheerbare lijst activiteittypes (aanmaken,
   hernoemen, archiveren/herstellen).
2. De koppeling: een dienst kiest, bij het starten, één activiteittype.
3. Zichtbaarheid: het gekozen type is zichtbaar op het dienst-actief-scherm
   (`DienstActief.tsx`), naast "Gestart door X om HH:MM" — hetzelfde soort
   info-regel, geen nieuw scherm.

Rapportage/filtering per activiteit (#19), tonen in het
dienst-afsluiten-overzicht (#12), en elke koppeling met het nog niet gebouwde
"contant/pin-verkoop zonder lid"-concept (#39, `docs/features/verkoop.md` →
"Besloten: contant/pin-verkoop zonder lid" — dat concept wordt in het
ontwerp soms ook losjes "Activiteiten" genoemd, een toevallige naams-overlap
met dít ticket se activiteit**typen**, geen inhoudelijk verband) zijn
allemaal expliciet buiten scope, zie onderaan.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt**: "geld beweegt alleen via RPC" is niet van toepassing — een
activiteittype heeft geen bedrag, geen `balance_cents`-wijziging. "`served_by`
komt uit de bezetting, niet uit een PIN" is evenmin van toepassing — een
activiteittype is een eigenschap van de dienst als geheel (net als
`started_by`/`started_at`), geen attributie van een individuele bestelling.
Beide kernbeslissingen blijven dus ongewijzigd, geen uitzondering nodig.

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6/#7/#12/#14: er is geen dienst- of
beheerconcept in `shells/portal`. Twee bestaande plekken worden geraakt, geen
nieuw scherm:

- **`src/features/dienst-starten/DienstStarten.tsx`** — krijgt een nieuwe
  stap tussen stafkeuze en PIN-invoer (zie Schermflow §2).
- **`src/features/assortimentbeheer/BeheerTabs.tsx`'s Instellingen-tab** —
  krijgt een tweede kaart naast `NegatieveLimietInstellingen`, nieuw bestand
  `src/features/assortimentbeheer/ActiviteitstypesInstellingen.tsx` (zelfde
  featuremap als de rest van `/beheer`, geen nieuwe map — dit is
  beheerfunctionaliteit, geen eigen issue-specifieke schermflow zoals
  Assortiment/Leden dat waren).
- **`src/features/bezetting-beheren/DienstActief.tsx`** — krijgt één nieuwe
  info-regel (Schermflow §3).

## Datamodel

**(bouw)** Nieuwe migratie `supabase/migrations/0019_activiteittypes.sql`
(oorspronkelijk opeenvolgend na `0014_pin_zelfbediening.sql` genummerd als
`0015`, herzien naar `0019` bij het mergen met main — `0015` t/m `0018` zijn
intussen elders vergeven door [PR #64](https://github.com/BramLambertJansen/ABAS/pull/64),
zie `0018_rpc_execute_alleen_authenticated.sql`). Puur een
migratienummer-botsing, geen inhoudelijke wijziging — `0001_init.sql` zelf
wordt niet aangepast, zelfde patroon als alle eerdere migraties.

**Nieuwe tabel `activity_types`**, 1-op-1 het `products`-patroon maar zonder
`category`/`price_cents` (die velden bestaan niet in het ontwerp voor dit
type, zie "Onderzocht in /designs/"):

```sql
create table activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false
);

alter table activity_types enable row level security;

create policy activity_types_select on activity_types
  for select to authenticated using (true);

-- Belt-and-braces, zelfde symmetrie-redenering als products
-- (0005_assortimentbeheer.sql) — functioneel een no-op (er is toch geen
-- insert/update/delete-policy voor authenticated), maakt alleen expliciet
-- dat dit niet per ongeluk via een toekomstige policy openschuift.
revoke insert, update, delete on activity_types from authenticated;
```

**Standaard-rijen, in de migratie zelf (echte productiedata, geen
`supabase/seed.sql`-fixture).** Anders dan `products` (dat leeg start —
een lege productlijst is onschuldig, het verkoopscherm toont gewoon "nog
geen producten") kán een lege `activity_types`-lijst het starten van een
dienst blokkeren — "verplicht" is het gebouwde gedrag (zie "Beantwoorde
vraag" onderaan). Om Aurora niet met een leeg systeem te laten starten,
seedt de migratie de vier typen die het ontwerp zelf als startset gebruikte
(`designs/Bar App.dc.html` regel 1580–1585, `ACTIVITY_TYPES`):

```sql
insert into activity_types (name) values
  ('Training'),
  ('Wedstrijddag'),
  ('Toernooi'),
  ('Overig / vrij barren');
```

Een beheerder kan deze vier hernoemen/archiveren/aanvullen zoals elk ander
activiteittype — dit is een startpunt, geen vaste lijst (Bram's beslissing 2
hierboven). **Dit is geen dead-end zonder deze seed**: een beheerder bereikt
`/beheer` altijd rechtstreeks vanaf de bar-shell root, niet alleen tijdens
een open dienst (`docs/features/assortimentbeheer.md` → Betrokken shell) —
zelfs een volledig lege lijst zou dus met één beheerder-login op te lossen
zijn, zonder dat er al een dienst hoeft te draaien. De seed is puur
dag-één-gemak, geen noodzakelijke ontsnapping uit een deadlock.

**Nieuwe kolom op `shifts`**:

```sql
alter table shifts add column activity_type_id uuid references activity_types(id);
```

**Nullable op schemaniveau, ook als het antwoord op de openstaande vraag
"verplicht" wordt.** Zelfde redenering als `auth_methode-per-lid.md` voor
`auth_user_id`/eerdere migraties: een `not null`-constraint op een kolom die
aan een bestaande tabel wordt toegevoegd zou met terugwerkende kracht op elke
al bestaande `shifts`-rij falen (elke dienst gestart vóór deze migratie heeft
per definitie geen activiteittype). "Verplicht" wordt, als dat het antwoord
is, uitsluitend in `start_shift` afgedwongen voor *nieuwe* diensten vanaf nu —
niet met een schema-constraint met terugwerkende kracht. Historische diensten
tonen dan gewoon geen activiteit (zie Randgevallen).

**Geen `on delete cascade`, geen echte delete van `activity_types`-rijen** —
zelfde `products`/`members`-patroon: archiveren, nooit verwijderen (de
`shifts.activity_type_id`-foreign-key zou een delete van een gebruikt type
sowieso blokkeren; archiveren omzeilt dat probleem net als bij producten).

## RPC's

### Lezen — platte `select`s, geen RPC

Zelfde argumentatie als overal elders in dit repo: `authenticated` mag alles
lezen (single-tenant, `activity_types_select`-policy hierboven). Twee
leeshooks, zelfde tweedeling als `useProducts()`/`useAlleProducten()`
(`docs/features/assortimentbeheer.md` → "Contract met #8's `useProducts()`"):

- **`useActiviteitTypes()`** (`src/hooks/queries/useActiviteitTypes.ts`) —
  alleen niet-gearchiveerde types, voor de keuze bij het starten van een
  dienst (Schermflow §2). Type `ActiviteitType = { id, name }`.
- **`useAlleActiviteitTypes()`**
  (`src/hooks/queries/useAlleActiviteitTypes.ts`) — alle types, incl.
  gearchiveerd, gesorteerd actief-dan-gearchiveerd (zelfde volgorde als het
  ontwerp, `designs/Bar App.dc.html` regel 3231:
  `.sort((a,b) => (a.archived?1:0) - (b.archived?1:0))`), voor de
  Instellingen-kaart (Schermflow §1). Type `AlleActiviteitType = { id, name,
  archived }`.

Twee losse, smalle hooks — niet één geparametriseerde hook — om dezelfde
reden als `assortimentbeheer.md` al vastlegde: elke bestaande hook in
`src/hooks/queries/` is smal en ongeparametriseerd, een impliciete boolean
tussen twee leesdoelen is verrassender dan twee hooks met eigen naam.

### Schrijven — drie nieuwe beheerder-only RPC's, ADR 0002-vorm

1-op-1 gekopieerd van `create_product`/`update_product_price`/
`set_product_archived` (`0005_assortimentbeheer.sql`) — inclusief het
verplichte `select * into v_actor` (nooit een kolom-subset, zie ADR 0002 →
"Post-implementatie fix" voor waarom een subset de rolcheck stil laat falen).

```sql
create or replace function create_activity_type(p_name text)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  insert into activity_types (name, archived) values (v_name, false)
    returning * into v_type;

  return v_type;
end;
$$;

create or replace function update_activity_type_name(
  p_activity_type_id uuid,
  p_name text
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  -- Geen eis dat het type niet gearchiveerd is — zelfde redenering als
  -- update_product_price op een gearchiveerd product: een naam corrigeren
  -- vlak voor het weer actief wordt, zonder eerst te de-archiveren.
  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update activity_types set name = v_name where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

create or replace function set_activity_type_archived(
  p_activity_type_id uuid,
  p_archived boolean
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_type activity_types;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  -- Client stuurt de expliciete eindstaat, idempotent — zelfde patroon als
  -- set_product_archived/set_member_archived. Bewust GEEN "laatste actieve
  -- type"-guard, zie "Besloten door de Architect" hieronder.
  update activity_types set archived = p_archived where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

grant execute on function create_activity_type, update_activity_type_name, set_activity_type_archived
  to authenticated;
```

**(bouw) Elke van deze drie functies kreeg daarnaast een expliciete
`revoke execute ... from public`/`from anon`**, niet in de spec-schets
hierboven. Vereist sinds [PR #64](https://github.com/BramLambertJansen/ABAS/pull/64)
(`0018_rpc_execute_alleen_authenticated.sql`, CLAUDE.md →
Architectuurbeslissingen: "een nieuwe functie krijgt van Postgres standaard
`EXECUTE` voor `PUBLIC`... dat moet elke migratie die er een toevoegt
expliciet intrekken") — deze spec dateert van vóór die regel. De Developer
paste 'm alsnog toe voor alle vier nieuwe/herschapen functies in deze
migratie (deze drie, plus `start_shift` hieronder);
`supabase/tests/rpc_execute_grants.test.sql` bewaakt dit inmiddels per
functie en blokkeerde de eerste PR-push toen dit nog ontbrak (commit
`f73708d`).

### Wijziging aan een bestaande, al gemergede RPC: `start_shift`

Dit is de enige RPC-wijziging die een al gebouwd contract raakt — met naam
te noemen in Developer's PR-beschrijving en Tester's testplan, zelfde eis als
`bezetting-beheren.md` stelde aan zijn `remove_shift_member`-fix. Anders dan
die fix is dit geen bugfix maar een bewuste uitbreiding (nieuwe parameter),
maar het patroon (nieuwe, opeenvolgend genummerde migratie, niet
`0001_init.sql` zelf aanpassen) is hetzelfde.

**Gekozen: atomisch, één RPC-aanroep — geen los `set_shift_activity_type`
ná `start_shift`.** Overwogen alternatief: een tweede RPC die het
activiteittype ná het aanmaken van de dienst zet (vergelijkbaar met hoe
`add_shift_member` een aparte aanroep is). Verworpen: dat zou een venster
openen waarin een dienst al "open" is maar nog geen activiteittype heeft als
de tweede aanroep faalt (netwerkfout tussen de twee calls) — een nieuw,
zelf geïntroduceerd randgeval, in plaats van het gewoon binnen de bestaande
atomaire `insert`-transactie van `start_shift` mee te nemen. Er is precies
één aanroeper in de codebase (`useStartShift.ts`), dus de wijziging is
lokaal, niet systeembreed.

```sql
create or replace function start_shift(
  p_member_id uuid,
  p_pin text,
  p_activity_type_id uuid
)
returns shifts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member members;
  v_activity_type activity_types;
  v_shift shifts;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if v_member.pin_hash is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    raise exception 'invalid_pin' using errcode = 'P0001';
  end if;

  -- Zie "Beantwoorde vraag" onderaan: onderstaande null-check dwingt
  -- "verplicht" af.
  if p_activity_type_id is null then
    raise exception 'invalid_activity_type' using errcode = 'P0001';
  end if;

  if p_activity_type_id is not null then
    select * into v_activity_type from activity_types where id = p_activity_type_id;
    if not found then
      raise exception 'activity_type_not_found' using errcode = 'P0001';
    end if;
    if v_activity_type.archived then
      raise exception 'activity_type_archived' using errcode = 'P0001';
    end if;
  end if;

  insert into shifts (started_by, activity_type_id)
    values (p_member_id, p_activity_type_id)
    returning * into v_shift;
  insert into shift_members (shift_id, member_id) values (v_shift.id, p_member_id);
  return v_shift;
end;
$$;
```

**(bouw) De spec-zin hierboven ("`grant execute` hoeft niet opnieuw…") klopte
niet en is niet zo gebouwd.** Ze was gemodelleerd naar de
`remove_shift_member`-fix in #7, maar dat was een bugfix met dezelfde naam
én parameterlijst; dit ticket voegt `start_shift` een derde parameter toe.
Postgres identificeert een functie op naam *én* parameterlijst samen —
`create or replace function start_shift(p_member_id uuid, p_pin text,
p_activity_type_id uuid)` vervangt de bestaande 2-parameter-functie dus
niet, het voegt een nieuwe, overloaded functie ernaast toe. Gebouwd:

- `drop function if exists start_shift(uuid, text);` vóór de
  `create or replace` hierboven — zonder deze drop zou de oude
  2-parameter `start_shift` (zonder de "verplicht"-afdwinging) gewoon
  blijven bestaan en aanroepbaar blijven, wat deze hele wijziging zou
  omzeilen.
- Een eigen, expliciete `grant execute on function start_shift(uuid, text,
  uuid) to authenticated;` — de bestaande grant uit `0001_init.sql` (die
  tegen de toen enige, 2-parameter-signatuur resolvede) dekt de nieuwe
  3-parameter-functie niet automatisch.
- **(bouw)** Een eigen, expliciete `revoke execute ... from public`/`from
  anon` op die nieuwe 3-parameter-functie (zie ook de RPC's-sectie
  hierboven) — hetzelfde "nieuw functie-object, opnieuw Postgres-default
  `EXECUTE` voor `PUBLIC`"-argument geldt hier evengoed.

Zie `supabase/migrations/0019_activiteittypes.sql`'s eigen commentaar voor
de volledige uitleg; gevonden en gecorrigeerd tijdens het bouwen, niet
tijdens de Architect-fase.

## Schermflow

### 1. Beheer — nieuwe "Activiteitstypes"-kaart in Instellingen

`ActiviteitstypesInstellingen.tsx`, gerenderd naast (niet in plaats van)
`NegatieveLimietInstellingen` in `BeheerTabs.tsx`'s Instellingen-tabblad —
zelfde soort kaart-in-een-raster als het ontwerp (`chat37.md`: "Kaarten
staan nu in een responsief, scrollbaar raster"), geen tabbalk-uitbreiding
(dit blijft binnen het bestaande Instellingen-tabblad, geen vierde tab).

- Lijst via `useAlleActiviteitTypes()`: actieve types bovenaan, gearchiveerde
  onderaan, visueel gedempt (zelfde onderscheid als een gearchiveerd product
  in `ProductenLijst.tsx`).
- Per rij: naam, een "bewerken"-icoonknop (opent een inline invoerveld met
  opslaan/annuleren, matcht `chat38.md`) → `update_activity_type_name`, en
  een archiveren/herstellen-icoonknop (tekst/icoon wisselt op basis van
  huidige staat, archiveren in de bestaande danger-kleur — hergebruik het
  bestaande `text-danger`/danger-token uit deze codebase, geen nieuwe kleur
  toevoegen) → `set_activity_type_archived` met de expliciete tegenoverge-
  stelde boolean, geen bevestigingsstap (zelfde "de actieve beheer-sessie is
  al de bevestiging"-redenering als assortimentbeheer's archiveer-toggle).
- **"+ nieuw activiteittype"**: een naamveld + knop (geen aparte overlay
  nodig — dit is één simpel veld, in tegenstelling tot een nieuw product dat
  drie velden had; inline onderaan/bovenaan de kaart is voldoende, exacte
  plaatsing aan de Developer) → `create_activity_type`. Knop pas actief bij
  een niet-lege naam.
- Elke mutatie ververst de lijst (refetch van `useAlleActiviteitTypes()`),
  zelfde patroon als `ProductenLijst.tsx`.
- Foutmeldingen (elke foutcode) → Nederlandse boodschap via `role="alert"`
  in de kaart zelf, zelfde patroon als `NegatieveLimietInstellingen.tsx`.
- **Geen "x in gebruik"-teller** (het ontwerp had die, `chat37.md`) — zou
  vereisen dat deze kaart tegen `shifts` telt hoeveel diensten elk type
  gebruikt hebben; geen acceptatiecriterium vraagt hierom, en het voegt een
  leesafhankelijkheid toe die de rest van deze spec niet nodig heeft. Kan een
  latere, kleine toevoeging zijn.
- **Geen "geen actief type meer over"-waarschuwing** op deze kaart zelf (het
  ontwerp had die ook, `chat37.md`) — dat signaal hoort thuis in de
  dienst-starten-stap die daadwerkelijk geraakt wordt (Schermflow §2,
  Randgevallen), niet hier nogmaals gebouwd.

**(bouw) Twee WCAG-contrastfixes op de "Opslaan"/"toevoegen"-knoppen, niet
in de spec-schets hierboven.** `check:a11y` op CI vond, ná de eerste push:

1. De "Opslaan"-knop gebruikte `text-xs` op de standaard
   `bg-accent`/`text-rail`-kleurcombinatie — 4.25:1 contrast, maar bij die
   tekstgrootte (12px) eist WCAG-AA 4.5:1. Elke andere `bg-accent`/
   `text-rail`-knop in de codebase (Leden, Producten, Beheer-login, enz.)
   gebruikt `text-sm` (14px): bij 14px+bold valt een knop onder WCAG's
   "grote tekst"-drempel (3:1). Fix: `text-xs` → `text-sm`, het overal al
   gebruikte patroon gevolgd (commit `b32d4dc`).
2. De eigenlijke oorzaak, pas hierna gevonden: `hover:bg-accent-hover` op
   diezelfde `text-rail`-knoppen. `tailwind.config.ts`'s eigen commentaar
   bij de `accent`-kleur documenteert dit al — `accent.hover`/`.active` zijn
   alleen 4.5:1-compliant voor wit/licht tekst, niet voor `text-rail` (donker)
   tekst. Playwright's cursor blijft na een klik op "bewerken" op de plek van
   de nieuwe knop staan, dus `axe` scant 'm in `:hover`-staat — reproduceerbaar
   voor een echte muisgebruiker, geen testartefact. Fix: `hover:bg-accent-hover`
   verwijderd van de twee `text-rail`-knoppen in dit nieuwe bestand ("Opslaan",
   "toevoegen"); ze vallen terug op de altijd-compliante `DEFAULT`-kleur, geen
   nieuwe hoverstijl (commit `989774c`).

**Niet meegenomen in #18, bewust:** dezelfde `hover:bg-accent-hover`/
`text-rail`-combinatie zit op minstens 9 andere, bestaande knoppen elders in
de app (`LedenLijst`, `NieuwLidOverlay`, `LidBeherenOverlay`, `BeheerLogin`,
`NegatieveLimietInstellingen`, `NieuwProductOverlay`, `ProductenLijst`,
`ProductBeherenOverlay`, `MijnAccountOverlay`) — dezelfde latente bug, alleen
nog niet gevangen omdat geen bestaande a11y-test daar toevallig een echte
hover triggert. Vastgelegd als [issue #66](https://github.com/BramLambertJansen/ABAS/issues/66),
niet hier meegefixt om deze PR niet te verbreden. Zie ook
`docs/ARCHITECTURE.md` → Design reference.

### 2. Dienst starten — nieuwe stap tussen stafkeuze en PIN

`DienstStarten.tsx`, tussen de bestaande stappen "Wie start de dienst?"
(`StaffPicker`) en `PinPad`. Nieuwe lokale state `selectedActivityType` naast
het bestaande `selectedStaff`/`pin`.

1. **Stafkeuze** (ongewijzigd) → op een naam tikken zet `selectedStaff` en
   gaat nu naar stap 2 (activiteitkeuze), niet meer direct naar `PinPad`.
2. **Activiteitkeuze** (nieuw): "Voor welke activiteit is deze dienst?" +
   een dropdown (`<select>`, matcht het ontwerp se eindvorm na `chat37.md`'s
   chips→dropdown-wijziging) gevuld met `useActiviteitTypes()` (alleen
   actieve types). Placeholder "Kies een activiteit…". Een "terug"-link naar
   de stafkeuze (reset `selectedStaff` én `selectedActivityType`, zelfde
   `backToStaffPicker`-achtige functie als vandaag, uitgebreid). Zodra een
   type gekozen is: automatisch door naar stap 3 (`PinPad`) — zelfde
   "auto-doorschakelen zodra de invoer compleet is"-stijl als de PIN-invoer
   zelf, geen aparte "volgende"-knop nodig voor een enkele dropdown-keuze.
3. **PIN-invoer** (grotendeels ongewijzigd qua UI/gedrag): "terug" gaat nu
   naar de activiteitkeuze van stap 2 (niet meer direct naar de stafkeuze) —
   `selectedStaff` blijft daarbij behouden, alleen `pin`/foutstatus wordt
   gewist, zelfde detail-niveau als de bestaande `backToStaffPicker()`. Bij
   de 4e cijferinvoer: `startShiftMutation.startShift(selectedStaff.id, pin,
   selectedActivityType.id)`. **(bouw)** Één kleine copy-aanpassing, niet in
   de spec-schets: `PinPad.tsx` toonde altijd de vaste terugknop-tekst "←
   andere bardienst", wat niet meer klopte zodra "terug" hier naar de
   activiteitkeuze gaat in plaats van de stafkeuze. `PinPad` kreeg een
   optionele `backLabel`-prop (default ongewijzigd, `"← andere bardienst"`,
   dus elke andere aanroeper blijft ongemoeid); deze stap geeft
   `backLabel="← andere activiteit"` mee. Kleine, binnen dit ticket
   opgepakte copy-fix (commit `d18b7bc`), geen nieuw gedrag.
4. **Succes** → zoals vandaag, `openShift.refetch()`, dienst is open,
   `DienstTabs` neemt het over.
5. **Fout** (`invalid_activity_type`/`activity_type_not_found`/
   `activity_type_archived`) → zie Randgevallen: dit hoort niet bij een
   foute PIN, dus de UI navigeert terug naar stap 2 met een foutmelding daar
   in plaats van de foutmelding op het PIN-scherm te tonen (waar opnieuw de
   PIN intypen het probleem toch niet oplost).

### 3. Dienst-actief-scherm — nieuwe info-regel

`DienstActief.tsx`, direct naast de bestaande "Gestart door X om HH:MM"-regel
(dezelfde visuele vorm, geen nieuwe kaart): **"Activiteit: {naam}"**. Bron:
een kleine uitbreiding van de bestaande shift-leeshook (`useOpenShift()`) met
de naam van het gekoppelde activiteittype (`select *,
activity_types(name)`-achtige join, of een tweede klein veld — implementatie
aan de Developer). Geen historisch-diensten-onderscheid nodig op dit scherm
— `DienstActief` toont per definitie alleen de huidige, open dienst, en die
heeft (bij "verplicht") altijd een activiteittype.

## Rolzichtbaarheid

- **Beheren (aanmaken/hernoemen/archiveren)**: uitsluitend binnen een actieve
  beheerder-sessie op `/beheer` — zelfde model als assortiment/leden/
  negatieflimiet. RPC-laag controleert `no_admin_role`, de kaart zelf is
  alleen bereikbaar ná een beheerder-login (Instellingen-tab van
  `BeheerTabs`).
- **Lezen (kiezen bij dienst starten, zien op het dienst-actief-scherm)**:
  iedereen op de gedeelde bar-tablet-sessie, zelfde model als de rest van
  dienst-starten/bezetting-beheren — geen aparte weergave of restrictie per
  rol, `activity_types_select`-policy staat dit toe aan elke
  `authenticated`-sessie (single-tenant).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Geen actieve activiteittypes beschikbaar op het moment van dienst starten (alle gearchiveerd, of — zonder de seed-data — een leeg systeem) | Dropdown toont "Geen actieve activiteittypes — vraag een beheerder er een toe te voegen", geen keuze mogelijk, kan niet doorgaan naar de PIN-stap. Geen echte deadlock: een beheerder bereikt `/beheer` altijd rechtstreeks (zie Datamodel → seed-toelichting), kan daar een type aanmaken zonder dat er al een dienst hoeft te draaien. |
| Activiteittype wordt gearchiveerd tussen het kiezen (stap 2) en het bevestigen van de PIN (stap 3) — race, zeldzaam op een gedeeld tablet | `start_shift` retourneert `activity_type_archived` — UI navigeert terug naar stap 2 (niet naar de PIN-foutmelding, zie Schermflow §2 stap 5), lijst ververst, gebruiker kiest opnieuw. |
| Activiteittype-id bestaat niet meer (zou in de praktijk nooit voorkomen — er is geen delete, alleen archiveren) | `activity_type_not_found`, zelfde navigatie als hierboven — puur defensief, geen realistisch pad. |
| Historische dienst zonder activiteittype (elke dienst gestart vóór deze migratie) | `activity_type_id is null` — `DienstActief` toont dit alleen voor de *huidige* open dienst (die altijd een type heeft bij "verplicht"), dus dit scenario raakt in de praktijk geen vandaag zichtbaar scherm. Een toekomstig Logboek-/overzichtsscherm (#19) dat historische diensten toont, moet zelf met `null` omgaan (bv. "—") — niet dit ticket se verantwoordelijkheid om dat scherm te bouwen. |
| Gearchiveerd activiteittype dat nog aan bestaande (oude of net-gestarte) diensten hangt | Blijft gewoon zichtbaar via de foreign-key-relatie — nooit verwijderd, zelfde "archiveren verbergt nooit historie"-patroon als producten/`order_lines.unit_cents`. |
| Naam-duplicaten (twee activiteittypes met dezelfde naam) | Toegestaan, geen uniqueness-constraint — zelfde keuze als `products.name`/`category`, geen acceptatiecriterium vraagt om uniciteit. |
| Beheerder archiveert het laatst-overgebleven actieve type | Toegestaan, geen RPC-guard (zie "Besloten door de Architect" hieronder) — dienst-starten laat dan de "geen actieve types"-staat zien (eerste rij van deze tabel) tot een beheerder een type terugzet of een nieuwe aanmaakt. |
| A11y van de nieuwe Instellingen-kaart (inline bewerken) en de nieuwe activiteitkeuze-stap in dienst-starten | Tester moet `e2e/a11y.spec.ts` uitbreiden met (a) de Instellingen-staat met een geopend inline-bewerkveld, en (b) de nieuwe activiteitkeuze-stap in de dienst-starten-flow — zelfde soort aanvulling als eerdere stateful-scenario's (`bezetting-beheren.md`/`ledenbeheer.md`'s precedent). Beide zijn platte formulier-elementen (`<select>`, tekstvelden, knoppen), geen nieuwe overlay-primitive nodig, dus geen nieuwe a11y-vereisten buiten wat al bestaat. |

## Besloten door de Architect

- **Geen "laatste actieve type"-RPC-guard.** Overwogen (analoog aan
  `set_member_archived`'s `self_archive_forbidden`), niet gebouwd:
  `docs/features/ledenbeheer.md` → "Nieuw precedent: zelfreferentie-guards"
  overwoog expliciet een vergelijkbare "laatste beheerder"-telling voor
  `members` en verwierp die bewust — hier is het risico kleiner (geen
  sessie die zichzelf buitensluit, alleen een dienst-starten-stap die tot een
  duidelijke, herstelbare staat leidt, zie Randgevallen), dus dezelfde
  terughoudendheid geldt a fortiori.
- **Standaard-rijen in de migratie zelf, niet alleen in `supabase/seed.sql`.**
  Zie Datamodel — een productie-relevante afweging (leeg systeem +
  "verplicht" kan het starten van de allereerste dienst blokkeren), niet
  louter een dev-gemak zoals de meeste `seed.sql`-fixtures.
- **Atomische uitbreiding van `start_shift`, geen losse
  `set_shift_activity_type`-RPC.** Zie RPC's → "Wijziging aan een bestaande,
  al gemergede RPC".
- **Geen tonen van activiteit in `DienstAfsluitenOverlay.tsx` (#12).** Zou
  een kleine, voor de hand liggende vervolgstap zijn (het ontwerp toonde dit
  ook in de sluit-samenvatting), maar geen acceptatiecriterium van dit ticket
  vraagt erom en het raakt een al gemergede spec/component die deze spec niet
  zonder reden wil heropenen. Zie Expliciet buiten scope.

## Expliciet buiten scope

- **Rapportage/filtering per activiteittype, elke koppeling met het
  toekomstige Logboek-scherm (#19)** — dat blijft een aparte, nog te
  schrijven spec; dit ticket levert alleen de datalaag (welke dienst had
  welk activiteittype) die zo'n toekomstige spec nodig zou hebben.
- **Tonen van het activiteittype in `DienstAfsluitenOverlay.tsx` se
  dienst-overzicht (#12)** — zie "Besloten door de Architect" hierboven.
- **Kleur/icoon per activiteittype** — het ontwerp heeft dit niet, alleen
  `name`/`archived` (zie "Onderzocht in /designs/").
- **Een "x in gebruik"-teller of "geen actief type meer"-waarschuwing op de
  Instellingen-kaart** — zie Schermflow §1.
- **Wijzigen van het activiteittype van een dienst nádat de dienst al
  gestart is** — onveranderlijk zodra gezet, zelfde soort onveranderlijkheid
  als `shifts.started_by`/`started_at`. Geen "activiteit corrigeren
  halverwege"-actie in deze spec.
- **Elke koppeling met "contant/pin-verkoop zonder lid" (#39)** — een ander,
  toevallig soms ook "Activiteiten" genoemd concept in het ontwerp (zie Doel)
  — geen inhoudelijk verband met activiteit**typen**.
- **Race-condition-bescherming** bij gelijktijdige schrijfacties (twee
  beheerders die tegelijk hetzelfde type bewerken/archiveren) — zelfde
  "geen scope"-afweging als issue #29 elders in deze codebase.
- **Migratie/backfill van historische diensten naar een activiteittype** —
  historische diensten blijven `null`, zie Randgevallen.

## `useShell()`-contract

Geen nieuwe invulling. De Instellingen-kaart is, net als
`NegatieveLimietInstellingen`, een gewone kaart binnen de bestaande
`/beheer`-pagina — geen overlay, geen `useShell().overlay`-gebruik. De
nieuwe activiteitkeuze-stap in dienst-starten is, net als `StaffPicker`/
`PinPad`, een volledige-schermstap binnen de bestaande donkere PIN-flow —
geen overlay, geen grid dat `useShell().columns` nodig heeft (één dropdown,
geen lijst kandidaten om in kolommen te leggen). `density` blijft, zoals
overal elders, zonder een eerste concrete consument.

## Beantwoorde vraag (Bram, 2026-09-22)

**Was: is het kiezen van een activiteittype bij het starten van een dienst
verplicht (blokkeert het starten tot er iets gekozen is) of optioneel (mag
worden overgeslagen, dienst start dan zonder activiteittype)? Antwoord:
verplicht.** Zo gebouwd — verplicht was al de uitgewerkte aanname, geen
wijziging aan de rest van deze spec nodig geweest.

Onderzoek (zie "Onderzocht in /designs/") wees sterk richting **verplicht**:
Bram's eigen woorden in `chat36.md` ("een dienst *moet* gekoppeld zitten aan
een activiteit … bij het starten van een dienst *moet* je aangeven voor welke
activiteit het is") en het ontwerp zelf, dat de bevestigknop functioneel
blokkeerde tot er een keuze was. Deze spec was dan ook volledig uitgewerkt
voor "verplicht" en dat was de aanbeveling van de Architect.

Toch destijds expliciet aan Bram voorgelegd, niet als aanname gebouwd: die
chats zijn volgens `docs/ARCHITECTURE.md` zelf "useful for *why*, not
binding on *what we build*", dit ticket veranderde het gedrag van een al
gebouwd, dagelijks gebruikt scherm (dienst-starten, #6), en CLAUDE.md →
Werkstraat is expliciet dat "gedrag bij een edge case" — en dit was meer dan
een edge case, het raakt de hoofdroute van elke dienststart — een vraag aan
Bram was, geen Architect-aanname.

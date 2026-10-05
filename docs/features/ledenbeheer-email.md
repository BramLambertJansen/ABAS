# Ledenbeheer — optioneel e-mailveld (#57)

Spec voor [issue #57](https://github.com/BramLambertJansen/ABAS/issues/57).

> **Bijgewerkt door [`account-koppeling-bewijs.md`](account-koppeling-bewijs.md)
> (ADR 0020, migratie `0040`, gemerged in [PR #157](https://github.com/BramLambertJansen/ABAS/pull/157),
> 2026-10-05):** `update_member_email` wist nu ook een openstaande
> uitnodiging (`invited_at` en `invited_auth_user_id` naar `null`) zodra het
> adres na `lower(trim(...))` verandert, ook bij wissen; alleen hoofdletters
> wijzigen laat de uitnodiging staan. `list_members_admin()` geeft
> `invited_auth_user_id` als laatste kolom mee.

**Aanvulling (2026-09-02, P1-bevinding op PR #59, geen nieuw ticket):** een
geautomatiseerde code-review op PR #59 signaleerde dat de oorspronkelijke
aanname onder "Rolzichtbaarheid" hieronder — "geen nieuwe leestoegang nodig,
`members_select` volstaat" — klopt voor de UI maar niet voor de database: de
gedeelde bar-tablet-sessie authenticeert als dezelfde Postgres-rol
(`authenticated`) als een beheerder-sessie, dus gaf `members_select` ook
bardienst leesrecht op `members.email` via een rechtstreekse query, los van
welk scherm de app toont. Zie [ADR
0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md) voor de volledige
analyse en het gekozen patroon. "RPC's", "Leeshook" en "Rolzichtbaarheid"
hieronder zijn bijgewerkt naar de gecorrigeerde staat (migratie
`0009_ledenbeheer_email_rpc_gated_read.sql`, opeenvolgend na `0008`, die zelf
ongewijzigd blijft — al gemerged onderdeel van deze PR's geschiedenis).

Vervolgticket op [`docs/features/ledenbeheer.md`](./ledenbeheer.md) (#13,
PR #55) — zie dat document → "Acceptatiecriterium bewust niet meegenomen"
voor de aanleiding: #13's acceptatiecriterium *"een e-mailadres is
optioneel, geen verplicht veld"* doelde op een e-mailveld bij het aanmaken/
bewerken van een lid zelf. Dat veld is niet gebouwd in ledenbeheer (#13,
PR #55) — een geautomatiseerde review-vondst op PR #56 tijdens de
Docs-afronding van ledenbeheer. Bram heeft besloten: klein, apart
vervolgticket (#57), geen heropening van #13/#55.

Deze spec bouwt **alleen** het veld en de opslag ervan — geen
`inviteUserByEmail`-uitnodigingsgedrag. Dat blijft volledig bij
[#24](https://github.com/BramLambertJansen/ABAS/issues/24)
(`docs/ARCHITECTURE.md` → "Lid-accounts"). Die sectie beschrijft vandaag al
*"Het invullen en opslaan van een (nieuw) e-mailadres is de trigger om via
`inviteUserByEmail()` … een magic-link-invite te versturen"* — dat is een
beschrijving van wat **#24** zal bouwen, niet van wat hier gebouwd wordt. Na
deze spec bestaat de kolom en het scherm-veld, maar het invullen ervan
triggert nog helemaal niets: geen invite, geen Supabase Auth-account, geen
enkele server-side call naar `supabase.auth.admin.*`. `docs/ARCHITECTURE.md`
→ "Lid-accounts" wordt door deze spec niet gewijzigd — de sectie blijft
correct als beschrijving van #24's toekomstige gedrag.

## Doel

Een beheerder kan, binnen de bestaande `/beheer` → Leden-sessie
(`docs/features/ledenbeheer.md`), bij het aanmaken van een nieuw lid en bij
het beheren van een bestaand lid een e-mailadres invullen, tonen en
wijzigen — optioneel, nooit verplicht. Dat is de volledige scope: geen
gedrag dat aan een ingevuld e-mailadres vasthangt buiten het opslaan zelf.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen
als volgt:**

- **"Geld beweegt alleen via RPC."** Niet van toepassing in de geld-zin
  (geen `balance_cents`-wijziging) — maar wel relevant voor het bredere
  patroon "`members` alleen via RPC, nooit een directe tabel-write": deze
  spec voegt geen directe write toe, alleen een uitbreiding van
  `create_member` en een nieuwe RPC `update_member_email`, exact zoals
  `ledenbeheer.md` dat voor `name`/`role`/`archived` al deed.
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — beheerder-only ledenbeheer buiten shift-context, zelfde
  redenering als `ledenbeheer.md` → Doel.

## Betrokken shell

`shells/bar` alleen, binnen de bestaande `/beheer` → Leden-tab
(`src/features/ledenbeheer/`). Geen wijziging aan `shells/portal` — dit
ticket bouwt geen portal-inlogflow (#15) en geen zelfbedieningsuitnodiging
(#24); het e-mailveld is hier puur beheerder-ingevoerde, beheerder-only
opslag.

## Datamodel

**Nieuwe kolom `members.email text`, nullable, geen default.** Migratie
`supabase/migrations/0008_ledenbeheer_email.sql` (opeenvolgend na
`0007_ledenbeheer.sql`).

- **Nullable, net als `auth_user_id`** (`0005_assortimentbeheer.sql`: `alter
  table members add column auth_user_id uuid unique references
  auth.users(id)`) — een lid zonder e-mail bestaat gewoon
  (`docs/ARCHITECTURE.md` → "Lid-accounts": *"Een `lid`-record … bestaat
  onafhankelijk van een Supabase Auth-account"*).
- **Geen `unique`-constraint, bewust anders dan `auth_user_id`.**
  `auth_user_id` is uniek omdat het een 1-op-1-koppeling naar een
  *bestaand* `auth.users`-record is (twee leden mogen nooit hetzelfde
  auth-account claimen) — dat is een integriteitseis over een koppeling,
  geen eis over het e-mailadres zelf. Voor `members.email` is er geen
  vergelijkbare technische noodzaak: het is op dit moment een vrij
  tekstveld zonder gekoppeld gedrag. Een uniqueness-constraint zou ook een
  reëel domeinscenario blokkeren dat dit ticket niet mag aannemen te
  verbieden (bv. een jeugdlid waarvan een ouder hetzelfde e-mailadres
  beheert voor meerdere kinderen) — noch het ticket, noch
  `docs/ARCHITECTURE.md` beslist dat twee leden nooit hetzelfde
  e-mailadres mogen delen. **Gevolg voor #24, expliciet genoteerd, geen
  blokkade hier:** zodra #24 `inviteUserByEmail` bouwt, kan het opnieuw
  gebruiken van hetzelfde e-mailadres bij een tweede lid een conflict geven
  zodra beide leden een auth-account krijgen (`auth_user_id` is wél uniek).
  Dat is een #24-probleem — deze spec voegt daar geen constraint voor toe;
  #24's eigen spec moet die botsing behandelen (bv. door te weigeren als
  het e-mailadres al aan een ander lid met een actief `auth_user_id` hangt).
- **Wél een db-level formaat-`check`-constraint, als extra laag naast de
  RPC-validatie** — zelfde soort verdediging-in-de-tabel als
  `products.price_cents integer not null check (price_cents > 0)`
  (`0001_init.sql`): de RPC blijft de primaire, foutcode-dragende
  validatielaag (zie RPC's), de tabel-constraint is een laatste vangnet
  tegen elke toekomstige schrijfweg die de RPC's zou omzeilen.
  ```sql
  alter table members add column email text;
  alter table members add constraint members_email_format_check
    check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  ```
- **`members` staat al sinds `0001_init.sql` in de blanket-REVOKE** (regel
  137: `revoke insert, update, delete on members, … from authenticated`) —
  **geen nieuwe REVOKE nodig** in `0008_ledenbeheer_email.sql`, exact zoals
  `ledenbeheer.md` → Datamodel dat voor de eerdere vier RPC's al noteerde.
  Expliciet vermeld zodat de Developer 'm niet per ongeluk dubbel toevoegt.
  **Dat blanket-REVOKE is `insert, update, delete` — het dekt geen
  `select`.** `members_select` (`0001_init.sql`, regel 124: `for select to
  authenticated using (true)`) laat lezen dus wél breed toe, en dat werd pas
  een probleem toen `0008` er een PII-kolom (`email`) aan toevoegde — zie de
  aanvulling bovenaan dit document en [ADR
  0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md) voor de
  column-level `select`-REVOKE die dat corrigeert, apart van (en niet in
  tegenspraak met) de write-REVOKE hier.

## RPC's

Twee wijzigingen in `supabase/migrations/0008_ledenbeheer_email.sql`, beide
in dezelfde ADR 0002-`auth.uid()`-actorcheck-vorm als de vier bestaande
RPC's in `0007_ledenbeheer.sql` (inclusief het `select * into v_actor`
post-implementatie-patroon).

### 1. `create_member` — uitgebreid met een derde, optionele parameter

`create_member(p_name text, p_starting_balance_cents integer)` wordt
`create_member(p_name text, p_starting_balance_cents integer, p_email text
default null)`. Dit is de creatie-tijd-waarde voor e-mail, zelfde soort
"initiële waarde op een nieuwe rij" als `p_starting_balance_cents` al is
(`ledenbeheer.md` → Doel: *"geen 'beweging' … alleen een initiële waarde op
een nieuwe rij"*) — geen aparte "set email bij aanmaken"-RPC nodig, één RPC
voor de hele creatie-schrijfactie blijft het patroon.

**Technisch aandachtspunt voor de Developer — geen kopieerbare
`create or replace`:** Postgres behandelt twee functies met hetzelfde
`create_member`-argumentenaantal (2 vs. 3, ook al heeft de derde een
default) als *verschillende* functies, niet als een vervanging — een kale
`create or replace function create_member(p_name text,
p_starting_balance_cents integer, p_email text default null) …` naast de
bestaande 2-parameter-versie laat **beide** functies bestaan
(`create_member(text, integer)` én `create_member(text, integer, text)`),
wat een dubbelzinnige overload oplevert zodra de client met alleen de eerste
twee named parameters aanroept. `0008_ledenbeheer_email.sql` moet daarom
eerst de oude functie droppen:

```sql
drop function if exists create_member(text, integer);

create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer,
  p_email text default null
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_balance_cents integer;
  v_email text;
  v_member members;
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

  v_balance_cents := coalesce(p_starting_balance_cents, 0);
  if v_balance_cents < 0 then
    raise exception 'invalid_starting_balance' using errcode = 'P0001';
  end if;

  -- Leeg/whitespace-only -> null ("geen e-mailadres", het normale geval —
  -- zie Randgevallen). Niet-leeg moet een minimaal e-mailformaat matchen.
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived, email)
  values (v_name, 'lid', v_balance_cents, null, null, false, v_email)
  returning * into v_member;

  return v_member;
end;
$$;

grant execute on function create_member to authenticated;
```

(Een `drop function` op `create_member` heeft geen dependent objects — geen
view/andere functie roept 'm aan — dus geen `cascade` nodig. De `grant`
moet hier opnieuw, want een `drop` + nieuwe `create` is een nieuw
database-object; het bestaande grant uit `0007_ledenbeheer.sql` gaat niet
automatisch mee.)

### 2. `update_member_email` — nieuwe RPC

Nieuwe, losse RPC voor het wijzigen van het e-mailadres van een *bestaand*
lid (los van het aanmaken) — zelfde "één RPC per losse schrijfactie"-patroon
als `update_member_name` naast `create_member`.

```sql
create or replace function update_member_email(
  p_member_id uuid,
  p_email text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_email text;
  v_member members;
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

  -- Geen eis dat het lid niet gearchiveerd is — zelfde redenering als
  -- update_member_name (ledenbeheer.md → Randgevallen "Gearchiveerd lid,
  -- naam wijzigen").
  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Leeg/whitespace-only -> null: een beheerder kan een e-mailadres ook
  -- weer verwijderen (zie Randgevallen "E-mailadres wissen").
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  update members set email = v_email where id = p_member_id
    returning * into v_member;

  return v_member;
end;
$$;

grant execute on function update_member_email to authenticated;
```

**Foutcodes, consistent met de bestaande stijl
(`invalid_name`/`invalid_starting_balance`/`invalid_role`):**

- `invalid_email` — nieuw, door beide RPC's hierboven. Nederlandse melding:
  **"vul een geldig e-mailadres in, of laat het veld leeg"**.
- `member_not_found` — bestaand, alleen `update_member_email` (geen
  creatie-RPC kent deze code).
- `actor_not_found` / `no_admin_role` — bestaand, ongewijzigd, beide RPC's.
- `invalid_name` / `invalid_starting_balance` — bestaand, alleen
  `create_member`, ongewijzigd.

### 3. `list_members_admin` — nieuwe RPC (ADR 0004, migratie `0009`)

**Reden, niet in de oorspronkelijke versie van deze spec voorzien:** zie de
aanvulling bovenaan dit document en [ADR
0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md). `members.email`
mag niet via de brede `members_select`-policy leesbaar blijven, want die
policy geldt voor elke `authenticated`-sessie — inclusief de gedeelde
bar-tablet-sessie (bardienst), die dit veld volgens CLAUDE.md → Domein niet
hoort te kunnen lezen. Zelfde structuur als "geld alleen via RPC", hier
toegepast op een leesrecht: `email` uit de kolommenlijst van `authenticated`
halen + een `SECURITY DEFINER`-RPC met de ADR-0002-actorcheck.

**Correctie (Bram, na een echte `db:test`-run in CI, PR #59):** een kale
`revoke select (email) on members from authenticated` bleek geen effect te
hebben — `authenticated` heeft al een tabel-brede SELECT-grant op `members`
(Supabase's platform-default, nodig voor RLS), en een column-level REVOKE
kan die niet overrulen in Postgres. De werkende vorm: de tabel-brede
SELECT intrekken en de overgebleven kolommen (alles behalve `email`)
expliciet teruggeven. Zie [ADR 0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md)
voor de volledige uitleg.

**Naam:** `list_members_admin` — gekozen naar analogie van de bestaande
`_admin`/`no_admin_role`-naamgeving in deze RPC-familie (het foutcode-woord
`no_admin_role` hierboven, en het feit dat dit de eerste *lees*-RPC in deze
codebase is: geen bestaand `list_`/`get_`-precedent om exact te volgen, dus
een expliciete, zelfverklarende naam die het beheerder-only-karakter al in de
naam draagt, net zoals `update_member_email`/`set_member_role` het object en
de actie in de naam dragen).

`supabase/migrations/0009_ledenbeheer_email_rpc_gated_read.sql`:

```sql
-- ADR 0004: members.email is PII die niet via de brede members_select-policy
-- leesbaar mag blijven (die geldt voor elke `authenticated`-sessie,
-- inclusief de gedeelde bar-tablet-sessie). `authenticated` heeft al een
-- tabel-brede SELECT-grant op members (Supabase-platformdefault, nodig
-- voor RLS) -- een column-level REVOKE kan die niet overrulen, dus: de
-- tabel-brede SELECT intrekken en alle kolommen behalve email expliciet
-- teruggeven (zie ADR 0004 voor de volledige uitleg van deze correctie).
revoke select on members from authenticated;
grant select (
  id, name, role, pin_hash, balance_cents, archived, created_at, auth_user_id
) on members to authenticated;

create or replace function list_members_admin()
returns setof members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
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

  return query select * from members order by name asc;
end;
$$;

grant execute on function list_members_admin to authenticated;
```

**Foutcodes:** `actor_not_found`/`no_admin_role`, zelfde betekenis en
Nederlandse afhandeling als elders in deze RPC-familie — geen nieuwe code.

**Andere lezers van `members` blijven ongewijzigd.** `useMembers()`
(verkoop-ledenzoeker, `src/hooks/queries/useMembers.ts`) en `useBarStaff()`
selecteren nooit `email` — geverifieerd, geen aanpassing nodig, ze blijven op
de bestaande brede `members_select`-policy draaien voor de kolommen die ze
wél gebruiken (de column-level REVOKE raakt alleen `email`).

**E-mailformaat-check, drie plekken, bewust niet één gedeelde bron** (zelfde
situatie als `parseEuroToCents()` dat de cents-rekenlogica van de RPC
spiegelt zonder SQL te importeren): de db-`check`-constraint (Datamodel), de
RPC-validatie hierboven, en een client-side `isValidEmailFormat()`-helper
(zie Schermflow) delen bewust hetzelfde eenvoudige patroon
(`^[^\s@]+@[^\s@]+\.[^\s@]+$`) — geen uitputtende RFC 5322-validatie, alleen
een minimale "ziet eruit als een e-mailadres"-check, consistent met hoe
`parseEuroToCents()` ook geen volledige valuta-parser is.

## Leeshook

**`useAlleLeden()` (`src/hooks/queries/useAlleLeden.ts`) breidt uit, geen
nieuwe hook.** `LedenbeheerLid` krijgt een vierde veld: `email: string |
null`.

**Gecorrigeerd t.o.v. de oorspronkelijke versie van deze spec (ADR 0004, zie
RPC's → `list_members_admin`):** de hook doet **geen** directe
`.from("members").select(...)` meer voor dit doel — `members.email` is
column-level `REVOKE`d voor `authenticated`, dus zou die select nu een
kolomfout teruggeven. In plaats daarvan: `supabase.rpc("list_members_admin")`,
zonder parameters. `.order("name", { ascending: true })` vervalt op de
client — de RPC sorteert zelf al (`order by name asc` in de functie) — maar
een eventuele client-side her-sortering wegnemen is optioneel, geen
functionele eis; de Developer mag 'm laten staan als extra garantie zonder
dat dat een architectuurkeuze is.

Zelfde `LedenbeheerLid`-return-type en error-afhandeling-stijl als voorheen
(try/catch rond de call, vaste Nederlandse foutmelding, `console.error`
loggen) — alleen de databron binnen de hook verandert, niet het contract
naar de callers (`LedenLijst.tsx`, `LidBeherenOverlay.tsx`,
`NieuwLidOverlay.tsx` blijven ongewijzigd).

## Schermflow

Nieuwe helper `src/lib/email.ts`, naast `money.ts`:

```ts
/** Minimale "ziet eruit als een e-mailadres"-check, zelfde eenvoudige
 *  patroon als de RPC's/db-constraint (docs/features/ledenbeheer-email.md
 *  → RPC's) — geen uitputtende RFC 5322-validatie. Alleen aanroepen met een
 *  al-getrimde, niet-lege waarde: een lege/whitespace-only invoer is "geen
 *  e-mailadres" (geldig, want optioneel), niet "ongeldig formaat". */
export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
```

1. **`NieuwLidOverlay.tsx`** — derde veld, na Naam en Startsaldo (optioneel).
   Label **"E-mailadres (optioneel)"** (zelfde `<label>`-vorm als "Naam",
   optionaliteit in de label-tekst zelf omdat dit veld geen `€`-prefix
   heeft om een placeholder-conventie als "Startsaldo" te volgen), `type="email"`.
   "Toevoegen" pas actief bij: niet-lege naam **en** (leeg
   startsaldo-veld **of** een geldig bedrag) **en** (leeg e-mailveld **of**
   `isValidEmailFormat(trimmed)`). Tik op "Toevoegen" → `create_member` met
   het getrimde e-mailveld, of `null` bij een leeg veld (zelfde
   leeg-veld-stuurt-`null`-patroon als startsaldo). Geen apart succes-toast
   voor e-mail — het bestaande **"[Naam] toegevoegd"**-toast dekt de hele
   creatie, inclusief het e-mailadres.
   - Het klik-prototype (`designs/Bar App.dc.html`, regel 1276–1278) heeft
     dit veld niet — geen wireframe-precedent hier. Dat is normale evolutie
     (`CLAUDE.md` → Designbestanden: *"Daarna is het in-app design system de
     waarheid; afwijking van de wireframe is normale evolutie, geen
     defect"*) — `ledenbeheer.md` had zelf al hetzelfde soort afwijking
     (het "Barrechten"-veld in een andere vorm dan het prototype).
2. **`LidBeherenOverlay.tsx`** — nieuw onafhankelijk actieblok
   **"E-mailadres"**, tussen "Naam wijzigen" en "Barrechten" (zelfde
   volgorde-logica als creatie: naam, dan e-mail, vóór de hogere-impact
   acties Barrechten/Archiveren — geen architectuurkeuze, vrijheid voor de
   Developer om dit anders te plaatsen als de a11y-doorloopvolgorde daar
   beter bij vaart, zelfde soort vrijheid als `ledenbeheer.md`'s
   tabvolgorde-vrijheid). Input vooringevuld met het huidige e-mailadres
   (leeg als `null`), `type="email"`. "Opslaan" pas actief bij: de
   getrimde waarde wijkt af van het huidige e-mailadres (`member.email ??
   ""`) **en** (leeg **of** `isValidEmailFormat(trimmed)`). Tik op
   "Opslaan" → `update_member_email` met de getrimde waarde, of `null` bij
   een leeg veld. Succes-toast: **"E-mailadres bijgewerkt"** (zelfde toon
   als "Naam bijgewerkt"/"Rechten bijgewerkt") — geen apart bericht voor
   "verwijderd" versus "gewijzigd", zelfde niet-onderscheidende patroon als
   "Naam wijzigen".
3. **Geen wijziging aan `LedenLijst.tsx`.** Het e-mailadres wordt niet in de
   ledenlijst-rij getoond — geen acceptatiecriterium van #57 vraagt daarom,
   en de rij toont vandaag alleen naam/rolbadge/saldo (`ledenbeheer.md` →
   Schermflow stap 1). Zie Expliciet buiten scope.

## Rolzichtbaarheid

Alleen bereikbaar met een actieve beheerder-sessie op `/beheer`; alle drie
de RPC's (`create_member`, `update_member_email`, `list_members_admin`)
controleren `no_admin_role` server-side, zelfde verdediging-in-twee-lagen.

**Gecorrigeerd t.o.v. de oorspronkelijke versie van deze spec (ADR 0004):**
de eerdere aanname hier — "het lezen van `members.email` loopt via de
bestaande `members_select`-policy, geen nieuwe leestoegang nodig" — was
onjuist. Die policy geldt voor élke `authenticated`-sessie, dus ook de
gedeelde bar-tablet-sessie (bardienst), niet alleen beheerder-sessies op
`/beheer`; de UI-gating van `/beheer` is geen database-garantie tegen een
rechtstreekse query. `members.email` is nu column-level `REVOKE`d voor
`authenticated` en uitsluitend leesbaar via `list_members_admin`'s eigen
actorcheck — zie RPC's. **Wél een nieuwe negatieve RLS-test nodig**, niet
voor een nieuwe policy (er komt geen bij) maar voor de nieuwe REVOKE: een
directe `select email from members` als gewone `authenticated`-sessie moet
falen. Zie Randgevallen → "Negatieve tests".

## Randgevallen

- **`invalid_email`** — e-mailadres is niet leeg maar matcht het minimale
  formaat niet (bv. "test", "test@", "test@test"). Nederlandse melding: "vul
  een geldig e-mailadres in, of laat het veld leeg". Bereikbaar via de UI
  (in tegenstelling tot `invalid_role`, dat puur een server-fallback is) —
  de client-side `isValidEmailFormat()`-check voorkomt de meeste gevallen
  via de disabled-knop, maar blokkeert de knop niet hard genoeg tegen elke
  edge case (bv. plakken van tekst na een eerdere geldige waarde in een
  race met de disabled-state) — vandaar dat de RPC dit zelf ook blijft
  valideren, zelfde niveau van client-guard als elders in deze codebase.
- **E-mailadres wissen** — een beheerder kan een al ingevuld e-mailadres
  weer leegmaken via `LidBeherenOverlay.tsx` (leeg veld, "Opslaan" actief
  want dat wijkt af van de huidige, niet-lege waarde) → `update_member_email`
  met een leeg/whitespace-only string → RPC slaat `null` op. Toegestaan,
  geen aparte bevestiging — dit ticket bouwt geen `inviteUserByEmail`-gedrag
  dat een "al uitgenodigd, kan niet meer terug"-staat zou kunnen impliceren
  (dat is #24's zorg, niet deze spec s'n).
- **Lid bestaat niet meer op het moment van opslaan** (race, zelfde patroon
  als `ledenbeheer.md` → Randgevallen) → `member_not_found`, Nederlandse
  foutmelding, overlay blijft open, lijst ververst.
- **Gearchiveerd lid, e-mailadres wijzigen** — toegestaan, zelfde
  redenering als `update_member_name` op een gearchiveerd lid
  (`ledenbeheer.md` → Randgevallen "Gearchiveerd lid, naam wijzigen").
- **Twee leden met hetzelfde e-mailadres** — toegestaan, geen
  uniqueness-constraint (zie Datamodel voor de motivatie en de expliciet
  benoemde spanning met #24's toekomstige `inviteUserByEmail`-gedrag). Dit
  ticket detecteert en waarschuwt daar niet voor.
- **Ingelogd, maar geen beheerder** / **ingelogd account bestaat niet
  (meer) als `members`-rij, of is gearchiveerd** — zelfde
  `no_admin_role`/`actor_not_found`-afhandeling als `ledenbeheer.md` →
  Randgevallen, ongewijzigd.
- **Dubbele/gelijktijdige wijziging** — expliciet buiten scope, zelfde
  afweging als `ledenbeheer.md` → Randgevallen / issue #29.
- **Negatieve tests** — de AC in #57 vraagt hier expliciet om. Nieuwe
  gevallen in **`supabase/tests/ledenbeheer.test.sql`** (niet een nieuw
  testbestand — zelfde bestand dat `create_member`/`update_member_name` al
  dekt), `plan(42)` moet omhoog met het aantal nieuwe assertions:
  - `create_member`: `invalid_email` (ongeldig formaat), happy path met een
    geldig e-mailadres, happy path met `null`/leeg e-mailadres (bestaand
    gedrag blijft werken na de signatuurwijziging).
  - `update_member_email`: `actor_not_found` (beide varianten, zelfde
    fixtures als de andere RPC's), `no_admin_role`, `member_not_found`,
    `invalid_email`, happy path (nieuw e-mailadres zetten), happy path
    (bestaand e-mailadres wissen naar `null`), happy path op een
    gearchiveerd lid.
  - De bestaande `create_member`/`update_member_name`-tests in dit bestand
    blijven ongewijzigd geldig (ze roepen `create_member` aan zonder derde
    argument — `p_email default null` maakt dat backwards-compatible).
  - **Aanvulling (ADR 0004, migratie `0009`):** het huidige testbestand
    staat inmiddels op `plan(61)` (Tester, PR #59) — dat cijfer moet verder
    omhoog met de nieuwe assertions hieronder; werk `select plan(N)` bij naar
    het daadwerkelijke nieuwe totaal, geen geraden getal.
    - `list_members_admin`: `actor_not_found` (beide varianten, zelfde
      fixtures als de andere RPC's in dit bestand), `no_admin_role`, happy
      path (beheerder-sessie krijgt alle leden terug, inclusief `email` voor
      leden die er een hebben en `null` voor leden zonder), en een expliciete
      assertie dat het geretourneerde `email`-veld overeenkomt met wat
      `create_member`/`update_member_email` eerder in het bestand zetten
      (bevestigt dat de RPC niet stilzwijgend een kolom weglaat).
    - **Nieuw negatief geval, apart van de RPC-tests, in dezelfde
      `throws_ok`-stijl als `supabase/tests/rls_write_protection.test.sql`**
      (niet in dat bestand zelf — dat bestand is generiek voor alle
      geld-/`members`-writes; dit is een lees-REVOKE specifiek voor #57, dus
      hoort in `ledenbeheer.test.sql` bij de rest van de e-mail-tests):
      `set local role authenticated; select throws_ok($$ select email from
      members limit 1 $$, '42501', <exacte Postgres-boodschap>, 'select op
      members.email is geblokkeerd voor authenticated buiten
      list_members_admin')`. **De exacte verwachte boodschap (derde
      argument) moet de Developer overnemen uit een echte `db:test`-run
      tegen de nieuwe REVOKE** — niet raden of kopiëren van de
      tabel-brede boodschap hierboven zonder te verifiëren dat een
      column-level REVOKE dezelfde tekst geeft; `rls_write_protection.
      test.sql`'s eigen commentaar (regel 14-20) waarschuwt hier expliciet
      voor met exact dit precedent (issue #2).
- **A11y** — de twee nieuwe velden (in bestaande overlays) vallen onder
  dezelfde a11y-scenario's die `ledenbeheer.md` → Randgevallen al aan
  `e2e/a11y.spec.ts` toevoegde ("Nieuw lid"/"Lid beheren"-overlays) — geen
  nieuw scenario nodig, wel labels/`type="email"` die axe-core/
  `eslint-plugin-jsx-a11y` zonder nieuwe waarschuwingen moeten doorstaan.

## Expliciet buiten scope

- **`inviteUserByEmail`-aanroep of enig ander uitnodigingsgedrag** —
  volledig #24 (`docs/ARCHITECTURE.md` → "Lid-accounts"). Dit ticket roept
  nergens `supabase.auth.admin.*` aan.
- **Portal-inlogflow** (#15) — ongewijzigd, niet geraakt door deze spec.
- **Uniqueness-afdwinging op `members.email`** — zie Datamodel/Randgevallen;
  bewust niet gebouwd, mogelijk relevant voor #24 maar diens beslissing.
- **E-mailadres tonen in de ledenlijst-rij (`LedenLijst.tsx`)** — geen
  acceptatiecriterium hiervoor in #57, zie Schermflow.
- **Een "invite (opnieuw) versturen"-knop** — al expliciet buiten scope
  gehouden in `ledenbeheer.md` → "Besloten door Bram" punt 1, blijft dat
  hier ook; #57 verandert dat besluit niet.
- **Volledige RFC 5322-e-mailvalidatie** — de db-constraint/RPC/client
  gebruiken bewust een minimaal patroon, zie RPC's.
- **Audit-log/`Logboek`-scherm** — niet-besloten scope, zelfde beperking als
  `ledenbeheer.md` → Expliciet buiten scope.
- **Dubbele/gelijktijdige wijziging-bescherming** — zie Randgevallen,
  zelfde afweging als elders in deze codebase (#29).

## `useShell()`-contract

Geen nieuwe invulling — beide overlays hergebruiken `Overlay.tsx`'s
bestaande `useShell().overlay`-gedrag, ongewijzigd sinds #7/#14/#13. Geen
nieuwe `columns`/`density`-invulling nodig voor een los tekstveld in een
bestaande overlay.

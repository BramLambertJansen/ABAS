# Lid-account aanmaken: magic-link invite via een handmatige knop

Spec voor [issue #24](https://github.com/BramLambertJansen/ABAS/issues/24).

**Status: gebouwd (2026-09-21), 1-op-1 conform deze spec — geen afwijking.**
Developer-commit `699480a`, Tester-commit `f00540b` (13 nieuwe pgTAP-
assertions voor `mark_member_invited`, `plan(72)` → `plan(85)` in
`supabase/tests/ledenbeheer.test.sql`, 85/85 groen). Gebouwde bestanden:
migratie `supabase/migrations/0012_lid_account_uitnodigen.sql`,
`src/lib/supabase/admin.ts`, `src/lib/inviteMember.ts`,
`src/app/(bar)/beheer/invite/route.ts`, `src/hooks/queries/
useSendMemberInvite.ts`, en de uitbreiding van `LidBeherenOverlay.tsx` — elk
exact zoals hieronder beschreven (RPC-naam, foutcodes, copy, bestandsnamen).
De rest van dit document beschrijft dus niet langer een plan maar de
daadwerkelijk gebouwde staat; verleden/tegenwoordige tijd door het document
heen ongewijzigd gelaten waar dat al klopte. Zie
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
→ Status voor de afronding van het architectuurpatroon dat deze spec
introduceerde. **Deze status beschrijft de build vóór de herziening
hieronder — inmiddels achterhaald op de punten die die herziening raakt.**

**Herzien (2026-09-21, P1-bevindingen op PR #62 — geautomatiseerde review,
Codex) — dit document beschrijft niet meer 1-op-1 wat Developer-commit
`699480a`/Tester-commit `f00540b` bouwden.** Een geautomatiseerde
reviewbot vond drie problemen op de (nog niet gemergede) PR #62 voor dit
ticket. Bram heeft, na eigen verificatie, per bevinding beslist:

1. **De "uitgenodigd op [datum], nog geen account"-tussenstaat (Datamodel,
   hieronder) was onbereikbaar** — `mark_member_invited` zette
   `auth_user_id` al bij het *versturen* van de invite (`inviteUserByEmail()`
   maakt de `auth.users`-rij meteen aan), niet bij het daadwerkelijk
   aanklikken ervan. **Gefixt** — zie "RPC's" (nieuwe RPC-namen/contracten:
   `mark_member_invite_sent`/`link_invited_member_account`) en de nieuwe
   sectie "Koppelmechanisme bij acceptatie" hieronder.
2. **De copy bij de invite-knop beloofde een wachtwoord-instelscherm dat
   nergens bestaat** (dat scherm is issue #17, niet gebouwd — `/beheer/
   callback` wisselt de code in voor een sessie en redirect direct naar
   `/beheer`, geen `updateUser({ password })`-stap). **Gefixt** — zie
   "Architect-beslissingen" → Copy, alleen de tekst is aangepast, geen nieuw
   scherm.
3. **TOCTOU-race in `mark_member_invited`** (twee gelijktijdige
   beheerder-sessies die tegelijk op "invite versturen" klikken voor
   hetzelfde lid) — **bewust niet gefixt, Bram's beslissing.** Blijft een
   geaccepteerd risico, zelfde categorie als "Dubbele/gelijktijdige
   invite-afronding" hieronder al beschreef vóór deze herziening. Geen
   wijziging op dit punt.

Elke sectie hieronder die door punt 1 of 2 geraakt wordt, is bijgewerkt en
gemarkeerd met "(herzien)". Secties zonder die markering zijn ongewijzigd
gebleven — de eerdere "Besloten door Bram"/"Architect-beslissingen
(gedelegeerd)"-beslissingen blijven onverkort van kracht, deze herziening
heropent ze niet. De Developer/Tester moeten de gewijzigde secties opnieuw
implementeren/testen vóór dit ticket opnieuw naar Reviewer gaat — de
"gebouwd"-status hierboven beschrijft de vorige, inmiddels achterhaalde
implementatie. **Migratie blijft `0012_lid_account_uitnodigen.sql`** — zie
Datamodel voor de motivatie om geen aparte `0013` te openen.

**Bijgewerkt op Bram's antwoorden (2026-09-21) — klaar voor de Developer.**
Zie "Besloten door Bram" en "Architect-beslissingen (gedelegeerd)" hieronder
voor wat er ten opzichte van de conceptversie veranderd is en waarom.

Sluit direct aan op twee al gebouwde tickets: `docs/features/ledenbeheer.md`
(#13, member-CRUD) en `docs/features/ledenbeheer-email.md` (#57, het
e-mailveld + `members.email`-kolom zelf, expliciet **zonder**
`inviteUserByEmail`-gedrag — die spec's eigen "Expliciet buiten scope"
belegt dat gedrag hier). Introduceert een nieuw architectuurpatroon (server-
side Supabase Auth Admin-calls) — zie
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md),
geaccepteerd samen met deze spec.

## Besloten door Bram (2026-09-21)

Drie punten, expliciet vastgesteld — geen aanname, geen heropening door de
Developer:

1. **Rolreikwijdte: voorlopig alleen `bardienst`/`beheerder`, niet `lid`.**
   Portal-login (#15) bestaat nog niet, dus een `lid`-rol invite zou nergens
   op een werkende afrondroute landen. `bardienst`/`beheerder`-leden hebben
   dat al wel (`/beheer/callback`, gebouwd voor #14/#42). `lid`-rol invites
   volgen pas als onderdeel van #15 zelf, geen nieuw ticket hier.
2. **Trigger-mechanisme: uitsluitend een handmatige knop, geen automatische
   invite bij het opslaan van een e-mailadres.** Dit is een bewuste
   scope-verkleining ten opzichte van #24's oorspronkelijke
   acceptatiecriterium ("eerste keer opslaan van een e-mailadres → server-
   side invite wordt verstuurd") — niet een vergeten AC. De Developer bouwt
   dus **geen** aanroep van de invite-actie vanuit `submit()`/`saveEmail()`
   in `NieuwLidOverlay.tsx`/`LidBeherenOverlay.tsx`. **Automatisch-bij-
   opslaan is een mogelijke latere uitbreiding**, geen afgesloten optie —
   zie Expliciet buiten scope.
3. **Opnieuw triggeren mag altijd, zolang er nog geen account is.** Beslist
   dezelfde vraag die de conceptversie nog openliet ("strikt eerste-keer" vs.
   "zelfherstellend zolang er geen account is") — met een pure knop-trigger
   is dit sowieso de enige zinnige vorm: elke klik op de knop is per
   definitie een bewuste, herhaalbare actie, geen eenmalige overgang die
   apart bijgehouden moet worden.

Voor de resterende drie punten (e-mailcollision-gedrag, zichtbaarheid van de
knop bij een lid met bestaand account, exacte NL-copy) gaf Bram expliciet
"rest, beste suggestie" — bewuste delegatie aan de Architect, geen gok. Zie
"Architect-beslissingen (gedelegeerd door Bram)" verderop voor de gekozen
antwoorden en de motivatie.

## Doel

Een beheerder kan, vanuit Ledenbeheer (`/beheer` → Leden-tab →
`LidBeherenOverlay.tsx`), voor een `bardienst`- of `beheerder`-lid met een
ingevuld e-mailadres en zonder gekoppeld account, handmatig een magic-link-
invite (opnieuw) versturen — de ontbrekende schakel tussen "dit lid heeft
een e-mailadres opgeslagen" (#57, al gebouwd) en "dit lid kan zelf inloggen
met wachtwoord" (ADR 0002/0005's beheer-sessiemechanisme). Er is geen
automatisch gedrag bij het opslaan van een e-mailadres zelf (zie "Besloten
door Bram" punt 2) — het aanmaken/bewerken van een lid met e-mailadres
gedraagt zich verder exact zoals `ledenbeheer.md`/`ledenbeheer-email.md` het
al beschrijven, ongewijzigd door dit ticket.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen
als volgt:**

- **"Geld beweegt alleen via RPC."** Niet van toepassing in de geld-zin —
  geen `balance_cents`-wijziging. Wél relevant voor het bredere "`members`
  alleen via RPC, nooit een directe tabel-write"-patroon: de twee
  schrijvingen op `members` zelf gaan elk via een eigen RPC, geen directe
  write **(herzien — was één RPC, nu twee, zie "RPC's")**: `invited_at`
  zetten (`mark_member_invite_sent`, aangeroepen door de beheerder-actie die
  de invite verstuurt) en `auth_user_id` koppelen
  (`link_invited_member_account`, aangeroepen door het uitgenodigde lid zelf
  op het moment dat het de invite daadwerkelijk afrondt — zie
  "Koppelmechanisme bij acceptatie"). Maar dit ticket introduceert ook een
  schrijfactie die *geen* RPC kan zijn: `inviteUserByEmail()` is een
  Supabase Auth-API-call, geen SQL, en kan dus nooit binnen een `SECURITY
  DEFINER`-functie draaien. Zie
  [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  voor hoe dat ticket zich toch aan de geest van "bevoegde schrijfacties
  lopen via een gecontroleerde server-laag, nooit direct vanaf de client"
  houdt: een server-only actie met een eigen actorcheck, met een RPC voor
  het enige stukje dat wél een SQL-schrijving is. ADR 0006 kreeg bij deze
  herziening een korte aanvulling voor `link_invited_member_account` — zie
  ADR 0006 → "Aanvulling".
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — beheerder-only ledenbeheer buiten shift-context, zelfde
  redenering als `ledenbeheer.md`/`ledenbeheer-email.md` → Doel.

## Betrokken shell(s)

`shells/bar` alleen, binnen de bestaande `/beheer` → Leden-tab
(`src/features/ledenbeheer/`) — geen nieuw scherm, een uitbreiding van het
bestaande "Inloggegevens"-blok in `LidBeherenOverlay.tsx` (zie Schermflow).

`shells/portal` is **niet** betrokken — geen wijziging, geen nieuwe route.
Met rolreikwijdte beperkt tot `bardienst`/`beheerder` (Besloten door Bram
punt 1) is er dit ticket geen scenario meer waarin de portal een rol speelt;
dat verandert pas met #15.

**Geen wijziging aan `NieuwLidOverlay.tsx`.** `create_member` zet `role`
altijd op `'lid'` (kolomdefault, `ledenbeheer.md` → Datamodel) — een net
aangemaakt lid heeft dus per definitie nooit de rol die dit ticket vereist
voor een invite. Het e-mailveld bij aanmaken (#57) blijft precies zoals het
is; een invite wordt pas mogelijk nadat een beheerder het lid via
"Barrechten" naar `bardienst`/`beheerder` heeft gepromoveerd, in een latere
`LidBeherenOverlay.tsx`-sessie.

## Datamodel

**Nieuwe kolom `members.invited_at timestamptz`, nullable, geen default.**
Migratie `supabase/migrations/0012_lid_account_uitnodigen.sql`
(opeenvolgend na `0011_list_members_admin_pin_hash_scrub.sql`).

**Migratie blijft `0012_lid_account_uitnodigen.sql` — niet een nieuwe
`0013_...sql` voor deze herziening.** `0012` is nog niet gemerged naar
`main` (deze PR staat nog open); er bestaat dus geen andere branch/
omgeving die op de huidige inhoud van dat bestand vertrouwt. Zelfde
precedent als [ADR 0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)
→ "Post-implementatie fix": een bug gevonden ná Reviewer-goedkeuring maar
vóór de merge werd toen ook in de bestaande migratie zelf gecorrigeerd, niet
in een aparte volgmigratie. Een losse `0013` zou hier bovendien een
tussentijds *fout* RPC-contract (`mark_member_invited` met de
`auth_user_id`-bug) permanent in de migratiehistorie vastleggen, terwijl dat
contract nooit correct heeft gewerkt — dat dient geen doel. De Developer
past `0012_lid_account_uitnodigen.sql` dus aan: de bestaande
`mark_member_invited`-functie wordt vervangen door de twee RPC's hieronder
(`mark_member_invited` verdwijnt uit de migratie — geen `drop function`
nodig, hij heeft nooit op `main` gestaan).

- Zet het moment waarop een invite (via de handmatige knop) daadwerkelijk
  succesvol verstuurd is. Gebruikt door de UI om drie standen te tonen:
  "nog niet uitgenodigd" (`invited_at is null`), "uitgenodigd op [datum],
  nog geen account" (`invited_at is not null`, `auth_user_id is null` — de
  link is nog niet aangeklikt, of een latere klik op "opnieuw versturen" is
  nog niet gebeurd), "account gekoppeld" (`auth_user_id is not null`).
  **(Herzien)** Vóór deze herziening was de middelste stand onbereikbaar —
  `mark_member_invited` zette `auth_user_id` al bij het versturen, niet bij
  het klikken. Zie "RPC's" voor het gecorrigeerde moment waarop
  `auth_user_id` gezet wordt.
- **Geen PII in de zin van [ADR 0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md).**
  Die ADR gaat over kolommen die persoonsgegevens bevatten en niet aan elke
  `authenticated`-sessie toebehoren (CLAUDE.md → Domein) — `invited_at` is
  een tijdstip, geen persoonsgegeven, en onthult zelf geen e-mailadres of
  ander PII-veld. Zelfde categorie als `auth_user_id`/`archived`/`role`, die
  ADR 0004 expliciet buiten zijn reikwijdte houdt. **Geen wijziging nodig
  aan de kolomtoegang-`GRANT`/`REVOKE` uit `0009_ledenbeheer_email_rpc_gated_read.sql`**
  — die regelt directe tabel-selects voor `authenticated`, en niets in deze
  codebase leest `members` direct voor ledenbeheer-doeleinden (alles loopt
  al via `list_members_admin()`, zie hieronder). Expliciet vermeld zodat de
  Developer 'm niet per ongeluk toevoegt aan een grant-lijst die 'm niet
  nodig heeft.
- **Wél een aanpassing van `list_members_admin()` nodig, verplicht, niet
  optioneel.** Die functie retourneert `setof members` via een **expliciete
  kolommenlijst** (`0011_list_members_admin_pin_hash_scrub.sql`), niet
  `select *` — `returns setof members` vereist dat elke `return query`-rij
  positioneel op alle kolommen van `members` past. Een nieuwe kolom die aan
  `members` wordt toegevoegd zonder deze lijst bij te werken geeft een
  kolomaantal-mismatch, geen stille fout. `0012_lid_account_uitnodigen.sql`
  moet dus zelf een `create or replace function list_members_admin() …` met
  `invited_at` toegevoegd aan de kolommenlijst bevatten (zelfde signatuur/
  returntype, dus geen `drop function`/her-`grant` nodig, zelfde als
  `0011`'s eigen redenering). **Ongewijzigd door deze herziening.**
- **De zes bestaande RPC's die `returns members` gebruiken met `select *
  into`/`returning * into` (`create_member`, `update_member_name`,
  `set_member_archived`, `set_member_role`, `set_own_pin`,
  `update_member_email`) hoeven niet aangepast te worden voor deze kolom
  zelf** — die gebruiken `select *`, niet een expliciete lijst, en passen
  zich vanzelf aan een nieuwe kolom aan. Ze blijven inhoudelijk ongewijzigd
  door dit ticket.

**`SUPABASE_SECRET_KEY` gaat van gereserveerd-maar-ongebruikt naar
daadwerkelijk gebruikt.** `.env.example` noemt 'm al ("niet gebruikt door de
app zelf vandaag — kept here so its absence is a deliberate, visible
choice"); die comment moet bijgewerkt worden om te zeggen wat 'm nu wél
gebruikt (`src/lib/supabase/admin.ts`, zie RPC's), geen nieuwe env-var-naam
nodig — de naam lag al vast.

## RPC's (herzien)

Drie onderdelen: twee nieuwe SQL-RPC's (de databasekant, elk met een eigen
verantwoordelijkheid en een eigen actor — zie hieronder) en één nieuwe
server-side actie die geen RPC is (de Auth-Admin-API-kant). Zie
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
voor waarom de Auth-Admin-kant sowieso nooit een RPC kan zijn — deze sectie
past dat patroon toe, herhaalt de motivatie niet. **Vóór deze herziening was
er één RPC (`mark_member_invited`) die beide schrijvingen
(`invited_at`/`auth_user_id`) in dezelfde update deed — dat was de bug uit
Bug 1, zie het herzieningsblok bovenaan dit document.**

### 1. `mark_member_invite_sent(p_member_id uuid) returns members` — herziene RPC (was `mark_member_invited`)

`supabase/migrations/0012_lid_account_uitnodigen.sql`, zelfde
ADR-0002-actorcheckvorm als de rest van de ledenbeheer-RPC-familie. **Zet
voortaan uitsluitend `invited_at`, nooit meer `auth_user_id`** — de
koppeling gebeurt pas bij acceptatie, zie RPC's → punt 2 hieronder.

```sql
create or replace function mark_member_invite_sent(
  p_member_id uuid
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
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

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Guard tegen een overbodige/racende herbevestiging: als het lid
  -- inmiddels al gekoppeld is, heeft "invited_at" opnieuw zetten geen zin
  -- en zou het de indruk wekken dat er zojuist weer een nieuwe invite nodig
  -- was — zelfde already_linked-guard als de vorige versie van deze RPC,
  -- hier behouden op expliciet verzoek van Bram (Bug 1-fix, blijft een
  -- zinvolle bescherming tegen een dubbele koppeling).
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  update members
    set invited_at = now()
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's
  -- (0010_pin_hash_kolombeveiliging.sql) — deze RPC retourneert ook
  -- `members`, dus zonder deze regel lekt de ruwe bcrypt-hash opnieuw naar
  -- de client.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function mark_member_invite_sent to authenticated;
```

**Moet aangeroepen worden met de sessie-gebonden client
(`src/lib/supabase/server.ts`), nooit met de service-role-client
(`admin.ts`)** — ongewijzigd t.o.v. de vorige versie: `auth.uid()` binnen
deze functie is alleen gevuld als de aanroep via een echte, ingelogde
sessie gaat — de service-role-client heeft geen sessie, dus `auth.uid()`
zou `null` zijn en de actorcheck zou altijd `actor_not_found` geven. Zie
ADR 0006 → Beslissing punt 3.

**Geen `role in ('bardienst', 'beheerder')`-check op het doellid binnen
deze RPC** — ongewijzigd. Die eis hoort bij de *eligibility*-beslissing
(server-side actie → RPC's punt 3, stap 3 hieronder), niet bij deze RPC — op
het moment dat `mark_member_invite_sent` wordt aangeroepen is
`inviteUserByEmail()` al geslaagd (er bestaat al een echt
`auth.users`-record), dus deze RPC hoeft alleen nog te registreren *dat* de
mail verstuurd is, niet de eligibility opnieuw te beoordelen.

**Foutcodes:** `actor_not_found`/`no_admin_role` (bestaand, ongewijzigd),
`member_not_found` (bestaand patroon), `already_linked` (bestaand — het lid
heeft al een `auth_user_id`, deze RPC overschrijft 'm nooit; **betekenis
ongewijzigd, maar het scenario waarin dit optreedt is nu iets breder** — dit
kan nu ook optreden tussen een tweede klik op "opnieuw versturen" en een
inmiddels-voltooide acceptatie door het lid zelf via
`link_invited_member_account`).

### 2. `link_invited_member_account() returns members` — nieuwe RPC, andere actor dan de rest van de RPC-familie

`supabase/migrations/0012_lid_account_uitnodigen.sql`, aangeroepen vanuit
`src/app/(bar)/beheer/callback/route.ts` **ná een geslaagde
`exchangeCodeForSession()`**, met de zojuist tot stand gekomen sessie van
**het uitgenodigde lid zelf** — niet een beheerder-actor. Geen parameters:
de RPC identificeert zelf welk `members`-record bij de aanroepende sessie
hoort, want er bestaat op dit moment per definitie nog geen
`members.auth_user_id` om op te matchen (dát is precies wat deze RPC gaat
zetten).

**Actor-identificatie wijkt bewust af van de rest van deze RPC-familie.**
Elke andere RPC in deze codebase (ADR 0002) identificeert de aanroeper via
`auth.uid()` → een bestaande `members`-rij met dat `auth_user_id`. Hier
bestaat die rij nog niet — de aanroeper is dus geïdentificeerd via het
e-mailadres van de sessie (`auth.email()`, Supabase's ingebouwde
GUC-gebaseerde tegenhanger van `auth.uid()` — zelfde mechanisme, alleen het
e-mailclaim in plaats van het sub-claim; geen extra plumbing nodig), gematcht
tegen `members.email`. Zie ADR 0006 → "Aanvulling" voor waarom dit een
eigen, gedocumenteerd sub-patroon is in plaats van een uitbreiding van ADR
0002's bestaande vorm.

```sql
create or replace function link_invited_member_account()
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_match_count int;
  v_member_id uuid;
  v_member members;
begin
  v_email := auth.email();

  -- Geen e-mailclaim op de sessie (zou niet moeten voorkomen voor een
  -- geslaagde e-mail-login, maar defensief): stille no-op, nooit een fout
  -- — deze RPC wordt op elke /beheer/callback-aanroep getriggerd, ook voor
  -- een doodgewone her-login (zie Randgevallen).
  if v_email is null then
    return null;
  end if;

  -- Case-insensitieve match: inviteUserByEmail() stuurt het e-mailadres
  -- exact door zoals opgeslagen op members.email, maar Supabase Auth
  -- normaliseert e-mailadressen op auth.users-niveau — een members.email
  -- met hoofdletters (ledenbeheer-email.md normaliseert zelf niets) zou
  -- anders nooit matchen met auth.email(). Eerste plek in deze codebase die
  -- e-mail vergelijkt voor gelijkheid, dus geen bestaand precedent om te
  -- breken.
  -- Twee losse queries i.p.v. één met min(id): min() bestaat niet voor
  -- uuid (Postgres kent geen totale ordening op dat type) -- de
  -- oorspronkelijke `select count(*), min(id) into ...`-vorm faalde
  -- daardoor op *elke* aanroep, ongeacht het aantal matches (Tester-
  -- bevinding, PR #62, gefixt vóór merge). count(*) bepaalt of er precies
  -- één match is; de tweede select haalt die ene rij pas op als dat al
  -- vaststaat.
  select count(*) into v_match_count
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    -- Alleen leden die daadwerkelijk via de handmatige knop uitgenodigd
    -- zijn komen in aanmerking — extra, goedkope verdedigingslaag
    -- (verdediging-in-twee-lagen, zelfde principe als overal elders in
    -- deze RPC-familie): zonder deze eis zou een e-mailadres dat toevallig
    -- overeenkomt met member.email, maar nooit via deze feature is
    -- uitgenodigd, alsnog gekoppeld kunnen worden.
    and invited_at is not null;

  -- 0 matches (gewone her-login van een al gekoppeld lid, of een
  -- e-mailadres dat aan geen enkel members-record hangt, of nog niet
  -- uitgenodigd) of >1 matches (e-mailcollision, zie Randgevallen/
  -- Architect-beslissingen) -> stille no-op, nooit een fout. Dit mag de
  -- /beheer/callback-flow nooit blokkeren.
  if v_match_count <> 1 then
    return null;
  end if;

  select id into v_member_id
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    and invited_at is not null;

  update members
    set auth_user_id = auth.uid()
    where id = v_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function link_invited_member_account to authenticated;
```

**Moet ook aangeroepen worden met de sessie-gebonden client
(`src/lib/supabase/server.ts`).** `auth.uid()`/`auth.email()` zijn alleen
gevuld binnen een echte sessie — hier de sessie die
`exchangeCodeForSession()` zojuist zette. Nooit de service-role-client:
naast dat `auth.uid()`/`auth.email()` dan leeg zouden zijn, zou de
service-role-client sowieso RLS/de bedoelde actor-binding omzeilen (ADR
0006 → Beslissing punt 3, hier van overeenkomstige toepassing al gaat het
niet om een beheerder-actie).

**Geen rolcheck (`no_admin_role` bestaat hier niet).** Dit is bewust — de
aanroeper is niet iemand die beweert beheerder te zijn, maar iemand die zijn
eigen, net-geaccepteerde invite afrondt. De enige "autorisatie" die hier
telt is: bestaat er precies één niet-gekoppeld, daadwerkelijk-uitgenodigd
`members`-record met dit e-mailadres. Zie ADR 0006 → "Aanvulling".

**Geen foutcodes.** Retourneert `null` (geen rij) bij elk geval waarin er
niets te koppelen valt — nooit een `raise exception`. Zie hierboven voor de
motivatie (moet de gewone login-flow nooit verstoren).

### 3. Server-side invite-actie — geen RPC, zie ADR 0006

Een Server Action of Route Handler (keuze aan de Developer, geen
architectuurbeslissing) die het volgende doet, gegeven een `memberId` —
**uitsluitend aangeroepen vanuit de nieuwe "invite (opnieuw) versturen"-knop
in `LidBeherenOverlay.tsx`, nooit automatisch na een save** (Besloten door
Bram punt 2):

1. **Actorcheck**, sessie-gebonden client: `auth.uid()` → `members`-rij →
   `role = 'beheerder'` → anders geen actie, foutresultaat
   (`actor_not_found`/`no_admin_role`, zelfde codes als overal).
2. **Leest het doellid** via de service-role-client (`admin.ts`) — mag hier
   wél de service-role gebruiken, want stap 1 heeft de aanroeper al
   geautoriseerd; dit is een gewone lezing, geen RLS-gevoelige schrijving.
   Als het lid niet bestaat → `member_not_found`.
3. **Bepaalt of een invite hoort te gebeuren:** `role in ('bardienst',
   'beheerder')` **en** `auth_user_id is null` **en** `email is not null`.
   Niet eligible → geen fout, een no-op-resultaat (`{ ok: true, invited:
   false }` of gelijkwaardig). De `role`-voorwaarde is de server-side
   afdwinging van Besloten-door-Bram-punt-1 (verdediging-in-twee-lagen,
   naast de UI die de knop alleen toont binnen het al role-gated
   "Inloggegevens"-blok, zie Schermflow) — een rechtstreekse aanroep van
   deze actie voor een `lid`-rol member-id doet dus niets, ongeacht wat de
   UI toont.
4. **Eligible → roept `inviteUserByEmail(email)` aan** via de service-role-
   client.
   - Geslaagd → roept **`mark_member_invite_sent(p_member_id)`** aan, **via
     de sessie-gebonden client** (RPC's, punt 1) — **(herzien) geen
     `p_auth_user_id`-parameter meer**: het geretourneerde `auth.users`-id
     van `inviteUserByEmail()` wordt hier niet meer gebruikt (dat record-id
     komt terug via `link_invited_member_account()` bij acceptatie, niet
     hier). Geslaagd resultaat naar de aanroeper: `{ ok: true, invited:
     true, invitedAt }` — **(herzien) bevat geen `hasAccount`/
     koppelingsinformatie meer**; het lid heeft ná dit succes nog steeds
     geen gekoppeld account, dat gebeurt pas bij acceptatie.
   - `mark_member_invite_sent` faalt ná een geslaagde `inviteUserByEmail`
     (bv. sessie verlopen tussen stap 4 en de RPC-call) → laat een
     `auth.users`-rij bestaan met `invited_at` nog op `null` — zelfde
     categorie geaccepteerd risico als voorheen, zie Randgevallen
     "Dubbele/gelijktijdige invite-afronding" (herzien: daar staat ook de
     bijgewerkte analyse van hoe dit nu doorwerkt in
     `link_invited_member_account`).
   - Mislukt met "e-mailadres al geregistreerd" → foutresultaat
     `email_already_registered` — zie "Architect-beslissingen" → E-mail-
     collision voor het gekozen gedrag en de copy.
   - Mislukt met een andere fout (netwerk, rate limit, onbekend) →
     foutresultaat `rate_limited`/`unknown`, geen wijziging aan `members`.
5. **Elke `.from()/.rpc()`-aanroep binnen deze actie leeft onder `src/lib/`**
   (`check:policy`'s bestaande regel) — de route/action zelf onder
   `src/app/` mag zelf geen directe Supabase-aanroep bevatten, moet een
   `src/lib/`-functie aanroepen die dat doet. Zelfde regel als vandaag al
   voor elke hook in `src/hooks/queries/` geldt, hier toegepast op een
   server-only aanroeper in plaats van een client-hook.

## Koppelmechanisme bij acceptatie (nieuw, deze herziening)

`src/app/(bar)/beheer/callback/route.ts` roept, ná een geslaagde
`exchangeCodeForSession()` en vóór de bestaande `NextResponse.redirect(new
URL("/beheer", request.url))`, **onvoorwaardelijk** `link_invited_member_
account()` aan via de sessie-gebonden client (`src/lib/supabase/server.ts`
— dezelfde client die de sessie net zette).

**Onvoorwaardelijk, niet alleen voor verse invite-acceptaties.** De route
kan (en hoeft) niet vooraf te weten of deze specifieke
`exchangeCodeForSession` een invite-acceptatie is of een doodgewone
her-login van een al gekoppeld lid (ADR 0002/0003: `/beheer/callback`
bedient beide gevallen, altijd al). De RPC zelf is de enige plek die dat
onderscheid — via zijn eigen matching/guards, zie RPC's → punt 2 — veilig
maakt.

**Best-effort, nooit blokkerend.** Een fout of no-op-resultaat van
`link_invited_member_account()` verandert niets aan het bestaande gedrag van
deze route: de redirect naar `/beheer` gebeurt hoe dan ook, exact zoals de
route vandaag al doet bij een mislukte `exchangeCodeForSession()` (het
bestaande "Land back on /beheer regardless"-commentaar in de route). Een
fout wordt gelogd (`console.error`), niet aan de gebruiker getoond — er is
op deze route geen scherm om iets te tonen, en dat hoeft ook niet: de
beheerder ziet het resultaat (het lid krijgt "account gekoppeld" te zien)
bij de eerstvolgende keer dat Ledenbeheer ververst wordt, niet op deze
redirect-only route.

**Geen wijziging aan de bestaande foutafhandeling van
`exchangeCodeForSession()` zelf** — dat blijft exact zoals het is. De
nieuwe stap komt er ná, alleen als `exchangeCodeForSession()` zelf al
slaagde (anders is er geen sessie om `auth.email()`/`auth.uid()` uit te
lezen, en zou de RPC-aanroep zinloos zijn) — de bestaande `if (code) { ...
}`-structuur van de route dekt dit al: de nieuwe RPC-call hoort binnen
hetzelfde blok, ná de `exchangeCodeForSession`-aanroep.

## Leeshook / UI-wijzigingen (herzien)

**`LedenbeheerLid` (`src/hooks/queries/useAlleLeden.ts`) krijgt een vijfde
veld: `invitedAt: string | null`** — ongewijzigd door deze herziening,
zelfde vorm/betekenis (ISO-timestamp of `null`), gevuld vanuit
`list_members_admin()`'s `invited_at`-kolom — zelfde "leeshook breidt uit,
geen nieuwe hook"-patroon als `ledenbeheer-email.md` → Leeshook.
`hasAccount` (`auth_user_id !== null`) blijft ook ongewijzigd van vorm —
alleen van *wannéér* het veld daadwerkelijk `true` wordt (nu pas bij
acceptatie, niet meer bij versturen, zie RPC's).

**Nieuwe hook `useSendMemberInvite()`
(`src/hooks/queries/useSendMemberInvite.ts`)** — roept de server-side actie
aan (`fetch()` naar een Route Handler, of een direct geïmporteerde Server
Action, aan de Developer). Contract: input `memberId: string`, output
onderscheidt `invited: true`/`invited: false` (no-op) bij succes, en de
foutcodes uit RPC's → punt 3 bij mislukking (**herzien**, was punt 2, zie de
nieuwe RPC-nummering) — zelfde vorm/status-machine (`idle`/`pending`/
`error`) als de bestaande mutatiehooks in deze map. **(Herzien) Het
succesresultaat bevat geen koppelingsinformatie meer** — `invited: true`
betekent nu alleen "de mail is verstuurd, `invitedAt` is bijgewerkt", niet
meer "het account is gekoppeld".

**Vereiste code-wijziging in `LidBeherenOverlay.tsx`'s `sendInvite()`
(bestaand, gebouwd — nu onjuist, moet mee met deze herziening).** De
gebouwde versie doet vandaag, optimistisch, na een geslaagde invite:
`setMember({ ...member, invitedAt: result.invitedAt, hasAccount: true })`.
Dat `hasAccount: true` **moet weg** — het lid heeft ná het versturen van een
invite nog steeds geen gekoppeld account (dat is exact Bug 1: die
tussenstaat moet nu juist zichtbaar blijven). De gecorrigeerde versie:
`setMember({ ...member, invitedAt: result.invitedAt })`, `hasAccount` blijft
ongemoeid (`false`). Gevolg dat hier expliciet benoemd wordt: een beheerder
ziet `hasAccount` pas `true` worden nadat het lid de link daadwerkelijk
gebruikt heeft **en** de beheerder de ledenlijst ververst (`onChanged()`/
`refetch()`, geen realtime push) — geen regressie, hetzelfde
ververs-op-actie-patroon als de rest van deze overlay, alleen niet langer
overbrugd door een (onjuiste) optimistische update.

**Nieuwe helper `src/lib/date.ts`**, naast `money.ts`, voor de
`invitedAt`-statusregel (Schermflow) — ongewijzigd door deze herziening:

```ts
/** ISO-timestamp → korte NL-datum ("21 sep 2026"), display-only — zelfde
 *  Intl-gebaseerde aanpak als money.ts's formatCents(). */
const formatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  return formatter.format(new Date(iso));
}
```

**`create_member`/`update_member_email` zelf blijven volledig ongewijzigd.**
Geen aanroep van de invite-actie vanuit hun hooks/overlays (Besloten door
Bram punt 2).

## Schermflow

Uitbreiding van het bestaande "Inloggegevens"-blok in
`LidBeherenOverlay.tsx` (vandaag alleen zichtbaar bij `member.role !==
'lid'`, `docs/features/auth-methode-per-lid.md` → Datamodel) — geen nieuw
blok, geen wijziging aan die zichtbaarheidsvoorwaarde (Besloten door Bram
punt 1: dit ticket gaat sowieso nooit over `lid`-rol members).

1. **Statusregel, vervangt/vult de bestaande "Wachtwoordaccount:
   gekoppeld/niet gekoppeld"-regel aan.** Drie standen, zie "Architect-
   beslissingen" → Copy voor de exacte tekst per stand:
   - `member.hasAccount` → "account gekoppeld".
   - `!member.hasAccount && member.invitedAt === null` → "nog niet
     uitgenodigd".
   - `!member.hasAccount && member.invitedAt !== null` → "uitgenodigd op
     [`formatDate(member.invitedAt)`], nog geen account".
2. **Knop "Invite versturen" / "Invite opnieuw versturen"**, alleen
   zichtbaar wanneer `member.email !== null` (geen e-mailadres, geen
   invite-mogelijkheid — de knop verschijnt simpelweg niet, geen disabled-
   state nodig voor dit geval, want er is dan niets om überhaupt naar te
   versturen). Label: "Invite versturen" zolang `member.invitedAt === null`,
   anders "Invite opnieuw versturen". **Disabled zodra `member.hasAccount`**
   — zie "Architect-beslissingen" → Zichtbaarheid voor de motivatie en de
   verklarende tekst eronder.
3. **Bij een klik:** `useSendMemberInvite().sendInvite(member.id)`. Bij
   `invited: true` → **(herzien) alleen `invitedAt` verversen, niet
   `hasAccount`** (zie "Leeshook / UI-wijzigingen" hierboven voor de
   motivatie en de exacte code-correctie) en een toast tonen (zie Copy). Bij
   een foutcode → dezelfde `role="alert"`-foutregel bovenaan de overlay die
   de andere drie acties al gebruiken (`errorMessage`, zie
   `LidBeherenOverlay.tsx`'s bestaande `lastAction`-state-patroon — deze
   actie krijgt een vierde/vijfde waarde daarin, bv. `"invite"`).

**Geen wijziging aan `NieuwLidOverlay.tsx`** — zie Betrokken shell(s).

## Rolzichtbaarheid (herzien)

**Voor het versturen van een invite** (Schermflow, `mark_member_invite_sent`,
de server-side actie): zelfde model als de rest van Ledenbeheer, ongewijzigd
door deze herziening — alleen bereikbaar met een actieve beheerder-sessie op
`/beheer`. `mark_member_invite_sent` controleert `no_admin_role` zelf; de
server-side actie (RPC's → punt 3) doet dezelfde controle **zelf, opnieuw**,
onafhankelijk van elke voorgaande RPC-aanroep in dezelfde request — zie ADR
0006 → Beslissing punt 1 voor waarom dat geen overbodige herhaling is zodra
een service-role-client (die RLS volledig omzeilt) ergens in dezelfde actie
gebruikt wordt. Daarnaast controleert de actie zelf, server-side, dat het
doellid `bardienst`/`beheerder` is (RPC's → punt 3, stap 3) — de knop is in
de UI al binnen een role-gated blok geplaatst, maar dat is nooit de enige
laag, zelfde verdediging-in-twee-lagen-principe als overal elders in deze
RPC-familie.

**Voor het afronden van een invite** (`link_invited_member_account`,
RPC's → punt 2): **fundamenteel geen rolgating** — geen beheerder-sessie
vereist, geen `no_admin_role`-check, en dat is bewust. Deze RPC draait voor
*iedere* sessie die `/beheer/callback` raakt (elke geslaagde e-mail-login op
`/beheer`, niet alleen invite-acceptaties, zie ADR 0003/CLAUDE.md → Auth).
De enige "autorisatie" is dat er precies één matchend, nog-niet-gekoppeld,
daadwerkelijk-uitgenodigd `members`-record bestaat voor het e-mailadres van
de huidige sessie — zie RPC's → punt 2 voor de volledige guard. Dit is geen
verzwakking van het "beheerder-only"-model van de rest van deze feature: de
koppeling zelf (`auth_user_id` zetten) was en blijft niet
beheerder-gerelateerd — een lid koppelt hier zijn eigen account, geen
beheerdershandeling namens een ander. Zie ADR 0006 → "Aanvulling" voor de
volledige motivatie van dit nieuwe actor-model.

## Randgevallen

- **Dubbele/gelijktijdige invite-afronding (herzien).** Een geslaagde
  `inviteUserByEmail()` gevolgd door een mislukte `mark_member_invite_sent`
  (bv. sessie verlopen, netwerkfout tussen de twee calls) laat een
  `auth.users`-rij bestaan terwijl `members.invited_at` op `null` blijft
  staan. Twee gevolgen: (1) de statusregel toont nog "nog niet uitgenodigd"
  terwijl er wél een mail onderweg is, en (2) mocht het lid die mail toch
  aanklikken, dan vindt `link_invited_member_account` geen match (de
  `invited_at is not null`-guard, RPC's → punt 2) — de koppeling gebeurt dan
  niet, stil, geen foutmelding richting het lid (het landt gewoon op
  `/beheer`, ongewijzigd gedrag). Een volgende klik op "opnieuw versturen"
  zou dan `inviteUserByEmail()` nogmaals aanroepen voor hetzelfde
  e-mailadres en de `email_already_registered`-fout krijgen (zie
  "Architect-beslissingen" → E-mailcollision) — dezelfde inconsistente
  tussenstaat als vóór deze herziening, alleen nu zichtbaar via
  `invited_at` in plaats van via `auth_user_id`. **Geaccepteerd risico, geen
  volledig herstelmechanisme gebouwd** — zelfde soort "single-club, lage
  kans, geen twee-fasen-commit over twee systemen heen"-afweging als
  eerdere geaccepteerde risico's in deze codebase (bv.
  `docs/ARCHITECTURE.md` → "Accepted risk: device sign-in has no
  tablet-trust check", issue #34). Niet met terugwerkende kracht op te
  lossen door dit ticket; een toekomstig ticket kan een "koppel een
  bestaand auth.users-account aan dit lid"-herstelactie bouwen als dit in
  de praktijk vaker voorkomt dan verwacht. **Bevestigd door Bram
  (2026-09-21, bij deze herziening): de verwante TOCTOU-race (twee
  gelijktijdige "invite versturen"-klikken) blijft eveneens bewust
  ongefixt, zie het herzieningsblok bovenaan dit document.**
- **Een al-gekoppeld lid logt gewoon opnieuw in via `/beheer/callback`
  (nieuw randgeval, deze herziening).** `link_invited_member_account` draait
  op *elke* geslaagde magic-link-/wachtwoord-login op `/beheer`, niet alleen
  op verse invite-acceptaties (ADR 0002/0003: `/beheer/callback` is ook de
  gewone herinlogroute voor een al gekoppeld beheerder-account). Voor zo'n
  sessie geldt `auth_user_id is null` niet meer (het account is al
  gekoppeld) — de RPC vindt dus 0 matches en retourneert stil `null`, geen
  foutmelding, geen enkele wijziging aan `members`. Dit moet zo blijven:
  elke wijziging die deze no-op zou laten falen (bv. een `raise exception`
  in plaats van `return null`) zou de bestaande, ongerelateerde login-flow
  breken. Zie RPC's → punt 2.
- **E-mailcollision bij het koppelen (nieuw randgeval, deze herziening).**
  Twee (of meer) `members`-rijen met hetzelfde e-mailadres, allebei
  `auth_user_id is null` en `invited_at is not null` (bv. omdat een
  beheerder per ongeluk hetzelfde e-mailadres aan twee leden hangt en
  allebei uitnodigt — `members.email` heeft geen uniqueness-constraint, zie
  `ledenbeheer-email.md` → Datamodel). **Gekozen: geen koppeling, stille
  no-op** (`v_match_count <> 1`, RPC's → punt 2) — zie "Architect-
  beslissingen" → "E-mailcollision bij koppelen (accept-tijd)" voor de
  volledige motivatie. Het lid komt na de klik gewoon op `/beheer` terecht
  zonder gekoppeld account; een beheerder die dit signaleert kan het
  e-mailcollision-probleem oplossen (bv. het dubbele e-mailadres bij één
  van de twee leden verwijderen) en het lid opnieuw laten proberen.
- **`db:test`/pgTAP kan de `inviteUserByEmail`-aanroep zelf niet dekken
  (herzien: dit gat is door de RPC-splitsing juist kleiner geworden, niet
  groter).** pgTAP test tegen een echte Postgres, niet tegen Supabase's
  Auth-API — dat blijft waar voor `inviteUserByEmail()` zelf. Maar van de
  twee RPC's die deze herziening introduceert is er nu precies één die puur
  SQL is zonder enige afhankelijkheid van een echte
  `inviteUserByEmail()`-aanroep om te kunnen testen:
  - `mark_member_invite_sent` — zelfde dekking als voorheen
    (`actor_not_found`/`no_admin_role`/`member_not_found`/`already_linked`
    plus happy path/`pin_hash`-scrub), zelfde stijl/fixtures als de rest van
    `supabase/tests/ledenbeheer.test.sql`.
  - `link_invited_member_account` — **volledig pgTAP-testbaar**, want de
    RPC leest alleen `auth.email()`/`auth.uid()` en `members` — geen
    Auth-API-call binnenin. Nieuwe gevallen: happy path (exact één match op
    e-mailadres + `auth_user_id is null` + `invited_at is not null` →
    koppelt en scrubt `pin_hash`), geen match (geen e-mailcollision, gewoon
    0 rijen: al gekoppeld, of e-mailadres onbekend, of `invited_at is null`
    → `null` terug, geen fout), meerdere matches (e-mailcollision → `null`
    terug, geen fout, geen koppeling), `auth.email()` levert geen claim →
    `null` terug. Dit vereist dat de test-fixtures/simulatie ook een
    e-mailclaim zetten naast het bestaande `request.jwt.claim.sub` (bv.
    `select set_config('request.jwt.claim.email', '<adres>', true)`,
    zelfde GUC-conventie als de bestaande `request.jwt.claim.sub`-simulatie,
    zie `assortimentbeheer.test.sql`) — de Tester moet verifiëren dat de
    lokale Supabase-Postgres-versie `auth.email()` inderdaad op die GUC
    leest (zelfde soort aanname als de bestaande `auth.uid()`-simulatie al
    maakt voor `request.jwt.claim.sub`).
  De server-side actie zelf (RPC's → punt 3, stappen 1-5) blijft niet
  pgTAP-testbaar — zie ADR 0006 → Gevolgen. Dit is een gat, geen
  onopgemerkt gat: de Tester-agent moet dit expliciet blijven noteren als
  buiten `db:test`'s bereik.
  **Bevestigd (Tester, commit `f00540b`, vóór deze herziening):** de
  eerdere negatieve tests dekten uitsluitend `mark_member_invited`
  (`actor_not_found`/`no_admin_role`/`member_not_found`/`already_linked`
  plus de happy path/`pin_hash`-scrub-regressie); die tests moeten voor
  deze herziening herzien worden — zie "Testgevolgen" hieronder.
- **Testgevolgen — samenvatting voor de Tester (nieuw, deze herziening).**
  De 13 bestaande pgTAP-assertions voor `mark_member_invited`
  (`supabase/tests/ledenbeheer.test.sql`, Tester-commit `f00540b`,
  `plan(85)`) zijn geschreven tegen een RPC die niet meer bestaat. Ze moeten
  vervangen worden door twee kleinere groepen:
  1. Assertions voor `mark_member_invite_sent` — dezelfde
     foutcode-assertions als voorheen (`actor_not_found` × 2 varianten,
     `no_admin_role`, `member_not_found`, `already_linked`), min de
     assertion(s) die controleerden dat `auth_user_id` na een geslaagde
     call gezet werd (die bestaat niet meer — de happy path controleert nu
     alleen dat `invited_at` gezet wordt en `auth_user_id` juist
     ongewijzigd `null` blijft), plus de bestaande `pin_hash`-scrub-
     regressie-assertion.
  2. Nieuwe assertions voor `link_invited_member_account` — zie de
     pgTAP-bullet hierboven voor de volledige lijst met gevallen (happy
     path, geen match × drie varianten, meerdere matches, geen
     e-mailclaim).
  `select plan(N)` moet omhoog naar het daadwerkelijke nieuwe totaal — geen
  geraden getal, zelfde regel als elders in deze RPC-familie
  (`ledenbeheer-email.md` → Randgevallen "Negatieve tests" gaf dezelfde
  instructie). De Architect schrijft deze tests niet zelf — dit is
  Tester-werk, hier alleen aangekondigd zodat de scope duidelijk is vóór de
  Tester begint.
- **Archief lid met e-mailadres** — een gearchiveerd `bardienst`/
  `beheerder`-lid kan nog steeds eligible zijn voor een invite (de
  eligibility-check in RPC's → punt 3.3 toetst niet op `archived`). Bewust
  niet uitgesloten: zelfde redenering als `ledenbeheer-email.md` →
  Randgevallen "Gearchiveerd lid, e-mailadres wijzigen" — een beheerder kan
  een gearchiveerd lid's gegevens gewoon blijven bewerken, en dit ticket
  voegt daar geen nieuwe uitzondering aan toe zonder dat Bram dat vraagt.
- **Ingelogd, maar geen beheerder** / **`actor_not_found`** — zelfde
  afhandeling als de rest van de RPC-familie, nu ook in de server-side actie
  zelf (zie Rolzichtbaarheid). Geldt alleen voor de verstuur-kant
  (`mark_member_invite_sent`, de server-side actie); `link_invited_member_
  account` kent dit concept niet, zie Rolzichtbaarheid.

## Architect-beslissingen (gedelegeerd door Bram — "rest, beste suggestie")

Drie punten, expliciet aan de Architect gelaten. Vastgelegd hier zodat de
keuze zichtbaar en herzienbaar blijft, niet stilzwijgend gemaakt.

### E-mailcollision

**Wat er gebeurt wanneer `inviteUserByEmail()` faalt omdat het e-mailadres
al bij een bestaand `auth.users`-account hoort** (van een ander lid, of een
eerder mislukte koppeling van hetzelfde lid — zie Randgevallen "Dubbele/
gelijktijdige invite-afronding"). Al gesignaleerd in `ledenbeheer-email.md`
→ Datamodel als "een #24-probleem" (geen uniqueness-constraint op
`members.email`, bewust).

**Gekozen: alleen een foutmelding tonen, geen wijziging aan `members`, geen
poging tot automatisch koppelen of opzoeken van het botsende account.** Het
e-mailadres blijft gewoon opgeslagen op het lid (dat wijzigt dit ticket
nooit); alleen de invite zelf mislukt. Motivatie:
- **Consistent met hoe elke andere RPC in deze familie een conflict
  afhandelt**: een foutcode + Nederlandse melding, nooit een automatische
  correctie namens de beheerder (vergelijk `invalid_email`/`member_not_found`
  — nergens in deze RPC-familie probeert een RPC zelf een conflict op te
  lossen, altijd terugkoppelen en de beheerder laten beslissen).
  Actief opzoeken "bij wie hoort dit account al" zou een `admin.
  listUsers()`/`admin.getUserById()`-aanroep vereisen die weer een eigen,
  nieuw stukje foutafhandeling en een nieuwe manier om dat aan de beheerder
  te tonen nodig heeft — een reële uitbreiding, niet iets dit ticket er
  terloops bij kan doen.
- **Geen destructieve of onomkeerbare actie** (zoals het account van een
  ander lid "overnemen") gebeurt automatisch — bij twijfel is de veiligste
  keuze niets doen behalve melden, zelfde soort terughoudendheid als
  `ledenbeheer-email.md`'s eigen "twee leden met hetzelfde e-mailadres" niet
  actief proberen op te lossen.
- Copy: zie hieronder.

### E-mailcollision bij koppelen (accept-tijd) — nieuw, Architect-beslissing binnen deze herziening

Waar de bestaande "E-mailcollision"-beslissing hierboven gaat over het
moment van *versturen* (`inviteUserByEmail()` faalt), introduceert deze
herziening een tweede, apart moment waarop een e-mailcollision zich kan
voordoen: bij *koppelen* (`link_invited_member_account`, RPC's → punt 2) —
meerdere `members`-rijen met hetzelfde e-mailadres, allebei nog niet
gekoppeld en allebei uitgenodigd.

**Gekozen: geen koppeling, stille no-op — zelfde motivatie als de
send-tijd-beslissing hierboven, hier bovendien zonder foutcode-kanaal.**
Een extra overweging t.o.v. de send-tijd-versie: op dit moment bestaat er
geen plek om een foutmelding te tonen (de route redirect altijd naar
`/beheer`, zie "Koppelmechanisme bij acceptatie") — de RPC *moet* dus sowieso
stil zijn bij elke onzekere uitkomst, wat de "geen automatische correctie"-
keuze hier nog dwingender maakt dan bij het versturen. Zelfde
terughoudendheidsprincipe: bij twijfel niets doen, nooit een gok wagen
tussen meerdere kandidaat-leden voor een onomkeerbare koppeling — een
automatische "beste gok" (bv. de oudste rij, of de eerst-uitgenodigde) zou
een verkeerd lid aan een account kunnen koppelen, onomkeerbaar zonder
handmatig ingrijpen (Supabase Studio). Zie Randgevallen →
"E-mailcollision bij het koppelen" voor het volledige scenario en de
aanbevolen manuele oplossing.

### Zichtbaarheid van de knop bij een lid met bestaand account

**Gekozen: de knop blijft zichtbaar maar wordt `disabled`, met een
verklarende tekst eronder** — niet volledig verborgen. Motivatie:
- **Consistent met het bestaande patroon in deze exacte overlay**: elke
  andere actie in `LidBeherenOverlay.tsx` ("Naam wijzigen", "Barrechten")
  toont de knop altijd, en schakelt 'm uit zodra er niets zinvols te doen
  valt (bv. "Opslaan" pas actief bij een van de huidige waarde afwijkende
  invoer) — nooit een knop die verdwijnt. Een verdwijnende knop zou hier ook
  een nieuw patroon zijn zonder precedent in deze codebase.
  Volledig verbergen zou bovendien de statusregel (punt 1, Schermflow) de
  enige aanwijzing maken dat er ooit een knop was — minder ontdekbaar voor
  een beheerder die niet weet dat "account gekoppeld" ooit een knop
  verving.
- Disabled + tekst is ook direct duidelijk over *waarom* er niets gebeurt
  bij dit lid, in plaats van een klik die stilzwijgend niets doet (wat de
  eligibility-no-op in RPC's → punt 3.3 anders zou opleveren als de knop
  wél actief bleef).

### Copy (herzien — Bug 2, PR #62-review)

Geen wireframe-precedent voor dit gedrag (`ledenbeheer-email.md` →
Schermflow noteerde dat het e-mailveld zelf al geen prototype-precedent
had; dit gaat verder dan dat veld). Gekozen op basis van de bestaande toon
in `LidBeherenOverlay.tsx`/`NieuwLidOverlay.tsx` (kort, kleine letters,
imperatief/declaratief, geen uitroeptekens) en hergebruik van letterlijk
bestaande foutmeldingen waar de betekenis identiek is.

**Statusregel (Schermflow punt 1):**
- `hasAccount` → **"account gekoppeld"** (letterlijk de bestaande tekst,
  ongewijzigd).
- geen account, nooit uitgenodigd → **"nog niet uitgenodigd"**.
- geen account, wel eerder uitgenodigd → **"uitgenodigd op {datum}, nog
  geen account"**.

**Verklarende tekst onder de knop** (zelfde stijl als "Barrechten"'s
`text-xs text-rail-muted`-ondertekst) **— herzien (Bug 2): de eerste
variant beloofde een wachtwoord-instelscherm dat niet bestaat (dat scherm is
issue #17, niet gebouwd). Alleen de tekst is aangepast, geen nieuw scherm:**
- knop actief, nooit uitgenodigd → **"stuurt een e-mail met een inloglink
  voor dit lid"** (was: "... waarmee dit lid zelf een wachtwoord instelt" —
  die belofte klopt niet, zie het herzieningsblok bovenaan dit document).
- knop actief, al eerder uitgenodigd → **"stuurt de inloglink opnieuw —
  bijvoorbeeld als de vorige e-mail gemist is"** (ongewijzigd — beloofde al
  geen wachtwoordscherm).
- knop disabled (`hasAccount`) → **"dit lid heeft al een account — een
  nieuwe uitnodiging is niet nodig"** (ongewijzigd).

**Knoplabel:** **"Invite versturen"** (nog nooit uitgenodigd) /
**"Invite opnieuw versturen"** (al eerder uitgenodigd) — ongewijzigd, zie
Schermflow punt 2.

**Succes-toast:** **"Uitnodiging verstuurd"** — ongewijzigd, zelfde toon/
lengte als "Naam bijgewerkt"/"Rechten bijgewerkt" (bestaande toasts in deze
overlay).

**Foutmeldingen** (`role="alert"`, zelfde plek/stijl als de bestaande
`errorMessage`-regel in `LidBeherenOverlay.tsx`) — ongewijzigd door deze
herziening, dezelfde foutcode-vocabulaire blijft gelden voor de
verstuur-kant (`mark_member_invite_sent`/de server-side actie):
- `actor_not_found` → **"dit account is niet gekoppeld aan een lid — vraag
  een beheerder"** (letterlijk hergebruikt, exact dezelfde tekst als de
  andere drie acties in dit bestand).
- `no_admin_role` → **"dit account kan leden niet beheren — vraag een
  beheerder"** (letterlijk hergebruikt).
- `member_not_found` → **"dit lid bestaat niet meer — de lijst is
  bijgewerkt"** (letterlijk hergebruikt).
- `already_linked` → **"dit lid heeft inmiddels al een account — de lijst
  is bijgewerkt"** (nieuw, zelfde vorm/toon als `member_not_found`
  hierboven — een race waarbij het lid tussen het laden van de overlay en
  de klik al gekoppeld raakte, bv. via het lid dat inmiddels zelf de
  uitnodiging afrondde, of via een tweede beheerder-sessie).
- `email_already_registered` → **"dit e-mailadres is al gekoppeld aan een
  ander account — controleer of dit bij een ander lid hoort"** (nieuw, zie
  E-mailcollision hierboven voor de motivatie).
- `rate_limited` → **"te veel pogingen — probeer het over een paar minuten
  opnieuw"** (nieuw, zelfde soort boodschap als `useBeheerLogin.ts`'s
  `rate_limited`-code beschrijft, hier voor het eerst als letterlijke tekst
  vastgelegd). Sinds PR #75 (#73) komt de tekst uit
  `RATE_LIMITED_MESSAGE` in `src/lib/authErrors.ts`, gedeeld met de
  `/beheer`-inlogschermen, in plaats van een eigen kopie.
- `unknown` → **"er ging iets mis, probeer het opnieuw"** (letterlijk
  hergebruikt — de bestaande vaste fallback-tekst uit elke andere
  error-mapping-functie in dit bestand).

`link_invited_member_account` heeft, zoals hierboven beschreven, geen
foutcodes en dus geen eigen foutmeldingen — het lid ziet nooit iets van
deze RPC, alleen het resultaat ervan (later, via de statusregel die een
beheerder in Ledenbeheer ziet).

## Expliciet buiten scope

- **`lid`-rol invites** — zie Besloten door Bram punt 1. Volgt bij #15, geen
  nieuw ticket hier.
- **Automatisch-bij-opslaan van een (nieuw) e-mailadres** — zie Besloten
  door Bram punt 2. **Mogelijke latere uitbreiding, geen afgesloten optie:**
  mocht dit alsnog gewenst zijn, dan is de server-side actie uit RPC's →
  punt 3 daar al klaar voor — die actie neemt alleen een `memberId` en
  bepaalt zelf of er iets moet gebeuren; een toekomstig ticket hoeft 'm dus
  alleen vanuit `submit()`/`saveEmail()` aan te roepen, geen nieuwe actie of
  RPC te bouwen.
- **Portal-inlogflow zelf (#15)** — dit ticket bouwt geen
  magic-link-afrondscherm voor `shells/portal`. Zie Besloten door Bram punt
  1. **(Nieuw, deze herziening)** #15's toekomstige portal-invite-acceptatie
  kan wél het `link_invited_member_account`-sub-patroon hergebruiken (ADR
  0006 → Aanvulling), maar bouwt dit ticket niet zelf.
- **Uniqueness-afdwinging op `members.email`** — blijft bewust ontbreken,
  zie `ledenbeheer-email.md` → Datamodel/Randgevallen. Dit ticket behandelt
  alleen wat er gebeurt ná een collision bij het versturen (Architect-
  beslissingen → E-mailcollision) en ná een collision bij het koppelen
  (Architect-beslissingen → "E-mailcollision bij koppelen"), niet het
  voorkomen van de collision zelf.
- **Automatische bulk-uitnodiging van bestaande/geseede leden zonder
  account** — expliciet uitgesloten door Bram (zie ticket-tekst → "Besloten
  door Bram" in de oorspronkelijke issue). Alleen de handmatige knop
  (Schermflow) bereikt die leden, nooit een achtergrondproces dat ze
  allemaal tegelijk uitnodigt.
- **Een herstelmechanisme voor de "geslaagde invite, mislukte
  `mark_member_invite_sent`"-tussenstaat** — geaccepteerd risico, zie
  Randgevallen "Dubbele/gelijktijdige invite-afronding".
- **Actief opzoeken/tonen bij wie een botsend e-mailadres al hoort** — zie
  Architect-beslissingen → E-mailcollision, bewust niet gebouwd.
- **Wijzigen/intrekken van een reeds gekoppeld `auth.users`-account vanuit
  Ledenbeheer** (bv. een beheerder die een account wil loskoppelen of een
  wachtwoord wil resetten namens een lid) — geen acceptatiecriterium
  hiervoor in #24, geen wireframe-precedent. Zou, mocht het ooit gebouwd
  worden, hetzelfde patroon volgen als
  [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  hier vastlegt.
- **Audit-log/`Logboek`-scherm** — niet-besloten scope, zelfde beperking als
  `ledenbeheer.md`/`ledenbeheer-email.md` → Expliciet buiten scope.
- **Dubbele/gelijktijdige wijziging-bescherming** (buiten het specifieke
  invite-afrondingsgeval hierboven) — zelfde afweging als elders in deze
  codebase (#29). **Inclusief de TOCTOU-race in `mark_member_invite_sent`
  (twee gelijktijdige "invite versturen"-klikken voor hetzelfde lid) —
  bevestigd bewust ongefixt bij deze herziening, zie het herzieningsblok
  bovenaan dit document.**

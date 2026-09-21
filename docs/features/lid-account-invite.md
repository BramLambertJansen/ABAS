# Lid-account aanmaken: magic-link invite via een handmatige knop

Spec voor [issue #24](https://github.com/BramLambertJansen/ABAS/issues/24).
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
  alleen via RPC, nooit een directe tabel-write"-patroon: de enige
  schrijving op `members` zelf (`auth_user_id`/`invited_at` koppelen na een
  geslaagde invite) gaat via een nieuwe RPC (`mark_member_invited`, zie
  RPC's), geen directe write. Maar dit ticket introduceert ook een
  schrijfactie die *geen* RPC kan zijn: `inviteUserByEmail()` is een
  Supabase Auth-API-call, geen SQL, en kan dus nooit binnen een `SECURITY
  DEFINER`-functie draaien. Zie
  [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  voor hoe dat ticket zich toch aan de geest van "bevoegde schrijfacties
  lopen via een gecontroleerde server-laag, nooit direct vanaf de client"
  houdt: een server-only actie met een eigen actorcheck, met een nieuwe RPC
  voor het enige stukje dat wél een SQL-schrijving is.
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

- Zet het moment waarop een invite (via de handmatige knop) daadwerkelijk
  succesvol verstuurd is. Gebruikt door de UI om drie standen te tonen:
  "nog niet uitgenodigd" (`invited_at is null`), "uitgenodigd op [datum],
  nog geen account" (`invited_at is not null`, `auth_user_id is null` — de
  link is nog niet aangeklikt, of een latere klik op "opnieuw versturen" is
  nog niet gebeurd), "account gekoppeld" (`auth_user_id is not null`).
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
  `0011`'s eigen redenering).
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

## RPC's

Twee onderdelen: één nieuwe SQL-RPC (de databasekant), en één nieuwe
server-side actie die geen RPC is (de Auth-Admin-API-kant). Zie
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
voor waarom dit zo gesplitst is — deze sectie past dat patroon toe, herhaalt
de motivatie niet.

### 1. `mark_member_invited(p_member_id uuid, p_auth_user_id uuid) returns members` — nieuwe RPC

`supabase/migrations/0012_lid_account_uitnodigen.sql`, zelfde ADR-0002-
actorcheckvorm als de rest van de ledenbeheer-RPC-familie:

```sql
create or replace function mark_member_invited(
  p_member_id uuid,
  p_auth_user_id uuid
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

  -- Guard tegen dubbele koppeling: als er al een auth_user_id staat, mag
  -- deze RPC 'm niet overschrijven — zie Randgevallen "Dubbele/gelijktijdige
  -- invite-afronding".
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  update members
    set auth_user_id = p_auth_user_id, invited_at = now()
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere zes `returns members`-
  -- RPC's (0010_pin_hash_kolombeveiliging.sql) — deze RPC retourneert ook
  -- `members`, dus zonder deze regel lekt de ruwe bcrypt-hash opnieuw naar
  -- de client. Niet optioneel, niet "kan later" — dit is precies de fout
  -- die 0010/0011 al een keer moesten repareren.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function mark_member_invited to authenticated;
```

**Moet aangeroepen worden met de sessie-gebonden client
(`src/lib/supabase/server.ts`), nooit met de service-role-client
(`admin.ts`).** `auth.uid()` binnen deze functie is alleen gevuld als de
aanroep via een echte, ingelogde sessie gaat — de service-role-client heeft
geen sessie, dus `auth.uid()` zou `null` zijn en de actorcheck zou altijd
`actor_not_found` geven. Zie ADR 0006 → Beslissing punt 3.

**Geen `role in ('bardienst', 'beheerder')`-check op het doellid binnen
deze RPC.** Die eis hoort bij de *eligibility*-beslissing (server-side actie
→ stap 3 hieronder), niet bij deze RPC — op het moment dat
`mark_member_invited` wordt aangeroepen is `inviteUserByEmail()` al
geslaagd (er bestaat al een echt `auth.users`-record), dus deze RPC hoeft
alleen nog de koppeling vast te leggen, niet de eligibility opnieuw te
beoordelen. Scheiding van verantwoordelijkheid: de server-side actie beslist
*of* er uitgenodigd wordt, deze RPC registreert alleen *dat* het gebeurd is.

**Foutcodes:** `actor_not_found`/`no_admin_role` (bestaand, ongewijzigd),
`member_not_found` (bestaand patroon, nieuw voor deze RPC),
`already_linked` (nieuw — het lid heeft al een `auth_user_id`, deze RPC
overschrijft 'm nooit).

### 2. Server-side invite-actie — geen RPC, zie ADR 0006

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
   - Geslaagd → het geretourneerde `auth.users`-id gaat naar
     `mark_member_invited(p_member_id, p_auth_user_id)`, **via de
     sessie-gebonden client** (RPC's, punt 1). Geslaagd resultaat naar de
     aanroeper: `{ ok: true, invited: true }`.
   - `mark_member_invited` faalt ná een geslaagde `inviteUserByEmail`
     (bv. sessie verlopen tussen stap 4 en de RPC-call) → zie Randgevallen
     "Dubbele/gelijktijdige invite-afronding" voor het geaccepteerde risico
     hier (een `auth.users`-rij zonder gekoppelde `members`-rij).
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

## Leeshook / UI-wijzigingen

**`LedenbeheerLid` (`src/hooks/queries/useAlleLeden.ts`) krijgt een vijfde
veld: `invitedAt: string | null`** (ISO-timestamp of `null`), gevuld vanuit
`list_members_admin()`'s nieuwe `invited_at`-kolom — zelfde
"leeshook breidt uit, geen nieuwe hook"-patroon als `ledenbeheer-email.md` →
Leeshook.

**Nieuwe hook `useSendMemberInvite()`
(`src/hooks/queries/useSendMemberInvite.ts`)** — roept de server-side actie
aan (`fetch()` naar een Route Handler, of een direct geïmporteerde Server
Action, aan de Developer). Contract: input `memberId: string`, output
onderscheidt `invited: true`/`invited: false` (no-op) bij succes, en de
foutcodes uit RPC's → punt 2 bij mislukking — zelfde vorm/status-machine
(`idle`/`pending`/`error`) als de bestaande mutatiehooks in deze map.

**Nieuwe helper `src/lib/date.ts`**, naast `money.ts`, voor de
`invitedAt`-statusregel (Schermflow):

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
   `invited: true` → `member`/`invitedAt`/`hasAccount` verversen (zelfde
   "state bijwerken vanuit het RPC-resultaat"-patroon als de andere acties
   in deze overlay) en een toast tonen (zie Copy). Bij een foutcode →
   dezelfde `role="alert"`-foutregel bovenaan de overlay die de andere drie
   acties al gebruiken (`errorMessage`, zie `LidBeherenOverlay.tsx`'s
   bestaande `lastAction`-state-patroon — deze actie krijgt een vierde/
   vijfde waarde daarin, bv. `"invite"`).

**Geen wijziging aan `NieuwLidOverlay.tsx`** — zie Betrokken shell(s).

## Rolzichtbaarheid

Zelfde model als de rest van Ledenbeheer: alleen bereikbaar met een actieve
beheerder-sessie op `/beheer`. `mark_member_invited` controleert
`no_admin_role` zelf; de nieuwe server-side actie doet dezelfde controle
**zelf, opnieuw**, onafhankelijk van elke voorgaande RPC-aanroep in
dezelfde request — zie ADR 0006 → Beslissing punt 1 voor waarom dat geen
overbodige herhaling is zodra een service-role-client (die RLS volledig
omzeilt) ergens in dezelfde actie gebruikt wordt. Daarnaast controleert de
actie zelf, server-side, dat het doellid `bardienst`/`beheerder` is
(RPC's → punt 2.3) — de knop is in de UI al binnen een role-gated blok
geplaatst, maar dat is nooit de enige laag, zelfde
verdediging-in-twee-lagen-principe als overal elders in deze RPC-familie.

## Randgevallen

- **Dubbele/gelijktijdige invite-afronding.** Een geslaagde
  `inviteUserByEmail()` gevolgd door een mislukte `mark_member_invited`
  (bv. sessie verlopen, netwerkfout tussen de twee calls) laat een
  `auth.users`-rij bestaan zonder gekoppelde `members.auth_user_id`. Een
  volgende klik op "opnieuw versturen" zou dan `inviteUserByEmail()`
  nogmaals aanroepen voor hetzelfde e-mailadres en de
  `email_already_registered`-fout krijgen (zie "Architect-beslissingen" →
  E-mailcollision) zonder dat er een `members`-rij aan gekoppeld is — een
  inconsistente tussenstaat. **Geaccepteerd risico, geen volledig
  herstelmechanisme gebouwd** — zelfde soort "single-club, lage kans, geen
  twee-fasen-commit over twee systemen heen"-afweging als eerdere
  geaccepteerde risico's in deze codebase (bv. `docs/ARCHITECTURE.md` →
  "Accepted risk: device sign-in has no tablet-trust check", issue #34).
  Niet met terugwerkende kracht op te lossen door dit ticket; een toekomstig
  ticket kan een "koppel een bestaand auth.users-account aan dit lid"-
  herstelactie bouwen als dit in de praktijk vaker voorkomt dan verwacht.
- **`db:test`/pgTAP kan de `inviteUserByEmail`-aanroep zelf niet dekken.**
  pgTAP test tegen een echte Postgres, niet tegen Supabase's Auth-API — de
  negatieve tests voor dit ticket beperken zich tot `mark_member_invited`
  (`actor_not_found`/`no_admin_role`/`member_not_found`/`already_linked`,
  zelfde stijl/fixtures als de rest van `supabase/tests/ledenbeheer.test.sql`).
  De server-side actie zelf (RPC's → punt 2, stappen 1-5) is niet
  pgTAP-testbaar — zie ADR 0006 → Gevolgen. Dit is een gat, geen
  onopgemerkt gat: de Tester-agent moet dit expliciet noteren als
  buiten `db:test`'s bereik, net zoals `docs/ARCHITECTURE.md` dat eerder
  deed voor andere "known rough edges" in de gate-scripts.
- **Archief lid met e-mailadres** — een gearchiveerd `bardienst`/
  `beheerder`-lid kan nog steeds eligible zijn voor een invite (de
  eligibility-check in RPC's → punt 2.3 toetst niet op `archived`). Bewust
  niet uitgesloten: zelfde redenering als `ledenbeheer-email.md` →
  Randgevallen "Gearchiveerd lid, e-mailadres wijzigen" — een beheerder kan
  een gearchiveerd lid's gegevens gewoon blijven bewerken, en dit ticket
  voegt daar geen nieuwe uitzondering aan toe zonder dat Bram dat vraagt.
- **Ingelogd, maar geen beheerder** / **`actor_not_found`** — zelfde
  afhandeling als de rest van de RPC-familie, nu ook in de server-side actie
  zelf (zie Rolzichtbaarheid).

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
  eligibility-no-op in RPC's → punt 2.3 anders zou opleveren als de knop
  wél actief bleef).

### Copy

Geen wireframe-precedent voor dit gedrag (`ledenbeheer-email.md` →
Schermflow noteerde dat het e-mailveld zelf al geen prototype-precedent
had; dit gaat verder dan dat veld). Gekozen op basis van de bestaande toon
in `LidBeherenOverlay.tsx`/`NieuwLidOverlay.tsx` (kort, kleine letters,
imperatief/declaratief, geen uitroeptekens) en hergebruik van letterlijk
bestaande foutmeldingen waar de betekenis identiek is:

**Statusregel (Schermflow punt 1):**
- `hasAccount` → **"account gekoppeld"** (letterlijk de bestaande tekst,
  ongewijzigd).
- geen account, nooit uitgenodigd → **"nog niet uitgenodigd"**.
- geen account, wel eerder uitgenodigd → **"uitgenodigd op {datum}, nog
  geen account"**.

**Verklarende tekst onder de knop** (zelfde stijl als "Barrechten"'s
`text-xs text-rail-muted`-ondertekst):
- knop actief, nooit uitgenodigd → **"stuurt een e-mail met een inloglink
  waarmee dit lid zelf een wachtwoord instelt"**.
- knop actief, al eerder uitgenodigd → **"stuurt de inloglink opnieuw —
  bijvoorbeeld als de vorige e-mail gemist is"**.
- knop disabled (`hasAccount`) → **"dit lid heeft al een account — een
  nieuwe uitnodiging is niet nodig"**.

**Knoplabel:** **"Invite versturen"** (nog nooit uitgenodigd) /
**"Invite opnieuw versturen"** (al eerder uitgenodigd) — zie Schermflow
punt 2.

**Succes-toast:** **"Uitnodiging verstuurd"** — zelfde toon/lengte als
"Naam bijgewerkt"/"Rechten bijgewerkt" (bestaande toasts in deze overlay).

**Foutmeldingen** (`role="alert"`, zelfde plek/stijl als de bestaande
`errorMessage`-regel in `LidBeherenOverlay.tsx`):
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
  de klik al gekoppeld raakte, bv. via een tweede beheerder-sessie).
- `email_already_registered` → **"dit e-mailadres is al gekoppeld aan een
  ander account — controleer of dit bij een ander lid hoort"** (nieuw, zie
  E-mailcollision hierboven voor de motivatie).
- `rate_limited` → **"te veel pogingen — probeer het over een paar minuten
  opnieuw"** (nieuw, zelfde soort boodschap als `useBeheerLogin.ts`'s
  `rate_limited`-code beschrijft, hier voor het eerst als letterlijke tekst
  vastgelegd).
- `unknown` → **"er ging iets mis, probeer het opnieuw"** (letterlijk
  hergebruikt — de bestaande vaste fallback-tekst uit elke andere
  error-mapping-functie in dit bestand).

## Expliciet buiten scope

- **`lid`-rol invites** — zie Besloten door Bram punt 1. Volgt bij #15, geen
  nieuw ticket hier.
- **Automatisch-bij-opslaan van een (nieuw) e-mailadres** — zie Besloten
  door Bram punt 2. **Mogelijke latere uitbreiding, geen afgesloten optie:**
  mocht dit alsnog gewenst zijn, dan is de server-side actie uit RPC's →
  punt 2 daar al klaar voor — die actie neemt alleen een `memberId` en
  bepaalt zelf of er iets moet gebeuren; een toekomstig ticket hoeft 'm dus
  alleen vanuit `submit()`/`saveEmail()` aan te roepen, geen nieuwe actie of
  RPC te bouwen.
- **Portal-inlogflow zelf (#15)** — dit ticket bouwt geen
  magic-link-afrondscherm voor `shells/portal`. Zie Besloten door Bram punt
  1.
- **Uniqueness-afdwinging op `members.email`** — blijft bewust ontbreken,
  zie `ledenbeheer-email.md` → Datamodel/Randgevallen. Dit ticket behandelt
  alleen wat er gebeurt ná een collision bij het versturen van een invite
  (Architect-beslissingen → E-mailcollision), niet het voorkomen van de
  collision zelf.
- **Automatische bulk-uitnodiging van bestaande/geseede leden zonder
  account** — expliciet uitgesloten door Bram (zie ticket-tekst → "Besloten
  door Bram" in de oorspronkelijke issue). Alleen de handmatige knop
  (Schermflow) bereikt die leden, nooit een achtergrondproces dat ze
  allemaal tegelijk uitnodigt.
- **Een herstelmechanisme voor de "geslaagde invite, mislukte
  `mark_member_invited`"-tussenstaat** — geaccepteerd risico, zie
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
  codebase (#29).

# Lid-account aanmaken: magic-link invite bij opslaan e-mailadres

Spec voor [issue #24](https://github.com/BramLambertJansen/ABAS/issues/24).
**Conceptspec — nog niet goedgekeurd.** Vier punten hieronder staan onder
"Openstaande vragen aan Bram"; de Developer bouwt dit ticket pas nadat die
beantwoord zijn (CLAUDE.md → Werkstraat stap 6).

Sluit direct aan op twee al gebouwde tickets: `docs/features/ledenbeheer.md`
(#13, member-CRUD) en `docs/features/ledenbeheer-email.md` (#57, het
e-mailveld + `members.email`-kolom zelf, expliciet **zonder**
`inviteUserByEmail`-gedrag — die spec's eigen "Expliciet buiten scope"
belegt dat gedrag hier). Introduceert een nieuw architectuurpatroon (server-
side Supabase Auth Admin-calls) — zie het bijbehorende conceptvoorstel
[ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md),
geschreven naast deze spec, ook nog niet geaccepteerd.

## Doel

Wanneer een beheerder in Ledenbeheer (`/beheer` → Leden-tab) een lid
aanmaakt of bewerkt en daarbij voor het eerst een e-mailadres invult en
opslaat, wordt automatisch een Supabase Auth-account voor dat lid
aangemaakt en een magic-link-invite verstuurd — de ontbrekende schakel
tussen "een lid heeft nu een e-mailadres opgeslagen" (#57, al gebouwd) en
"dat lid kan zelf inloggen" (portal-login, #15, nog niet gebouwd).
Daarnaast krijgt Ledenbeheer een handmatige "invite (opnieuw) versturen"-
actie, en tonen beide overlays vóór opslaan expliciet dat het invullen van
een e-mailadres dit gedrag triggert.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen
als volgt:**

- **"Geld beweegt alleen via RPC."** Niet van toepassing in de geld-zin —
  geen `balance_cents`-wijziging. Wél relevant voor het bredere "`members`
  alleen via RPC, nooit een directe tabel-write"-patroon: de enige nieuwe
  schrijving op `members` zelf (`auth_user_id`/`invited_at` koppelen na een
  geslaagde invite) gaat via een nieuwe RPC (`mark_member_invited`, zie
  RPC's), geen directe write. Maar dit ticket introduceert ook een schrijf-
  actie die *geen* RPC kan zijn: `inviteUserByEmail()` is een Supabase Auth-
  API-call, geen SQL, en kan dus nooit binnen een `SECURITY DEFINER`-functie
  draaien. Zie [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  voor hoe dat ticket zich toch aan de geest van "bevoegde schrijfacties
  lopen via een gecontroleerde server-laag, nooit direct vanaf de client"
  houdt: een server-only actie met een eigen actorcheck, met een nieuwe RPC
  voor het enige stukje dat wél een SQL-schrijving is.
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — beheerder-only ledenbeheer buiten shift-context, zelfde
  redenering als `ledenbeheer.md`/`ledenbeheer-email.md` → Doel.

## Betrokken shell(s)

`shells/bar` alleen, binnen de bestaande `/beheer` → Leden-tab
(`src/features/ledenbeheer/`) — geen nieuw scherm, een uitbreiding van
`NieuwLidOverlay.tsx` en `LidBeherenOverlay.tsx`.

`shells/portal` is **niet** betrokken bij de bouw van dit ticket zelf (geen
nieuw portal-scherm), maar de magic link die dit ticket verstuurt wijst voor
`lid`-rol leden uiteindelijk naar een portal-inlogafronding die vandaag nog
niet bestaat (#15). Zie Openstaande vraag 1 voor hoe dit ticket daarmee
omgaat zolang #15 er niet is.

## Datamodel

**Nieuwe kolom `members.invited_at timestamptz`, nullable, geen default.**
Migratie `supabase/migrations/0012_lid_account_uitnodigen.sql`
(opeenvolgend na `0011_list_members_admin_pin_hash_scrub.sql`).

- Zet het moment waarop een invite (automatisch of handmatig) daadwerkelijk
  succesvol verstuurd is — niet het moment van aanmaken/e-mail-opslaan zelf.
  Gebruikt door de UI om drie standen te tonen: "geen account, nog nooit
  uitgenodigd" (`invited_at is null`), "uitgenodigd op [datum], nog geen
  account" (`invited_at is not null`, `auth_user_id is null` — bv. de link
  is nog niet aangeklikt, of een eerdere invite is mislukt ná deze timestamp
  gezet — zie Randgevallen), "account gekoppeld" (`auth_user_id is not
  null`).
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
  zich vanzelf aan een nieuwe kolom aan. (`update_member_email`/
  `create_member` blijven ook verder ongewijzigd door dit ticket — zie RPC's
  voor waarom de invite-beslissing *niet* in die twee RPC's zelf verhuist.)

**`SUPABASE_SECRET_KEY` gaat van gereserveerd-maar-ongebruikt naar
daadwerkelijk gebruikt.** `.env.example` noemt 'm al ("niet gebruikt door de
app zelf vandaag — kept here so its absence is a deliberate, visible
choice"); die comment moet bijgewerkt worden om te zeggen wat 'm nu wél
gebruikt (`src/lib/supabase/admin.ts`, zie RPC's/Server-side actie
hieronder) — geen nieuwe env-var-naam nodig, de naam lag al vast.

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

**Foutcodes:** `actor_not_found`/`no_admin_role` (bestaand, ongewijzigd),
`member_not_found` (bestaand patroon, nieuw voor deze RPC),
`already_linked` (nieuw — het lid heeft al een `auth_user_id`, deze RPC
overschrijft 'm nooit).

### 2. Server-side invite-actie — geen RPC, zie ADR 0006

Een Server Action of Route Handler (keuze aan de Developer, geen
architectuurbeslissing) die het volgende doet, gegeven een `memberId`:

1. **Actorcheck**, sessie-gebonden client: `auth.uid()` → `members`-rij →
   `role = 'beheerder'` → anders geen actie, foutresultaat
   (`actor_not_found`/`no_admin_role`, zelfde codes als overal).
2. **Leest het doellid** via de service-role-client (`admin.ts`) — mag hier
   wél de service-role gebruiken, want stap 1 heeft de aanroeper al
   geautoriseerd; dit is een gewone lezing, geen RLS-gevoelige schrijving.
   Als het lid niet bestaat → `member_not_found`.
3. **Bepaalt of een invite hoort te gebeuren:** `auth_user_id is null` **en**
   `email is not null`. Niet eligible → geen fout, gewoon een no-op-resultaat
   (`{ ok: true, invited: false }` of gelijkwaardig) — zie Openstaande vraag
   2 voor waarom dit de voorgestelde voorwaarde is, en waarom niet strikt
   "dit is letterlijk de eerste keer dat het e-mailveld van null naar
   niet-null ging".
4. **Eligible → roept `inviteUserByEmail(email)` aan** via de service-role-
   client.
   - Geslaagd → het geretourneerde `auth.users`-id gaat naar
     `mark_member_invited(p_member_id, p_auth_user_id)`, **via de
     sessie-gebonden client** (RPC's, punt hierboven). Geslaagd resultaat
     naar de aanroeper: `{ ok: true, invited: true }`.
   - `mark_member_invited` faalt ná een geslaagde `inviteUserByEmail`
     (bv. sessie verlopen tussen stap 4 en de RPC-call) → zie Randgevallen
     "Dubbele/gelijktijdige invite-afronding" voor het geaccepteerde risico
     hier (een `auth.users`-rij zonder gekoppelde `members`-rij).
   - Mislukt met "e-mailadres al geregistreerd" (Supabase's
     `email_exists`/gelijkwaardige foutcode voor een reeds bestaand
     `auth.users`-record) → zie Openstaande vraag 3, dit ticket beslist hier
     zelf geen gedrag.
   - Mislukt met een andere fout (netwerk, rate limit, onbekend) →
     foutresultaat `unknown`/`rate_limited`, geen wijziging aan `members`.
5. **Elke `.from()/.rpc()`-aanroep binnen deze actie leeft onder `src/lib/`**
   (`check:policy`'s bestaande regel) — de route/action zelf onder
   `src/app/` mag zelf geen directe Supabase-aanroep bevatten, moet een
   `src/lib/`-functie aanroepen die dat doet. Zelfde regel als vandaag al
   voor elke hook in `src/hooks/queries/` geldt, hier toegepast op een
   server-only aanroeper in plaats van een client-hook.

**Aangeroepen op twee momenten, zelfde onderliggende actie:**

- **Automatisch**, direct na een geslaagde `create_member` (met een
  ingevuld e-mailadres) of `update_member_email` (met een gewijzigd,
  niet-leeg e-mailadres) — de client roept deze actie synchroon aan
  ná de schrijf-RPC, binnen dezelfde `submit()`/`saveEmail()`-handler (geen
  achtergrondtaak-infrastructuur bestaat in deze codebase, zie
  Schermflow). Stap 3 hierboven bepaalt zelf of er iets gebeurt — de client
  hoeft niet te weten of dit "de eerste keer" is, hij roept de actie
  gewoon altijd aan wanneer er een e-mailadres is.
- **Handmatig**, via een nieuwe "invite (opnieuw) versturen"-knop in
  `LidBeherenOverlay.tsx` — zie Schermflow. Zelfde actie, zelfde
  eligibility-check; een lid dat al een account heeft (`auth_user_id is not
  null`) krijgt dus een no-op-resultaat, geen fout — zie Openstaande vraag 4
  voor of de knop in dat geval verborgen/disabled moet zijn in plaats van
  gewoon niets te doen.

## Leeshook / UI-wijzigingen

**`LedenbeheerLid` (`src/hooks/queries/useAlleLeden.ts`) krijgt een vijfde
veld: `invitedAt: string | null`** (ISO-timestamp of `null`), gevuld vanuit
`list_members_admin()`'s nieuwe `invited_at`-kolom — zelfde
"leeshook breidt uit, geen nieuwe hook"-patroon als `ledenbeheer-email.md` →
Leeshook.

**Nieuwe hook, bv. `useSendMemberInvite()`
(`src/hooks/queries/useSendMemberInvite.ts`)** — roept de server-side actie
aan (`fetch()` naar een Route Handler, of een direct geïmporteerde Server
Action, aan de Developer). Contract: input `memberId: string`, output een
staat die tussen "geen actie nodig" (niet eligible), "verstuurd" en de
foutcodes hierboven onderscheidt — zelfde vorm/status-machine
(`idle`/`pending`/`error`) als de bestaande mutatiehooks in deze map.

**`create_member`/`update_member_email` zelf blijven ongewijzigd.** De
eligibility-beslissing verhuist bewust niet naar die twee RPC's (bv. door
hun returntype uit te breiden met een `should_invite`-vlag) — dat zou een
breaking change zijn aan twee al gebouwde, geteste RPC's
(`0007_ledenbeheer.sql`/`0008_ledenbeheer_email.sql`) én hun hooks/tests,
voor iets dat de nieuwe server-side actie net zo goed zelf, achteraf en
onafhankelijk kan bepalen (zie RPC's → punt 3 van de server-side actie).

## Schermflow

1. **`NieuwLidOverlay.tsx`** — het e-mailveld (al gebouwd, #57) krijgt een
   korte, permanente waarschuwingstekst direct onder het label, zichtbaar
   zodra het veld zichtbaar is (een nieuw lid heeft per definitie nog geen
   account, dus dit is altijd van toepassing bij aanmaken). **Exacte tekst:
   zie Openstaande vraag 5(a) — niet zelf verzonnen, geen wireframe-
   precedent voor dit veld** (`ledenbeheer-email.md` → Schermflow noemt dit
   al: het prototype had dit veld niet).
   Na een geslaagde `create_member` met een ingevuld e-mailadres: de
   bestaande flow (overlay sluit, lijst ververst, toast "[Naam] toegevoegd",
   zie `ledenbeheer.md` → Schermflow stap 2) blijft de primaire terugkoppeling
   — de invite-actie wordt **erna**, synchroon binnen dezelfde `submit()`,
   aangeroepen. Of en hoe het resultaat daarvan zichtbaar wordt (een tweede
   toast-regel, een uitbreiding van dezelfde toast, stilte bij succes) is
   deel van Openstaande vraag 5(b).
2. **`LidBeherenOverlay.tsx`** — het bestaande "E-mailadres"-blok
   (`ledenbeheer-email.md` → Schermflow stap 2) krijgt dezelfde
   permanente waarschuwingstekst, maar **alleen zichtbaar wanneer
   `!member.hasAccount`** (een lid met een gekoppeld account triggert bij
   het wijzigen van het e-mailadres sowieso niets — CLAUDE.md → "Besloten
   door Bram", al vastgelegd vóór dit ticket). Na een geslaagde
   `update_member_email` met een niet-leeg, gewijzigd e-mailadres: de
   bestaande toast "E-mailadres bijgewerkt" blijft de primaire
   terugkoppeling, de invite-actie erna, zelfde volgorde als punt 1.
3. **Nieuwe "invite (opnieuw) versturen"-actie**, in hetzelfde blok als het
   e-mailveld (niet in het bestaande "Inloggegevens"-blok, dat vandaag
   alleen bij `role !== 'lid'` zichtbaar is — zie Openstaande vraag 1 voor
   waarom die zichtbaarheidsvoorwaarde mogelijk moet meeveranderen). Knop
   zichtbaar wanneer het lid een e-mailadres heeft; label/precieze
   zichtbaarheids-/disabled-logica bij een lid dat al een account heeft:
   Openstaande vraag 4. Toont bij succes/mislukking een resultaat in
   dezelfde stijl als de overige acties in deze overlay
   (`role="alert"`/toast) — exacte tekst: Openstaande vraag 5(c)/5(d).
4. **Statusweergave van `invitedAt`/`hasAccount`** — een korte indicatie
   ("nog niet uitgenodigd" / "uitgenodigd op [datum]" / "account gekoppeld")
   naast of in plaats van de bestaande "Wachtwoordaccount:
   gekoppeld/niet gekoppeld"-regel. Exacte tekst/opmaak: onderdeel van
   Openstaande vraag 5, geen architectuurkeuze.

## Rolzichtbaarheid

Zelfde model als de rest van Ledenbeheer: alleen bereikbaar met een actieve
beheerder-sessie op `/beheer`. `mark_member_invited` controleert
`no_admin_role` zelf; de nieuwe server-side actie doet dezelfde controle
**zelf, opnieuw**, onafhankelijk van elke voorgaande RPC-aanroep in
dezelfde request — zie ADR 0006 → Beslissing punt 1 voor waarom dat geen
overbodige herhaling is zodra een service-role-client (die RLS volledig
omzeilt) ergens in dezelfde actie gebruikt wordt.

## Randgevallen

- **Dubbele/gelijktijdige invite-afronding.** Een geslaagde
  `inviteUserByEmail()` gevolgd door een mislukte `mark_member_invited`
  (bv. sessie verlopen, netwerkfout tussen de twee calls) laat een
  `auth.users`-rij bestaan zonder gekoppelde `members.auth_user_id`. Een
  volgende poging (automatisch bij een latere save, of handmatig via
  "opnieuw versturen") zou dan `inviteUserByEmail()` nogmaals aanroepen voor
  hetzelfde e-mailadres en waarschijnlijk een "al geregistreerd"-fout
  krijgen (zie Openstaande vraag 3) zonder dat er een `members`-rij aan
  gekoppeld is — een inconsistente tussenstaat. **Geaccepteerd risico voor
  deze conceptspec, geen volledig herstelmechanisme gebouwd** — zelfde soort
  "single-club, lage kans, geen twee-fasen-commit over twee systemen
  heen"-afweging als eerdere geaccepteerde risico's in deze codebase (bv.
  `docs/ARCHITECTURE.md` → "Accepted risk: device sign-in has no
  tablet-trust check", issue #34). Niet met terugwerkende kracht op te
  lossen door dit ticket; een toekomstig ticket kan een
  "koppel een bestaand auth.users-account aan dit lid"-herstelactie bouwen
  als dit in de praktijk vaker voorkomt dan verwacht.
- **`db:test`/pgTAP kan de `inviteUserByEmail`-aanroep zelf niet dekken.**
  pgTAP test tegen een echte Postgres, niet tegen Supabase's Auth-API — de
  negatieve tests voor dit ticket beperken zich tot `mark_member_invited`
  (`actor_not_found`/`no_admin_role`/`member_not_found`/`already_linked`,
  zelfde stijl/fixtures als de rest van `supabase/tests/ledenbeheer.test.sql`).
  De server-side actie zelf (stappen 1-5 onder RPC's → punt 2) is niet
  pgTAP-testbaar — zie ADR 0006 → Gevolgen. Dit is een gat, geen
  onopgemerkt gat: de Tester-agent moet dit expliciet noteren als
  buiten `db:test`'s bereik, net zoals `docs/ARCHITECTURE.md` dat eerder
  deed voor andere "known rough edges" in de gate-scripts.
- **Archief lid met e-mailadres** — een gearchiveerd lid kan nog steeds
  eligible zijn voor een invite (de eligibility-check in RPC's → punt 2.3
  toetst niet op `archived`). Bewust niet uitgesloten: zelfde redenering als
  `ledenbeheer-email.md` → Randgevallen "Gearchiveerd lid, e-mailadres
  wijzigen" — een beheerder kan een gearchiveerd lid's gegevens gewoon
  blijven bewerken, en dit ticket voegt daar geen nieuwe uitzondering aan
  toe zonder dat Bram dat vraagt.
- **Twee leden met hetzelfde e-mailadres** — al gesignaleerd in
  `ledenbeheer-email.md` → Datamodel als "een #24-probleem". Dit ticket
  behandelt het niet stilzwijgend: zie Openstaande vraag 3.
- **Ingelogd, maar geen beheerder** / **`actor_not_found`** — zelfde
  afhandeling als de rest van de RPC-familie, nu ook in de server-side actie
  zelf (zie Rolzichtbaarheid).

## Openstaande vragen aan Bram

Vier genuine open beslissingen — geen aanname gekozen, spec staat hierop
gepauzeerd voor de Developer bouwt (CLAUDE.md → Werkstraat stap 1/6).

1. **Reikwijdte per rol, gegeven dat portal-login (#15) nog niet bestaat.**
   Dit ticket kan een `lid`-rol lid een magic-link-invite sturen, maar er is
   vandaag geen portal-scherm dat de link kan afronden (#15 is niet
   gebouwd) — voor `bardienst`/`beheerder`-leden bestaat wél al een werkende
   afrondroute (`/beheer/callback`, gebouwd voor #14/#42's eigen
   e-mail-login). Drie opties:
   - (a) Dit ticket bouwt de trigger voor **alle rollen** nu al, inclusief
     `lid` — een `lid` die de link vandaag aanklikt komt op een plek terecht
     die nog niet werkt (geen portal-inlogafronding), maar de
     provisioning-kant (account + e-mail verstuurd) is dan al klaar zodra
     #15 landt. Dit spoort met hoe #24 in de oorspronkelijke ticket-tekst
     zichzelf beschrijft ("is een randvoorwaarde voor #15 om nut te
     hebben", niet "wacht op #15").
   - (b) Dit ticket beperkt zich voorlopig tot `bardienst`/`beheerder`-leden
     (die al een werkende afrondroute hebben, en voor wie dit bovendien
     [ADR 0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)'s
     "wachtwoord verplicht"-eis zou kunnen helpen vervullen voor nog niet
     handmatig geprovisionede leden, zie `docs/ARCHITECTURE.md` →
     "Provisioning voor #14") — `lid`-rol invites volgen dan pas als
     onderdeel van #15 zelf.
   - (c) Iets anders — bv. wel versturen voor elke rol, maar met een
     tijdelijke `redirectTo` die überhaupt nergens naar wijst totdat #15
     een echte bestemming bouwt.

   Deze keuze bepaalt ook of `LidBeherenOverlay.tsx`'s bestaande
   "Inloggegevens"-blok (nu alleen zichtbaar bij `role !== 'lid'`, zie
   Schermflow punt 3) zijn zichtbaarheidsvoorwaarde moet verliezen.

2. **Automatische trigger-voorwaarde: strikt "eerste keer" of
   zelfherstellend "zolang er nog geen account is"?** RPC's → punt 2.3
   stelt voor: `auth_user_id is null en email is not null` (elke save
   terwijl er nog geen account bestaat, niet alleen de letterlijk eerste).
   Dat is een lichte verbreding t.o.v. de letterlijke ticket-tekst
   ("alleen de allereerste keer") — voordeel: als een eerdere invite
   mislukte (netwerkfout) of een beheerder een getypte fout in het
   e-mailadres corrigeert vóórdat de eerste invite ooit lukte, triggert de
   eerstvolgende save gewoon opnieuw, zonder dat de beheerder de handmatige
   knop hoeft te vinden. Nadeel: het wijkt af van een strikt "alleen de
   allereerste null→niet-null-overgang"-lezing, wat een aparte
   returntype-wijziging aan `create_member`/`update_member_email` zou
   vereisen om te weten wat de vórige waarde was (zie Leeshook → "blijven
   ongewijzigd" voor waarom die route bewust niet gekozen is). Akkoord met
   de voorgestelde, bredere voorwaarde, of de striktere variant (met de
   bijbehorende RPC-wijziging) bouwen?
3. **E-mailadres dat al bij een ander (of hetzelfde) `auth.users`-account
   hoort.** `ledenbeheer-email.md` signaleerde dit al bij het bouwen van het
   e-mailveld zelf (geen uniqueness-constraint op `members.email`, bewust,
   zie die spec → Datamodel) en beleg­de de oplossing hier. Wat moet er
   gebeuren wanneer `inviteUserByEmail()` een "e-mailadres al geregistreerd"
   -fout teruggeeft?
   - Alleen een foutmelding tonen, geen wijziging aan `members` (het
     e-mailadres blijft dan wel opgeslagen op het lid, alleen zonder
     account-koppeling) — dit is wat RPC's → punt 2 vandaag al doet zonder
     verdere actie.
   - Iets actievers (bv. een beheerder attenderen dat dit e-mailadres
     mogelijk al bij een ander lid hoort)?
   Zonder antwoord bouwt dit ticket de eerste optie (geen wijziging, alleen
   een foutmelding) — maar de exacte foutmelding is zelf Vraag 5(c).
4. **Zichtbaarheid van de "invite (opnieuw) versturen"-knop bij een lid dat
   al een account heeft.** RPC's → punt 2 laat de eligibility-check een
   no-op teruggeven (geen fout) als `auth_user_id is not null` — moet de
   knop dan gewoon zichtbaar blijven maar niets zichtbaars doen bij een
   klik (verwarrend), verborgen zijn, of disabled met een verklarende tekst
   ("dit lid heeft al een account")?
5. **Exacte Nederlandse UI-copy** — geen wireframe-precedent voor dit
   gedrag (`ledenbeheer-email.md` → Schermflow noteerde dat het e-mailveld
   zelf al geen prototype-precedent had; dit gaat verder dan dat veld). Vier
   teksten, niet zelf gekozen:
   - (a) De permanente waarschuwing onder het e-mailveld in beide overlays
     (Schermflow punt 1/2) — bv. in de trant van "het invullen van een
     e-mailadres stuurt dit lid een inloglink per e-mail", exacte
     bewoording aan Bram.
   - (b) Hoe (en of) het resultaat van de automatische invite zichtbaar
     wordt bovenop de bestaande "toegevoegd"/"bijgewerkt"-toasts.
   - (c) De foutmelding(en) bij een mislukte invite (netwerk/rate-limit/
     e-mail-collision — zie Vraag 3).
   - (d) Het label van de "invite (opnieuw) versturen"-knop en de
     statusregel voor `invitedAt` (Schermflow punt 3/4).

## Expliciet buiten scope

- **Portal-inlogflow zelf (#15)** — dit ticket bouwt geen
  magic-link-afrondscherm voor `shells/portal`. Zie Openstaande vraag 1 voor
  hoe dit ticket zich daartoe verhoudt zolang #15 niet bestaat.
- **Uniqueness-afdwinging op `members.email`** — blijft bewust ontbreken,
  zie `ledenbeheer-email.md` → Datamodel/Randgevallen. Dit ticket behandelt
  alleen wat er gebeurt ná een collision bij het versturen van een invite
  (Openstaande vraag 3), niet het voorkomen van de collision zelf.
- **Automatische bulk-uitnodiging van bestaande/geseede leden zonder
  account** — expliciet uitgesloten door Bram (zie ticket-tekst → "Besloten
  door Bram"). Alleen de handmatige "opnieuw versturen"-actie (Schermflow
  punt 3) bereikt die leden, nooit een achtergrondproces dat ze allemaal
  tegelijk uitnodigt.
- **Een herstelmechanisme voor de "geslaagde invite, mislukte
  `mark_member_invited`"-tussenstaat** — geaccepteerd risico, zie
  Randgevallen "Dubbele/gelijktijdige invite-afronding".
- **Wijzigen/intrekken van een reeds gekoppeld `auth.users`-account vanuit
  Ledenbeheer** (bv. een beheerder die een account wil loskoppelen of een
  wachtwoord wil resetten namens een lid) — geen acceptatiecriterium
  hiervoor in #24, geen wireframe-precedent. Zou, mocht het ooit gebouwd
  worden, hetzelfde patroon volgen als [ADR 0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  hier vastlegt.
- **Audit-log/`Logboek`-scherm** — niet-besloten scope, zelfde beperking als
  `ledenbeheer.md`/`ledenbeheer-email.md` → Expliciet buiten scope.
- **Dubbele/gelijktijdige wijziging-bescherming** (buiten het specifieke
  invite-afrondingsgeval hierboven) — zelfde afweging als elders in deze
  codebase (#29).

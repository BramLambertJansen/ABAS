# Dienst per sessie: eigen sessie per apparaat, en een dienst die bij die sessie hoort

**Status: concept, wacht op akkoord van Bram.** Geschreven 2026-09-29. Niets
hiervan is gebouwd. Het mechanisme staat in het concept-ADR
[0015](../adr/0015-dienst-hoort-bij-geregistreerde-app-sessies.md). Deze spec
neemt de beslissingen die bij Bram liggen niet zelf. Die staan genummerd
onderaan (Open vragen), elk met een aanbeveling. Waar de tekst hieronder
"aanbeveling" of "voorstel" zegt, is het nog niet besloten.

## Aanleiding

Brams wensen, samengevat (niet aangevuld):

- **Fase 1:** er mag één dienst open zijn, maar die hoeft niet altijd van
  hetzelfde apparaat te komen.
- **Daarna** een beheerderinstelling met drie standen:
  - (a) 1 dienst, 1 apparaat. De dienst hoort bij het apparaat waarop hij
    gestart is. Een ander apparaat kan er niet bij.
  - (b) 1 dienst, meerdere apparaten. Meerdere apparaten werken in dezelfde
    dienst, als je daar inlogt.
  - (c) meerdere diensten op meerdere apparaten. Elk apparaat kan een eigen
    dienst hebben lopen.
- **Eigen sessie per apparaat.** Op een ander apparaat log je opnieuw in. Een
  dienst hoort bij de sessie of sessies waarin hij gestart of geopend is.
- **Browser dicht en weer open:** je komt terug in dezelfde sessie. De app
  vraagt eerst of je verder wilt. Iedereen die het apparaat in handen heeft,
  mag dat bevestigen.
- **Inactiviteit:** een sessie die langer dan "de onlangs gebouwde
  inactiviteitstijd" inactief is, wordt gesloten, met een melding. Daarbij
  gaat een ping of melding naar een beheerder die het kan oplossen.
- **Een beheerder mag vanaf een ander apparaat een dienst afsluiten of
  overnemen**, bijvoorbeeld als het apparaat kapot of leeg is.
- **De PIN is een persoonlijke inlog.** Hij vervangt e-mail/wachtwoord zodra
  hij na één keer inloggen is ingesteld, en "heeft niks met de dienst te
  maken".
- **Tablet koppelen** (ADR 0011) kan waarschijnlijk weg.

## Onderzocht

**Wireframe (`/designs/`).** Er is geen scherm voor sessie hervatten,
inactiviteit, een dienst op een ander apparaat, of overnemen. Wel relevant:

- `designs/chats/chat18.md` noemt de drie varianten al als "licht / medium /
  zwaar". "Meerdere parallelle diensten" betekent daar "twee tablets, twee
  kasladen, twee aparte afsluitingen", en "vereist een kassa/tappunt-begrip
  in het model". Dat is Brams stand (c).
- `designs/chats/chat23.md`: "device is niet belangrijk (tenzij het telefoon
  is)".
- `designs/Lid App.dc.html` (regels 447 en 597) en `chat30.md`: "pincode
  (alleen op dit toestel)", "Pincode is een sneltoets, geen vervanging van
  het account". Dat is het portal-patroon waar ADR 0005 al naar verwijst.

Alle schermen hieronder zijn dus nieuw, en hun teksten moeten van Bram komen
(open vraag 23).

**Code.**

- `src/middleware.ts` en `src/lib/tabletKoppeling.ts`: device sign-in alleen
  met een geldig `abas_tablet`-cookie (ADR 0011). Er is geen tabel met
  apparaten. De koppeling is stateless.
- `start_shift` (`0021`): een advisory lock, dan `shift_already_open` als er
  ergens een open dienst is. Daarna de PIN van `p_member_id`. De aanroepende
  sessie speelt geen rol.
- `0023`: `place_order`, `top_up`, `reverse_order_at_bar`, `end_shift`,
  `add_shift_member` en `remove_shift_member` weigeren alleen een lid-sessie
  (`caller_is_lid()`). Elke andere sessie mag in elke open dienst werken.
- `useOpenShift`: `shifts where ended_at is null order by started_at desc
  limit 1`. De hook leest dus "de" open dienst, ongeacht de sessie. Het
  commentaar verwijst nog naar #29 als open, maar dat is inmiddels `0021`.
  `DienstStarten` toont `DienstTabs` zodra er ergens een open dienst is.
- `ModusKeuze` ("Bar" is een `Link` naar `/`) en `Assortimentbeheer`: de
  modus is React-state (`useState<"kiezen" | "beheer">`). Er staat niets van
  in de database. Wie `/beheer` opnieuw opent, krijgt de keuze opnieuw. "Modi
  zijn losse instanties" (ADR 0003) is vandaag alleen UI.
- De bar-schermen hebben geen uitlogknop. Die staat alleen in `BeheerTabs`
  en in de portal.
- `useShiftLedger(shiftId)` en de dienst-afsluiten-samenvatting werken al per
  `shift_id`. `useLogboek` is organisatiebreed.
- `pg_cron` staat aan sinds `0025` (`purge_client_errors`). Er is geen
  mailprovider: de enige mails zijn de Auth-mails van Supabase
  (`inviteMember`, magic link, herstel).

**"De onlangs gebouwde inactiviteitstijd" bestaat niet in de code.**
Gezocht op `inactiv*`, `idle`, `timeout`, `setTimeout`/`setInterval`, in
`src/`, `supabase/`, `docs/`, `designs/` en op alle remote branches. Wel
gevonden:

- **#88** (commit `7dcede5`) noemt een "staffknop-timeout". Dat is een
  Playwright-wachttijd in `e2e/a11y.spec.ts` (`waitFor(... timeout:
  15_000)`), die een test deed falen. Het is geen productfunctie.
- `supabase/config.toml`: `jwt_expiry = 3600`. Dat is alleen de lokale
  stack. Het is de levensduur van een access token, geen inactiviteitstijd.
- Het koppelcookie: 400 dagen, glijdend (`tabletKoppeling.ts`).
- `DEDUPE_WINDOW_MS` (5 minuten, `clientErrors.ts`) en toastduren. Niet
  relevant.
- Mogelijk bedoelt Bram de Supabase-projectinstelling "Inactivity timeout"
  (Auth → Sessions, in het dashboard). Die staat niet in deze repo en is
  daarom niet te controleren.

Welke tijd bedoeld is, is open vraag 7.

**Kaders.** CLAUDE.md (Architectuurbeslissingen, Auth), ADR 0002, 0003, 0005,
0007, 0009, 0011 en 0013, en `docs/features/bar-rpc-autorisatie.md` (A2 gebouwd,
A3/B1–B3 open). `docs/ARCHITECTURE.md` → "Shared bar-tablet session
mechanism", "Dienst & bezetting" en "PIN storage/hashing" ("No lockout in
MVP").

## Begrippen

- **Apparaat**: één browserprofiel. Twee tabbladen in dezelfde browser zijn
  één apparaat, want ze delen het cookie. Dezelfde tablet in een tweede
  browser is een tweede apparaat. Iets preciezers kan een webapp niet weten
  zonder apparaat-sniffing, en die is verboden (`check:policy`).
- **Sessie**: één Supabase-login in dat browserprofiel, herkenbaar aan het
  JWT-claim `session_id`. De sessie overleeft browser dicht en weer open en
  eindigt bij uitloggen, inactiviteit of een beheerderingreep.
- **Bar-sessie**: een sessie die voor bar-werk geregistreerd is in
  `bar_sessions`, van een niet-gearchiveerd lid met rol `bardienst` of
  `beheerder`, in modus `bar`.
- **Koppeling**: een rij in `shift_sessions`. Deze sessie werkt in deze
  dienst.

## Doel

Bar-werk gebeurt in een persoonlijke sessie per apparaat, en de database
weet in welke sessie of sessies een dienst loopt. Elke bar-RPC dwingt dat af.
De beheerderinstelling (a)/(b)/(c) wordt daarmee een set regels over
koppelingen in plaats van drie mechanismen. De gedeelde device-sessie is niet
meer nodig.

**Hoe dit binnen de twee kernbeslissingen past.**

- *Geld alleen via RPC*: er komt geen nieuw schrijfpad naar een geldtabel.
  De bestaande RPC's krijgen een strengere toegangsvoorwaarde en schrijven
  `bar_session_id` mee. Die waarde leest de RPC zelf uit de sessie, het is
  nooit een clientparameter. Bedrag, saldo, limiet en €500 veranderen niet.
- *Attributie via de bezetting, niet via een PIN*: `served_by` en
  `reversed_by` blijven gecontroleerd tegen de bezetting van de dienst,
  ongewijzigd. Nieuw is dat de sessie zelf een geïdentificeerd lid is: wie
  "ingelogd" is. Dat is nadrukkelijk niet "wie bediende". Het maakt de
  attributie niet sterker en ook niet zwakker (zie Veiligheid → Hervatten).

## Betrokken shell

Alleen `shells/bar`, inclusief `/beheer`, dat daarbinnen draait. De portal
heeft een eigen cookie (ADR 0009) en geen dienstbegrip. Portal-sessies worden
niet geregistreerd. Alle nieuwe schermen komen in `src/features/`,
shell-onwetend. Hergebruik:

- de loginflow: `BeheerLogin` + `ModusKeuze`. Geen tweede loginformulier.
- `DienstAfsluitenOverlay` (ook voor afsluiten door een beheerder)
- `AuroraMerk` en de bestaande overlay- en toastpatronen

## Het model

### Fase 1 en de drie standen

| | open diensten | actieve koppelingen per dienst | koppelingen per sessie |
|---|---|---|---|
| **(a)** 1 dienst, 1 apparaat | ≤ 1 | precies 1 | ≤ 1 |
| **(b)** 1 dienst, meerdere apparaten | ≤ 1 | ≥ 1 | ≤ 1 |
| **(c)** meerdere diensten | onbeperkt | precies 1 | ≤ 1 |

In alle standen werkt een sessie in hooguit één dienst tegelijk.

**Fase 1 (voorstel, zie open vraag 1): gedrag (a), vast, zonder instelling.**
Een dienst kan op elk apparaat gestart worden waar een bardienst of beheerder
persoonlijk is ingelogd. Daarna hoort hij bij die ene sessie. Een ander
apparaat ziet dat er een dienst loopt, maar kan er niet in werken. Een
beheerder kan de dienst vanaf een ander apparaat afsluiten of overnemen. Dat
is de letterlijkste lezing van "een dienst hoort bij de sessie waarin hij
gestart is". Het is ook het dichtst bij vandaag (één tablet), en bij een kapot
apparaat is er via overnemen altijd een uitweg.

De andere lezing van "hoeft niet altijd van hetzelfde apparaat te komen" is
gedrag (b): meerdere apparaten tegelijk in de ene dienst. Dat is technisch
even groot (`join_shift` in plaats van overnemen). Welke Bram bedoelt, is
vraag 1.

### Waar "apparaat/sessie" in de database komt

In een eigen tabel `bar_sessions`, met als sleutel
`auth.jwt()->>'session_id'`. Waarom niet `auth.sessions` direct of een
apparaatcookie: zie ADR 0015 → Verworpen alternatieven. Kort:

- `auth.sessions` verdwijnt bij uitloggen en heeft geen modus, sluitreden of
  activiteit;
- Bram koppelt de dienst aan de sessie, niet aan de hardware.

Het einde van een sessie wordt zo een database-feit. Een bar-RPC weigert
meteen, ook als het access token nog tot `jwt_expiry` geldig is.

## Datamodel

Alle nieuwe tabellen: RLS aan, schrijven `REVOKE`d voor `anon` en
`authenticated` (alleen via RPC), en voor elke policy een negatieve test
(`check:rls`).

**`bar_sessions`** (nieuw)

| kolom | type | |
|---|---|---|
| `id` | uuid pk | |
| `auth_session_id` | uuid not null unique | uit het JWT, nooit een clientparameter |
| `member_id` | uuid not null → `members` | wie er ingelogd is |
| `mode` | text not null, `bar` \| `beheer` | ADR 0003, nu server-side |
| `started_at` | timestamptz not null default now() | |
| `last_activity_at` | timestamptz not null default now() | zie Inactiviteit |
| `ended_at` | timestamptz null | |
| `end_reason` | text null: `uitgelogd` \| `inactief` \| `beheerder` | |
| `ended_by` | uuid null → `members` | alleen bij `beheerder` |

Lezen: bardienst en beheerder (`not caller_is_lid()`). Een lid ziet niets. Dat
is strenger dan `shifts` (ADR 0007), bewust: dit is operationele informatie,
geen dienstinformatie.

**`shift_sessions`** (nieuw)

| kolom | type | |
|---|---|---|
| `shift_id` | uuid → `shifts` | |
| `bar_session_id` | uuid → `bar_sessions` | |
| `joined_at` | timestamptz not null default now() | |
| `left_at` | timestamptz null | |
| `left_reason` | text null: `dienst_afgesloten` \| `uitgelogd` \| `inactief` \| `overgenomen` \| `beheerder` | |

- pk `(shift_id, bar_session_id)`
- partiële unique index op `bar_session_id where left_at is null`: een sessie
  werkt in hooguit één dienst. Dit geldt in elke stand. Anders dan bij
  `shifts` in `0021` kan dat hier als index, want de tabel is nieuw en er is
  geen oude data die de migratie kan breken.
- Lezen: als `bar_sessions`.

**`shifts`**: nieuwe kolom `started_session_id uuid null → bar_sessions`. Die
is null voor diensten van vóór deze migratie.

**`orders`, `top_ups`, `order_reversals`**: nieuwe kolom `bar_session_id uuid
null → bar_sessions`. De RPC vult die uit de aanroepende sessie. Bij
`reverse_order_as_admin` blijft hij null. Voorstel, zie open vraag 18: dit is
achteraf niet te reconstrueren, en het is de basis voor omzet of kas per
apparaat.

**`app_settings`** (fase 2): `shift_session_mode text not null` (`een_apparaat`
\| `meerdere_apparaten` \| `meerdere_diensten`). De standaardwaarde is open
vraag 2. Of de inactiviteitstijd een instelling of een vaste waarde wordt, is
open vraag 7.

**`admin_notifications`** (als de ping een melding in de app wordt, open vraag
8)

| kolom | type | |
|---|---|---|
| `id` | uuid pk | |
| `kind` | text: `dienst_zonder_sessie` | |
| `shift_id` | uuid → `shifts` | |
| `bar_session_id` | uuid null → `bar_sessions` | de sessie die wegviel |
| `created_at` | timestamptz not null default now() | |
| `resolved_at` | timestamptz null | |
| `resolved_by` | uuid null → `members` | |

Lezen alleen door een beheerder. Er is geen vrij tekstveld, zelfde afweging
als `client_errors` (ADR 0012).

## RPC's

### Guards (intern, geen `EXECUTE` voor API-rollen)

- **`require_bar_session() returns bar_sessions`**. Zoekt de rij bij
  `auth.jwt()->>'session_id'` en weigert met:
  - `no_bar_session` als er geen rij is of het claim ontbreekt;
  - `session_ended` als `ended_at` gezet is;
  - `session_inactive` als `now() - last_activity_at` groter is dan de
    inactiviteitstijd;
  - `wrong_mode` als `mode` niet `bar` is;
  - `no_bar_role` als het lid gearchiveerd is of geen rol `bardienst` of
    `beheerder` heeft. Die rol wordt bij elke aanroep opnieuw gelezen, niet
    alleen bij registratie. Dat beantwoordt open vraag 21 voorlopig
    restrictief.

  Bij succes zet de guard `last_activity_at = now()`. Die schrijfactie blijft
  alleen staan als de hele RPC slaagt: een `raise` verderop draait haar
  terug. Een mislukte aanroep telt dus niet als activiteit. Dat is correct.
- **`require_shift_session(p_shift_id) returns bar_sessions`**: eerst
  `require_bar_session()`, dan een actieve koppeling met `p_shift_id`, anders
  `session_not_on_shift`.

Beide guards staan vóór alle andere checks, net als de `caller_is_lid()`-guard
in `0023`, zodat een buitenstaander niets leert over diensten.

### Bestaande RPC's

| RPC | vandaag | wordt |
|---|---|---|
| `start_shift` | `(p_member_id, p_pin, p_activity_type_id)`, lock, `shift_already_open`, PIN van `p_member_id` | `require_bar_session()`. Starter is het lid van de sessie. Voorstel `(p_activity_type_id)` zonder PIN, zie open vraag 5. Lock zoals in `0021`. (a)/(b): `shift_already_open` als er ergens een open dienst is. (c): `session_has_shift` als deze sessie al gekoppeld is. Schrijft `shifts.started_session_id`, de starter in `shift_members` (zoals nu) en een koppeling. De signatuur verandert, dus drop + create, en `EXECUTE` opnieuw intrekken voor `PUBLIC`/`anon` (`0018`). |
| `place_order` | `caller_is_lid()`, dan `shift_not_open` | `require_shift_session(p_shift_id)` in plaats van `caller_is_lid()`. Rest ongewijzigd. Schrijft `bar_session_id`. |
| `top_up` | idem | idem. De €500 blijft. |
| `reverse_order_at_bar` | idem | idem. "Alleen die dienst" blijft staan. |
| `add_shift_member` | idem | `require_shift_session(p_shift_id)` |
| `remove_shift_member` | idem | `require_shift_session(p_shift_id)`. De sessiehouder zelf verwijderen: zie Randgevallen. |
| `end_shift` | `caller_is_lid()`, stille no-op bij een onbekende dienst | `require_shift_session(p_shift_id)`. Sluit ook alle koppelingen (`dienst_afgesloten`). Zonder koppeling is het voortaan een fout, geen stille no-op. |
| `reverse_order_as_admin` | ADR 0002-actorcheck | Ongewijzigd. `bar_session_id` blijft null. |

### Nieuwe RPC's

Allemaal `security definer` en alleen voor `authenticated`.

- **`register_bar_session(p_mode text) returns bar_sessions`**. De UI roept
  deze aan na een geslaagde login, bij de keuze Bar of Beheer in
  `ModusKeuze`. Controles:
  - het claim `session_id` bestaat;
  - `auth.uid()` hoort bij een niet-gearchiveerd lid met rol `bardienst` of
    `beheerder` (modus `beheer`: alleen `beheerder`);
  - bestaat er al een actieve rij met dezelfde modus, dan wordt die
    teruggegeven;
  - met een andere modus: `mode_locked` (ADR 0003: modus wisselen = uitloggen);
  - is er een beëindigde rij voor deze `session_id`, dan `session_ended`.

  Dat laatste is essentieel. Anders kan een sessie die wegens inactiviteit
  gesloten is, zich meteen opnieuw registreren, en betekent inactiviteit
  niets.
- **`touch_bar_session() returns bar_sessions`**: de hartslag, zie
  Inactiviteit. Geeft ook de toestand terug, en daar leest het hervatscherm
  uit.
- **`end_bar_session()`**: uitloggen. Zet `ended_at` en `uitgelogd`, en sluit
  de koppeling (`uitgelogd`). Daarna roept de client
  `signOut({ scope: "local" })` aan. Wat er gebeurt als de sessie nog een
  open dienst heeft, is open vraag 17.
- **`my_bar_state()`**: de leesbron voor de opvolger van `useOpenShift`. Zie
  hieronder. Dit is een RPC en geen `select`, omdat "welke sessie ben ik"
  alleen server-side bekend is.
- **`admin_end_shift(p_shift_id)`**: ADR 0002-actorcheck (beheerder). Werkt
  vanuit modus `bar` en `beheer`, zie open vraag 12. Zet `ended_at`, sluit
  alle koppelingen (`beheerder`) en markeert openstaande meldingen voor deze
  dienst als opgelost.
- **`admin_take_over_shift(p_shift_id)`**: actorcheck (beheerder) plus
  `require_bar_session()` van de beheerder, die nog geen koppeling mag hebben.
  (a): de bestaande koppeling krijgt `overgenomen`, en de beheerder krijgt een
  nieuwe koppeling. De beheerder komt in `shift_members` (voorstel, open vraag
  12). Meldingen worden opgelost. `shifts.started_by` blijft wie hem startte:
  de overname staat in `shift_sessions`.
- **`admin_end_bar_session(p_bar_session_id)`**: voorstel, open vraag 12. Een
  apparaat op afstand afmelden, bijvoorbeeld een verloren tablet. Zonder deze
  RPC kan de oude sessie na afsluiten van de dienst nog een nieuwe dienst
  starten.
- **`join_shift(p_shift_id)`**: fase 2, alleen in stand (b). Vereist
  `require_bar_session()` zonder bestaande koppeling en een open dienst.
  Of de aansluiter automatisch in de bezetting komt, is open vraag 13.
- **`set_shift_session_mode(p_mode)`**: fase 2, beheerder. Voorwaarden:
  open vraag 16.
- **`close_inactive_bar_sessions()`**: alleen voor `pg_cron`, geen `EXECUTE`
  voor enige API-rol (patroon `purge_client_errors`, `0025`). Draait elke
  minuut. De frequentie volgt uit open vraag 7. De job:
  - zet `inactief` op verlopen sessies;
  - sluit hun koppelingen;
  - maakt een melding aan voor elke open dienst die daardoor geen actieve
    koppeling meer heeft.

  De guard hangt niet van deze job af. Valt `pg_cron` uit, dan weigeren de
  RPC's nog steeds, alleen de melding komt later.

### Wat er gebeurt met `caller_is_lid()`

In de bar-RPC's wordt de guard vervangen door de allowlist hierboven. Een
lid kan zich niet als bar-sessie registreren (rolcheck), dus A2 blijft
inhoudelijk gedekt. De functie zelf blijft bestaan: de RLS-leespolicies uit
`0015` gebruiken haar, en die veranderen niet. Hiermee zijn A3 en B3 uit
`bar-rpc-autorisatie.md` gerealiseerd zonder `device_accounts`: alleen een
geregistreerde bar-sessie mag bar-RPC's aanroepen en een dienst starten.

### Wat er gebeurt met `0021` en "de" open dienst

- `0021` blijft voor (a) en (b): hooguit één open dienst. Het lock blijft ook
  in (c), dan tegen een dubbele koppeling per sessie.
- **`useOpenShift` wordt vervangen** door een hook op `my_bar_state()`, met de
  werktitel `useMijnDienst`. De vorm is aan de Developer. De hook geeft:
  - de eigen bar-sessie (of geen);
  - de dienst van deze sessie (of geen);
  - in (a)/(b): de open dienst elders, met de naam van de starter, het
    activiteittype, de begintijd, en per koppeling de naam van de ingelogde
    en de laatste activiteit;
  - in (c): de lijst van open diensten elders.

  Het type `OpenShift` en `DienstTabs`, `DienstActief`, `VerkoopScherm` en
  `DienstAfsluitenOverlay` kunnen blijven. Die krijgen al een `shift` als prop
  en nemen verder niets aan over "de" open dienst.
- `DienstStarten` beslist niet meer op "er is ergens een open dienst", maar op
  "deze sessie heeft een dienst" (zie Schermflow).
- `useShiftLedger(shiftId)` en de afsluitsamenvatting werken al per dienst en
  veranderen niet. `useLogboek` is organisatiebreed. In (c) staan boekingen
  van parallelle diensten door elkaar. Een dienstkolom daar valt buiten scope,
  tenzij Bram erom vraagt.

## Schermflow (bar-shell)

Alle teksten zijn open vraag 23. Hieronder alleen de toestanden.

1. **Geen sessie**: het loginscherm. Hergebruik `BeheerLogin`, gevolgd door
   `ModusKeuze`. "Bar" roept `register_bar_session('bar')` aan, "Beheer"
   `register_bar_session('beheer')`. De `StaffPicker` met PIN verdwijnt uit
   `DienstStarten` (open vraag 5). De PIN-login komt in fase 3 (open vraag 6).
2. **Hervatten na browser dicht en weer open.** Er is een sessie, maar in
   deze browserstart is die nog niet bevestigd. Een vlag in
   `sessionStorage` ontbreekt: `sessionStorage` wordt gewist als de browser
   sluit. De app leest eerst alleen de toestand (`my_bar_state()`, geen
   hartslag):
   - actief: het scherm "Verder met de sessie van {naam}?" met twee keuzes,
     verder en uitloggen. Iedereen mag bevestigen (Bram). Pas na "verder"
     volgt de hartslag, dus het scherm zelf telt niet als activiteit.
   - inactief of beëindigd: de melding (punt 5), daarna het loginscherm.
3. **Bar-sessie, geen eigen dienst**:
   - er is geen open dienst: activiteitkeuze, dan starten (`ActiviteitKeuze`
     blijft);
   - (a) er loopt een dienst op een ander apparaat: "Er loopt een dienst op
     een ander apparaat", met starter, activiteit en laatste activiteit. Een
     bardienst kan niets starten. Een beheerder ziet daarnaast "Overnemen" en
     "Afsluiten";
   - (b) (fase 2): "Aansluiten";
   - (c) (fase 2): "Nieuwe dienst starten", en de lijst van diensten elders.
4. **Bar-sessie met eigen dienst**: `DienstTabs`, zoals nu, met één toevoeging:
   een uitlogknop. Die bestaat vandaag niet op de bar-schermen. Zie open vraag
   17 voor uitloggen met een open dienst.
5. **Sessie gesloten**, door inactiviteit, overname of een beheerder: de
   volgende RPC of hartslag geeft `session_inactive`, `session_ended` of
   `session_not_on_shift`. De app toont een melding met de reden, logt lokaal
   uit en toont het loginscherm. Een half ingevuld mandje gaat verloren. Dat
   hoort bij de melding.

**Beheer (`/beheer`)** krijgt, in modus `beheer`:

- een overzicht van de open dienst of diensten, met hun koppelingen en de
  laatste activiteit;
- "Afsluiten" (hergebruikt `DienstAfsluitenOverlay`, met dezelfde
  samenvatting);
- de meldingen (als open vraag 8 op "in de app" uitkomt).

Overnemen gebeurt in bar-modus, want het vraagt een bar-sessie op het nieuwe
apparaat.

## Inactiviteit en de beheerderping

- **Wat telt als activiteit** (voorstel, open vraag 7):
  - elke geslaagde bar-RPC;
  - een hartslag `touch_bar_session()` bij gebruikersinteractie op een
    bar-scherm (tik of toets), hooguit één keer per minuut (throttled). Een
    scherm dat alleen openstaat, telt niet.
- **Waar het wordt afgedwongen**: in de guard, server-side. De client-timer
  is alleen UX: de melding verschijnt ook als niemand iets aanraakt.
  Server-side tijd, geen klok van het apparaat.
- **De tijd zelf**: niet gevonden in de code (zie Onderzocht). Open vraag 7.
- **De ping**: voorstel, een melding in de app (`admin_notifications`),
  aangemaakt door `close_inactive_bar_sessions()` als een open dienst zijn
  laatste actieve koppeling verliest. Beheerders zien de melding in `/beheer`
  en op de bar-schermen als ze in bar-modus zijn ingelogd. Een e-mail vraagt
  een mailprovider die er niet is, plus een server-side verzender (Edge
  Function of `pg_net`). Open vragen 8 en 9.
- **"Die het kan oplossen"**: oplossen is overnemen of afsluiten. Beide RPC's
  markeren de melding als opgelost.

## Beheerder: afsluiten of overnemen vanaf een ander apparaat

- **Afsluiten**: `admin_end_shift`. De dienst sluit voor alle koppelingen. Het
  oude apparaat krijgt bij de volgende actie `session_not_on_shift` en
  daarmee punt 5 van de Schermflow. Omzet en samenvatting horen bij de dienst,
  niet bij het apparaat, dus er gaat niets verloren.
- **Overnemen**: `admin_take_over_shift`. In (a) vervangt de nieuwe koppeling
  de oude. De sessie op het oude apparaat blijft ingelogd, maar kan niet meer
  in de dienst werken, tenzij `admin_end_bar_session` ook gekozen wordt (open
  vraag 12).
- De ADR 0002-regel "beheeracties nooit op de gedeelde sessie" blijft
  inhoudelijk staan, maar is voortaan vanzelfsprekend: er is geen gedeelde
  sessie meer.

## Omzet per dienst, afsluiten en kasopmaak

- **(a) en (b)**: één dienst, één omzet, één afsluiting. Dat is
  `DienstAfsluitenOverlay`, ongewijzigd. In (b) kunnen meerdere apparaten ook
  meerdere kasladen betekenen (chat18: "twee kasladen"). De kaart
  "Opgewaardeerd (contant)" is dan één totaal voor alle laden samen. Met
  `bar_session_id` op de boekingen is een uitsplitsing per apparaat mogelijk.
  Of die op het scherm komt, is open vraag 18.
- **(c)**: elke dienst heeft een eigen omzet, activiteit, bezetting en
  afsluiting. De bestaande queries per `shift_id` kloppen al. Saldo is
  organisatiebreed: `place_order` zet `for update` op de ledenrij, dus
  gelijktijdig afrekenen bij twee diensten is veilig.
- **Overname**: de omzet blijft op de dienst. Via `bar_session_id` is het deel
  voor en na de overname terug te vinden.
- **Kasopmaak**: die bestaat vandaag niet als functie. Er is geen startgeld
  en geen kastelling, alleen de contant-kaart. Deze spec voegt die niet toe.

## Veiligheid

- **De URL is publiek.** Zonder device-sessie toont de bar-URL alleen een
  login. Alle bar-data en bar-RPC's vragen een persoonlijke login van een
  bardienst of beheerder. Dat is strenger dan ADR 0011, waar iedereen bij de
  gekoppelde tablet alles kon lezen. Het aanvalsoppervlak is de e-mail- en
  wachtwoordlogin van GoTrue (hun rate limits; accountbestaan is niet geheim,
  ADR 0013), en later de PIN-login (zie hieronder).
- **De anon-key is publiek.** Elke nieuwe functie trekt `EXECUTE` in voor
  `PUBLIC`/`anon` (`0018`); `rpc_execute_grants.test.sql` bewaakt dat al. De
  twee guards en `close_inactive_bar_sessions` krijgen geen `EXECUTE` voor
  API-rollen. `register_bar_session` is met een willekeurige JWT aanroepbaar,
  maar alleen voor het eigen lid met een bar-rol. Een bardienst die het vanuit
  een portal-sessie via de API aanroept, logt in feite in op de bar. Dat is
  dezelfde persoon met dezelfde rechten, dus aanvaardbaar.
- **"De bar-shell draait nooit op een telefoon" is een supportuitspraak, geen
  beveiligingsgrens.** Zonder koppeling kan elke bardienst de bar openen op
  elk apparaat, ook een telefoon. Dat kan niet worden tegengehouden:
  apparaat-sniffing is verboden en ook te vervalsen. In (a) en (b) begrenst de
  koppelregel wat dat oplevert. In (c) kan een bardienst thuis een eigen
  dienst openen en zichzelf opwaarderen. A4 ("nooit naar jezelf
  opwaarderen") is niet gekozen. Open vragen 15 en 20.
- **Hervatten zonder bewijs.** "Iedereen mag bevestigen" betekent dat wie het
  apparaat vasthoudt, werkt onder de sessie van wie er ingelogd is. Dat is een
  bewuste keuze van Bram en de UI-stap is geen beveiliging. Gevolgen:
  - `bar_sessions.member_id` betekent "ingelogd als", nooit "deed dit";
  - na hervatten horen "Mijn account" (PIN of wachtwoord wijzigen) en de
    beheermodus niet bereikbaar te zijn zonder opnieuw in te loggen (open
    vragen 10 en 11). Vandaag is de modus alleen UI-state.
- **De PIN als login is het gevoeligste punt.** Vier cijfers, bcrypt cost 6,
  geen lockout (`bar-rpc-autorisatie.md` feit 3: de volledige PIN-ruimte in
  2 seconden). Een PIN die op elk apparaat met de publieke URL een sessie
  oplevert, is praktisch geen wachtwoord. Voorwaarden voor elke PIN-login
  (fase 3, eigen ADR):
  - alleen op een apparaat waar dat lid eerder met wachtwoord is ingelogd.
    Dat vraagt een apparaat-id, dus een opvolger van `abas_tablet` met status
    in de database;
  - een lockout (B2);
  - een hogere kostenfactor (B1).

  Zie open vragen 3 en 6.
- **Verloren of gestolen apparaat.** Het Supabase-cookie is niet `HttpOnly`
  (restrisico uit ADR 0011, nu per persoon). Anders dan bij het device-account
  is intrekken nu per sessie: `admin_end_bar_session` laat de RPC's meteen
  weigeren. Leesrechten via RLS blijven voor dat account tot het access token
  verloopt. Dat is de status quo voor elke persoonlijke bardienst-sessie
  (ADR 0012: een bardienst kan via RLS al alles lezen, ook vanuit de portal).

## Tablet koppelen: actiepunten (niet besloten, open vraag 19)

Belangrijk: met de guards hierboven kan de device-sessie geen enkele bar-RPC
meer aanroepen, want het device-account heeft geen `members`-rij en dus geen
bar-sessie. Fase 1 en het vervallen van de device-route zijn dus aan elkaar
gekoppeld. Het alternatief, de device-sessie als uitzondering in de allowlist,
is precies het "één identiteit voor alle apparaten" dat Bram niet wil.

Wat er met elk onderdeel gebeurt als het weg mag:

- **`/koppel`** (`src/app/(bar)/koppel/`, `src/features/tablet-koppelen/`):
  verwijderen. Een oude bladwijzer geeft dan een 404. Een redirect naar `/`
  is ook mogelijk, dat mag Bram kiezen.
- **`src/lib/tabletKoppeling.ts`** en de device sign-in in
  **`src/middleware.ts`**: verwijderen. De middleware houdt `designPreviewGate`
  en de gewone `@supabase/ssr`-cookieverversing. Als een route zonder sessie
  naar de login moet, doet de client dat, of de middleware met een redirect.
  Dat mag de Developer kiezen.
- **Het koppelcookie `abas_tablet`**: heeft geen functie meer. Voorstel: de
  middleware verwijdert het bij de eerste request (`Max-Age=0`), zodat er geen
  400 dagen oud cookie blijft hangen. Het is onschadelijk als het blijft.
- **`BAR_DEVICE_SECRET`**: uit Vercel (Production) en uit CI. Het secret is
  daarna waardeloos, want er is niets meer dat het leest.
- **`SUPABASE_DEVICE_EMAIL` en `SUPABASE_DEVICE_PASSWORD`**: uit Vercel en
  CI. `seed.sql` verliest `device@aurora.local`. De e2e-helpers die via
  `/koppel` koppelen, worden vervangen door een login als seed-bardienst.
- **Het device-account op het gehoste project intrekken.** Twee stappen:
  1. de sessies intrekken, zodat verversen stopt;
  2. het account verwijderen of blokkeren.

  Wat dat nog betekent:
  - voor bar-RPC's niets meer, want de guard weigert het account al;
  - voor lezen wel: tot het verwijderd is, leest een lopend access token van
    dat account via RLS nog alle leden en saldi (`caller_is_lid()` is onwaar
    voor een account zonder ledenrij). Na intrekken blijft dat tot
    `jwt_expiry`. Verwijderen hoort daarom bij de uitrol, niet "later".
- **Documentatie**: ADR 0011 wordt "vervangen door ADR 0015". Verder gaat het
  om `docs/ARCHITECTURE.md` → "Device sign-in mechanism", "Local/CI device
  account", "e2e-mocks on `/beheer`" en "Still open: Device account
  provisioning flow" (vervalt). #78 vervalt: er is geen device-sessie meer
  die de `denied`-melding veroorzaakt.
- **Uitrolvolgorde**: eerst moet elke bardienst en beheerder een werkend
  wachtwoord hebben (ADR 0005 Beslissing 5 laat dat voor PIN-only leden
  open). Anders staat iemand na de deploy buiten de bar. Dat is een ops-stap
  voor Bram.

## Rolzichtbaarheid

- **Lid**: niets hiervan. Geen bar-sessie mogelijk. `bar_sessions`,
  `shift_sessions` en `admin_notifications` zijn niet leesbaar.
- **Bardienst**: de eigen sessie. Welke dienst er loopt, met starter,
  activiteit, en per koppeling de naam en laatste activiteit. Geen ingrepen
  in andermans sessie of dienst.
- **Beheerder**: alles van een bardienst, plus het overzicht van actieve
  sessies, de meldingen, afsluiten en overnemen (en eventueel afmelden), en
  in fase 2 de instelling.

## Randgevallen

- **Twee tabbladen in één browser**: één sessie, één apparaat. Ze werken
  samen in dezelfde dienst, zoals nu.
- **Dezelfde persoon op twee apparaten**: twee sessies. In (a) kan de tweede
  niet in de dienst werken. Mag de starter zijn eigen dienst naar zijn andere
  apparaat verhuizen? Voorstel: nee in fase 1, alleen een beheerder mag
  overnemen (open vraag 12).
- **Browser langer dicht dan de inactiviteitstijd**: geen hervatscherm, maar
  de melding en een nieuwe login. De tijd dat de browser dicht was, telt als
  inactief.
- **Supabase-sessie verlopen** (refresh token ongeldig of ingetrokken): de
  gewone login. De `bar_sessions`-rij blijft actief tot de cron-job hem
  inactief maakt.
- **Een geïnstalleerde PWA op iOS/iPadOS** die door het OS wordt afgesloten:
  wist `sessionStorage` mogelijk vaker dan "browser dicht". Het hervatscherm
  verschijnt dan vaker. Dat is ongevaarlijk, maar moet op het echte apparaat
  getest worden.
- **Overname terwijl het oude apparaat midden in een bestelling zit**: die
  bestelling geeft `session_not_on_shift`. Niets geboekt, het mandje is weg,
  met een melding.
- **Race: twee apparaten starten tegelijk** in (a)/(b): het lock uit `0021`,
  de tweede krijgt `shift_already_open`. In (c): de unique index per sessie.
- **Lid gearchiveerd of rol naar `lid` tijdens de dienst**: de guard weigert
  zijn sessie meteen. De dienst verliest zijn koppeling, en de cron-job maakt
  een melding (open vraag 21).
- **De ingelogde persoon verwijdert zichzelf uit de bezetting**: vandaag mag
  dat. Voorstel: de sessiehouder blijft verwijderbaar, want de bezetting gaat
  over attributie, niet over sessies. De sessie werkt door. Niet als open
  vraag opgenomen omdat het niets verandert aan wat er nu kan. Bram kan het
  omdraaien.
- **Een beheerder in modus `beheer`** kan geen bar-RPC aanroepen
  (`wrong_mode`). Dat volgt uit ADR 0003, en is nu voor het eerst ook
  server-side waar.
- **`pg_cron` draait niet**: de guard weigert nog steeds. Alleen de melding en
  de sluitreden in de database komen later.
- **Oude diensten** (van vóór de migratie): `started_session_id` is null en er
  zijn geen koppelingen. Een dienst die bij de uitrol open staat, is van
  niemand. Voorstel: de migratie weigert als er een open dienst is, en de
  uitrol gebeurt na het afsluiten. Een ops-stap.

## Fasering (voorstel)

**Fase 1: één dienst, niet aan één vast apparaat gebonden.**

- `bar_sessions`, `shift_sessions`, de guards, en de wijzigingen aan de zeven
  bar-RPC's
- `register_bar_session`, `end_bar_session`, `touch_bar_session`,
  `my_bar_state`
- vast gedrag (a) (of (b), open vraag 1), zonder instelling
- inloggen via de bestaande e-mail/wachtwoord-login en `ModusKeuze`
- `start_shift` zonder PIN (open vraag 5)
- uitloggen op de bar-schermen, het hervatscherm, en de meldingen bij een
  gesloten sessie
- `admin_end_shift` en `admin_take_over_shift` (en eventueel
  `admin_end_bar_session`)
- inactiviteit met `close_inactive_bar_sessions` en de ping in de app (open
  vragen 7–9)
- `bar_session_id` op de boekingen
- tablet koppelen en het device-account eruit, in dezelfde uitrol (open vraag
  19)

**Fase 2: de instelling.**

- `app_settings.shift_session_mode` en `set_shift_session_mode`
- stand (b) met `join_shift`
- stand (c) met de extra begrenzing uit open vraag 15
- de modus server-side afdwingen in de beheer-RPC's (open vraag 11), als dat
  niet al in fase 1 moet
- eventueel omzet per apparaat op het afsluitscherm (open vraag 18)

**Fase 3: de PIN als persoonlijke inlog per apparaat.** Een eigen ADR, na de
open vragen 3, 4 en 6:

- een apparaat-id, met status in de database
- een PIN-login via een server-actie die een sessie aanmaakt (ADR 0006-patroon,
  `auth.admin`)
- lockout (B2) en een hogere kostenfactor (B1)

Tot fase 3 blijft één persoon per apparaat ingelogd. Wie wisselt, logt uit en
logt in met e-mail/wachtwoord. Dat is frictie: open vraag 6 vraagt of dat
tijdelijk acceptabel is.

**Later of los**: de ping per e-mail (open vraag 8).

## Expliciet buiten scope

- De PIN-login zelf (fase 3, eigen ADR). Deze spec schrapt alleen de PIN uit
  `start_shift` (als open vraag 5 ja is) en ontwerpt de rest zo dat een
  PIN-login er later bij kan.
- Een kasopmaak- of kastellingfunctie (startgeld, tellen, verschil).
- `served_by` sterker maken (bijvoorbeeld standaard de ingelogde persoon).
  Dat is een eigen beslissing, want het raakt CLAUDE.md →
  Architectuurbeslissingen.
- Offline gebruik en service-worker (CLAUDE.md → Shells: bewust uitgesteld).
- Een dienstkolom in het Logboek voor stand (c).
- A4 ("nooit naar jezelf opwaarderen"), behalve als Bram het kiest bij open
  vraag 15.
- Leestoegang op RLS-niveau koppelen aan een actieve bar-sessie. Die blijft
  zoals ADR 0007 en ADR 0012 hem vastleggen.

## Verhouding tot bestaande beslissingen: conflicten

Geen van deze conflicten is hier opgelost. Elk conflict verwijst naar de
vraag waarin Bram kiest.

1. **CLAUDE.md → Architectuurbeslissingen**: "Eén bardienst-tablet, één
   Supabase-sessie, wisselende medewerkers" en "Het *starten* van een dienst
   blijft wél op de eigen PIN van de starter". Het eerste vervalt door dit
   model. Het tweede botst met "de PIN heeft niks met de dienst te maken"
   (vraag 5).
2. **CLAUDE.md → Auth en ADR 0005**:
   - "Een PIN vervangt het wachtwoord nooit" en ADR 0005 Beslissing 2 ("PIN
     is een optionele, aanvullende snelkoppeling, geen alternatieve
     methode") botsen letterlijk met "de PIN vervangt e-mail/wachtwoord zodra
     hij is ingesteld".
   - Te verzoenen met ADR 0005 Beslissing 1 en 3 (het wachtwoord bestaat
     altijd, alleen-PIN is verboden) als het wachtwoord bruikbaar blijft, en
     "vervangt" betekent "je hoeft het op dit apparaat niet meer te typen".
     Vraag 4.
3. **CLAUDE.md → Auth en ADR 0003 Beslissing 3**: "PIN via de gedeelde
   tablet-sessie", en andere leden "liften op die sessie". De PIN-route via
   een gedeelde sessie vervalt. Het meeliften via de bezetting blijft.
4. **ADR 0002 stap 3** (herstel van de device-sessie na uitloggen) vervalt.
   Ook "bardienst-acties zijn nooit afhankelijk van welke
   `authenticated`-identiteit" vervalt: dat worden ze juist wel. ADR 0015
   amendeert dit.
5. **ADR 0011** vervalt geheel als tablet koppelen weg mag (vraag 19). Zonder
   dat besluit is fase 1 niet uit te rollen. Zie Tablet koppelen.
6. **`0021`, `useOpenShift` en `docs/ARCHITECTURE.md`** ("at most one open
   shift"): in stand (c) vervalt die regel. In (a)/(b) blijft hij, als regel
   van de stand.
7. **`docs/ARCHITECTURE.md` → "Dienst & bezetting"**: "Starting a shift
   requires the starting member's own PIN — this is the one real
   authentication event per shift". Dat wordt: de login is de
   authenticatiegebeurtenis, de dienst hangt aan de sessie (vraag 5).
8. **`docs/ARCHITECTURE.md` → "PIN storage/hashing"**: "No lockout in MVP" kan
   niet blijven als de PIN een login wordt (vraag 6, fase 3).
9. **`bar-rpc-autorisatie.md`**: A2 wordt vervangen door een allowlist. A3 en
   B3 worden gerealiseerd zonder `device_accounts`. Vraag 6 daar (gearchiveerd
   lid) wordt voor bar-RPC's restrictief beantwoord, tenzij Bram anders kiest
   (vraag 21 hier).
10. **ADR 0003 Beslissing 2** (losse modi) is vandaag alleen UI. Met
    hervatbare sessies die iedereen mag bevestigen, is dat zwakker dan het
    ADR suggereert (vraag 11).
11. **Intern in Brams wensen**: "de PIN is een persoonlijke inlog" en
    "iedereen die het apparaat in handen heeft mag hervatten" trekken
    verschillende kanten op. Het eerste maakt de sessie persoonlijk, het
    tweede maakt haar overdraagbaar zonder bewijs (vraag 10).
12. **`docs/features/dienst-afsluiten.md`**: gaat uit van één dienst, één
    omzet, één kas. Klopt in (a). In (b) is het één omzet voor mogelijk
    meerdere kasladen. In (c) zijn het meerdere diensten (vraag 18).

## Open vragen voor Bram

1. **Wat betekent fase 1 precies?** "Eén dienst open, hoeft niet altijd van
   hetzelfde apparaat te komen" kan twee dingen betekenen:
   - (i) de dienst kan op elk apparaat gestart worden, en hoort daarna bij
     dat apparaat (gedrag (a));
   - (ii) meerdere apparaten werken tegelijk in de ene dienst (gedrag (b)).

   *Aanbeveling: (i).* Het is de letterlijke lezing van "een dienst hoort bij
   de sessie waarin hij gestart is", het ligt het dichtst bij vandaag, en
   overnemen door een beheerder dekt het kapotte apparaat.
2. **Welke stand wordt de standaard** van de instelling in fase 2?
   *Aanbeveling: (a)*, om dezelfde reden. (b) en (c) zijn een bewuste keuze
   van een beheerder voor een avond met een tweede tappunt.
3. **Wat is "inloggen op een apparaat"?** Is het de eerste keer
   e-mail/wachtwoord, en daarna een PIN op dat apparaat? *Aanbeveling: ja,
   en de PIN geldt alleen op een apparaat waar dat lid eerder met wachtwoord
   is ingelogd* (zoals de portal-wireframe: "alleen op dit toestel"). Een PIN
   die op elk apparaat werkt, is met vier cijfers en de publieke URL geen
   beveiliging. Dit vraagt een apparaat-id met status in de database.
4. **Blijft het wachtwoord altijd bruikbaar als er een PIN is?** "De PIN
   vervangt e-mail/wachtwoord" botst letterlijk met ADR 0005 en CLAUDE.md.
   *Aanbeveling: ja, het wachtwoord blijft altijd werken.* "Vervangen"
   betekent dan: op dat apparaat typ je voortaan de PIN. ADR 0005 Beslissing 1
   en 3 blijven, alleen Beslissing 2 wordt herschreven ("de PIN is een
   login, gebonden aan een apparaat").
5. **Start een dienst zonder PIN?** Als de PIN "niks met de dienst te maken"
   heeft, wordt de starter de ingelogde persoon, verdwijnt de `StaffPicker`
   uit `DienstStarten`, en vervalt de CLAUDE.md-zin "het starten van een
   dienst blijft wél op de eigen PIN van de starter". *Aanbeveling: ja.* De
   login is dan de authenticatiegebeurtenis. Een extra PIN bij het starten
   voegt niets toe voor iemand die net persoonlijk is ingelogd (dezelfde
   redenering als ADR 0002 voor beheer-RPC's).
6. **De PIN-login: in welke fase, en mag die naar beheer?**
   - *Aanbeveling fase: fase 3*, met een eigen ADR en met lockout (B2) en
     kostenfactor (B1) als harde voorwaarde. Tot dan blijft één persoon per
     apparaat ingelogd, en wie wisselt, logt in met e-mail/wachtwoord. Is die
     frictie tijdelijk acceptabel?
   - *Aanbeveling beheer: een PIN-login geeft alleen bar-modus*, en beheer
     vraagt het wachtwoord. Dat ligt het dichtst bij ADR 0002 (beheer op een
     eigen e-mailsessie).
7. **Welke inactiviteitstijd bedoel je?** In de code is er geen gevonden. De
   "staffknop-timeout" uit #88 is een testwachttijd van 15 seconden, geen
   productfunctie. Mogelijk bedoel je de instelling "Inactivity timeout" in
   het Supabase-dashboard. Graag: de waarde, of het een vaste waarde is of
   een beheerderinstelling, en of alleen interactie telt of ook een scherm
   dat openstaat. *Aanbeveling: een vaste waarde van jou, als constante in de
   guard. Activiteit is een tik of toets op een bar-scherm plus elke
   geslaagde bar-RPC.* Niet de Supabase-instelling: die sluit de
   Supabase-sessie, maar laat de database niet weten dat een dienst zijn
   sessie kwijt is, dus er komt geen ping.
8. **Wat is een beheerderping technisch: e-mail of een melding in de app?**
   *Aanbeveling: een melding in de app in fase 1* (`admin_notifications`,
   zichtbaar in `/beheer` en voor ingelogde beheerders op de bar). Voor
   e-mail is een mailprovider en een server-side verzender nodig. Die zijn er
   niet, en Supabase's Auth-mails kunnen geen vrije meldingen sturen.
9. **Wie krijgt de ping, en wanneer?** *Aanbeveling: alle niet-gearchiveerde
   beheerders, en alleen als een open dienst daardoor geen actieve sessie
   meer heeft.* Een inactieve sessie zonder dienst geeft geen ping. De melding
   is opgelost zodra één beheerder overneemt of afsluit.
10. **Hervatten: iedereen mag bevestigen, ook bij een sessie van een
    beheerder? En wat mag je daarna?** *Aanbeveling: hervatten geeft alleen
    bar-werk. "Mijn account" (PIN of wachtwoord wijzigen) en beheer vragen
    opnieuw inloggen.* Anders kan wie de tablet vasthoudt de PIN van de
    ingelogde persoon wijzigen.
11. **Moet de modus server-side afgedwongen worden in de beheer-RPC's?**
    Vandaag controleren die alleen de rol, dus een beheerder-sessie in
    bar-modus kan via `/beheer` alsnog beheren. *Aanbeveling: ja*, met
    `bar_sessions.mode = 'beheer'` in de beheer-actorcheck. In fase 1 als de
    aanbeveling bij vraag 10 wordt gevolgd, anders in fase 2.
12. **Beheerderingrepen:**
    - (a) mag afsluiten vanuit bar-modus en vanuit beheer, en overnemen alleen
      vanuit bar-modus op het nieuwe apparaat?
    - (b) komt de overnemende beheerder automatisch in de bezetting?
    - (c) komt er ook "apparaat afmelden" (`admin_end_bar_session`)?
    - (d) mag de starter zijn eigen dienst naar een ander eigen apparaat
      verhuizen?

    *Aanbeveling: (a) ja, (b) ja, (c) ja (nodig bij een verloren tablet),
    (d) nee in fase 1.*
13. **Stand (b), aansluiten**: is "als je daar inlogt" een expliciete knop
    "Aansluiten", of sluit elke nieuwe bar-sessie automatisch aan? En komt de
    aansluiter in de bezetting? *Aanbeveling: een expliciete knop, en ja, in
    de bezetting.* Automatisch aansluiten maakt elke login op elk apparaat
    meteen kassa.
14. **Stand (b), afsluiten**: mag elk gekoppeld apparaat de dienst afsluiten,
    of alleen de starter en een beheerder? *Aanbeveling: elk gekoppeld
    apparaat*, zoals nu iedereen in de dienst kan afsluiten.
15. **Stand (c), begrenzing**: wie mag een tweede, parallelle dienst starten,
    en mag een lid tegelijk in twee bezettingen staan? In (c) kan een
    bardienst overal, ook thuis op een telefoon, een eigen dienst openen en
    zichzelf opwaarderen. *Aanbeveling: in (c) mag alleen een beheerder een
    extra dienst starten naast een lopende. Een lid staat hooguit in één
    open bezetting. Overweeg A4 (nooit naar jezelf opwaarderen) voor (c).*
16. **De stand wisselen terwijl er diensten open zijn?** *Aanbeveling: alleen
    als er geen dienst open is.* Dat is het eenvoudigst en zonder
    tussentoestanden.
17. **Uitloggen met een open dienst**: blokkeren, of de dienst "wees" laten
    (met een ping)? *Aanbeveling: bij uitloggen eerst de keuze "dienst
    afsluiten" of "dienst open laten, een beheerder krijgt een melding"*, net
    als bij inactiviteit.
18. **`bar_session_id` op de boekingen, en omzet of kas per apparaat?**
    *Aanbeveling: de kolom nu toevoegen* (achteraf niet te reconstrueren),
    maar een uitsplitsing per apparaat op het afsluitscherm pas bouwen als je
    er in (b) om vraagt.
19. **Tablet koppelen weg?** `/koppel`, `BAR_DEVICE_SECRET`, het
    `abas_tablet`-cookie, de device sign-in in de middleware en het
    device-account. *Aanbeveling: ja, in dezelfde uitrol als fase 1.* De
    nieuwe guards laten de device-sessie toch niets meer doen. Het
    device-account wordt bij de uitrol verwijderd, niet later, omdat het tot
    dan via RLS nog alle leden en saldi kan lezen. Voorwaarde: elke bardienst
    en beheerder heeft eerst een werkend wachtwoord.
20. **Telefoon**: accepteer je dat "de bar draait nooit op een telefoon" een
    supportuitspraak is en geen grens die de app kan afdwingen? *Aanbeveling:
    ja, en dat expliciet opnemen in CLAUDE.md → Shells.* Zonder koppeling kan
    een bardienst technisch overal inloggen.
21. **Gearchiveerd lid, of rol gewijzigd, tijdens een actieve sessie**: de
    sessie meteen weigeren? *Aanbeveling: ja* (de guard leest de rol bij elke
    aanroep). Dit beantwoordt ook vraag 6 uit `bar-rpc-autorisatie.md` voor de
    bar-RPC's.
22. **Een naam per apparaat** ("Tablet bar", "Laptop keuken") voor het
    beheerderoverzicht? *Aanbeveling: niet in fase 1.* Naam van de ingelogde
    persoon, starttijd en laatste activiteit zijn genoeg om een sessie te
    herkennen.
23. **UI-teksten** voor: het hervatscherm, "dienst op een ander apparaat",
    overnemen en afsluiten, de meldingen bij een gesloten sessie (inactief,
    overgenomen, afgemeld), de beheerdermelding en de uitlogkeuze uit vraag
    17. Er is geen wireframe voor. *Aanbeveling: ik stel na akkoord op het
    model een tekstvoorstel op, dat jij goedkeurt voordat de Developer
    begint.*

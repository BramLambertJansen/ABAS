# Dienst per sessie: eigen sessie per apparaat, en een dienst die bij die sessie hoort

**Status: fase 1 gebouwd en gemerged
([PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01,
merge-commit `ae89bd9`, migraties `0027`–`0037`), inclusief vraag 24 (ii)
(`resume_orphan_shift`, `0030`). Fase 2 (de instelling (a)/(b)/(c),
`join_shift`) is niet gebouwd; wat hieronder over fase 2 staat, is goedgekeurd
ontwerp, geen werkelijkheid.** Goedgekeurd door Bram (2026-09-29), inclusief de
teksten ("goedkeuren, later aanpassen").

Het mechanisme staat in ADR
[0016](../adr/0016-dienst-hoort-bij-geregistreerde-app-sessies.md). In dezelfde
PR aangevuld door
[ADR 0017](../adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md):
[`beheer-tweede-factor.md`](beheer-tweede-factor.md) (beheer eist aal2,
Auth-sessie intrekken, hervatten per browser, promotie naar beheerder) en
[`login-rate-limit.md`](login-rate-limit.md) (eigen loginlimiet, namenlijst
zonder rol). Waar die afwijken van deze spec, gaan zij voor.

Leesvolgorde: "Zoals gebouwd (fase 1)" onderaan beschrijft wat er afwijkt van
of bijkomt op de spec, en gaat voor op de rest van dit document. Brams
antwoorden op de vragen 1–27 staan onderaan als historie en zijn in de tekst
verwerkt. Wat nog open is, staat in de laatste sectie (Nog open).

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
- **Inactiviteit:** een sessie die te lang inactief is, wordt gesloten, met
  een melding. Daarbij gaat een melding naar een beheerder die het kan
  oplossen.
- **Een beheerder mag vanaf een ander apparaat een dienst afsluiten of
  overnemen**, bijvoorbeeld als het apparaat kapot of leeg is.
- **De PIN is een persoonlijke inlog.** Hij vervangt e-mail/wachtwoord zodra
  hij na één keer inloggen is ingesteld, en "heeft niks met de dienst te
  maken".
- **Tablet koppelen** (ADR 0011) kan waarschijnlijk weg.

## Besloten, in het kort

Uit de antwoorden (zie historie onderaan), in de vorm waarin ze hieronder
zijn uitgewerkt:

- **Fase 1 is stand (a), vast** (1). Elk apparaat kan een dienst starten, en
  daarna hoort de dienst bij die ene sessie. In fase 2 komt de instelling,
  met (a) als standaard (2).
- **Inloggen op de bar gebeurt vanaf de namenlijst** (5). Het startscherm
  toont alle bardienstleden. Tik op je naam en log in met je PIN (alleen als
  je op dit apparaat eerder met je wachtwoord inlogde en een PIN hebt) of met
  je wachtwoord (toggle). Zonder die voorgeschiedenis kan alleen het
  wachtwoord. Je typt geen e-mailadres, de server zoekt het op. Die login
  maakt de persoonlijke sessie aan. De openbare namenlijst is acceptabel.
- **De PIN-login zit in fase 1** (6), met lockout (B2) en een hogere
  kostenfactor (B1). Een PIN-login geeft geen toegang tot beheer (6); sinds
  ADR 0017 precies: zonder tweede factor nooit (K1). Het
  wachtwoord blijft altijd werken (4). De PIN werkt alleen op een apparaat
  waar dat lid eerder met het wachtwoord inlogde (3).
- **Waarden (24–27)**: lockout na 5 foute PIN's, per lid over alle apparaten,
  opgeheven door een geslaagde wachtwoordlogin (25); kostenfactor 12 met
  herhashen bij de volgende PIN-login (26); PIN-vertrouwen 30 dagen per lid
  per apparaat, alleen verlengd door een login van dat lid, ingetrokken door
  afmelden, archiveren of rol `lid` (27).
- **Wees-dienst heropenen** (24 (ii)): een bardienst uit de bezetting mag een
  wees-dienst na opnieuw inloggen hervatten; een dienst met een actieve
  koppeling elders blijft onaantastbaar (12d).
- **Een dienst starten vraagt geen tweede PIN.** Dat volgt uit 5: de login
  op de namenlijst is de authenticatie van de starter, en wie geen PIN heeft,
  moet ook kunnen starten. `start_shift` krijgt dus geen PIN meer mee, en de
  starter is het lid van de sessie.
- **Inactiviteit: 60 minuten, vaste waarde** (7, verhoogd bij 24), los van "dienst te lang
  open" (6 uur, `docs/features/dienst-te-lang-open.md`), dat ongewijzigd
  blijft.
- **De beheerdermelding staat in de app** (8), voor alle niet-gearchiveerde
  beheerders, alleen als een open dienst geen actieve sessie meer heeft, en
  opgelost zodra één beheerder overneemt of afsluit (9), of een bardienst uit
  de bezetting de dienst hervat (24 (ii)).
- **"Mijn account" bestaat niet in de bar-shell** (10), alleen in de portal.
  Op de bar vraag je een nieuw wachtwoord aan via de inlogpagina.
- **De modus wordt server-side afgedwongen in de beheer-RPC's, in fase 1**
  (11).
- **Beheerderingrepen** (12): afsluiten vanuit bar-modus en beheer, overnemen
  alleen vanuit bar-modus op het nieuwe apparaat; de overnemer komt in de
  bezetting; "apparaat afmelden" komt er; de starter mag zijn dienst niet
  zelf naar een ander eigen apparaat verhuizen.
- **Stand (b)**: aansluiten met een knop "Aansluiten", en wie aansluit komt
  in de bezetting (13). Elk gekoppeld apparaat mag afsluiten (14).
- **Stand (c)**: alleen een beheerder start een extra dienst naast een
  lopende, en een lid staat in hooguit één open bezetting (15).
- **A4 geldt in alle standen** (15, vierde ronde): `top_up` weigert een
  opwaardering naar het lid van de ingelogde sessie.
- **De stand wisselt alleen als er geen dienst open is** (16).
- **Uitloggen met een open dienst**: kiezen tussen afsluiten en open laten
  met een melding aan een beheerder (17).
- **`bar_session_id` komt nu op de boekingen**, een uitsplitsing per apparaat
  pas op verzoek (18).
- **Tablet koppelen verdwijnt in dezelfde uitrol**, en het device-account
  wordt bij de uitrol verwijderd (19). Voorwaarde (werkend wachtwoord voor
  elke bardienst en beheerder) is een uitrolstap: zie Zoals gebouwd → Uitrol.
- **"De bar draait nooit op een telefoon" is een supportuitspraak** (20), en
  dat komt in CLAUDE.md → Shells.
- **Rol gewijzigd of gearchiveerd: de sessie wordt meteen geweigerd** (21).
- **Geen apparaatnaam in fase 1** (22).
- **Teksten**: goedgekeurd door Bram (2026-09-29, 23), zie Teksten.

## Onderzocht

**Wireframe (`/designs/`).** Er is geen scherm voor sessie hervatten,
inactiviteit, een dienst op een ander apparaat, overnemen, of inloggen met
wachtwoord vanaf de namenlijst. Wel relevant:

- `designs/chats/chat18.md` noemt de drie varianten al als "licht / medium /
  zwaar". "Meerdere parallelle diensten" betekent daar "twee tablets, twee
  kasladen, twee aparte afsluitingen". Dat is Brams stand (c).
- `designs/chats/chat23.md`: "device is niet belangrijk (tenzij het telefoon
  is)".
- `designs/Lid App.dc.html` (regels 447 en 597) en `chat30.md`: "pincode
  (alleen op dit toestel)". Dat is het patroon dat Bram met vraag 3 voor de
  bar kiest.

Voor de nieuwe schermen staat hieronder een tekstvoorstel (vraag 23).

**Code** (stand vóór de bouw, 2026-09-29; veel hiervan bestaat niet meer).

- `src/middleware.ts` en `src/lib/tabletKoppeling.ts`: device sign-in alleen
  met een geldig `abas_tablet`-cookie (ADR 0011). Er is geen tabel met
  apparaten.
- `start_shift` (`0021`): een advisory lock, dan `shift_already_open`, dan
  `member_not_found`/`no_bar_role`/`invalid_pin` voor `p_member_id`. De
  aanroepende sessie speelt geen rol.
- `0023`: `place_order`, `top_up`, `reverse_order_at_bar`, `end_shift`,
  `add_shift_member` en `remove_shift_member` weigeren alleen een lid-sessie
  (`caller_is_lid()` → `no_bar_role`).
- **`no_bar_role` op de client (commit `9d19353`, #100)**: de zes hooks
  kennen `no_bar_role` als bekende domeinuitkomst, zonder
  `reportClientError`. Ze tonen één gedeelde tekst,
  `NO_BAR_ROLE_SESSION_MESSAGE` in `src/lib/staff.ts` ("dit account mag niet
  op de bar werken — log uit en log in als bardienst"), via
  `src/features/verkoop/messages.ts`, `opwaarderen/messages.ts`,
  `bestelling-terugdraaien/messages.ts`, `DienstAfsluitenOverlay.tsx` en
  `BezettingOverlay.tsx`. `start_shift` heeft een eigen `no_bar_role` met een
  andere betekenis (de rol van het gekozen lid) en een eigen tekst in
  `DienstStarten.tsx`. `test/moneyHooksFoutlogging.test.ts` bewaakt dat
  `no_bar_role` niet naar `client_errors` gaat. Zie RPC's → "Wat er gebeurt
  met `no_bar_role`".
- `useBarStaff` leest `members` met de sessie van de aanroeper en filtert op
  `has_pin = true`. Zonder sessie (het nieuwe startscherm) levert RLS niets
  op, en de namenlijst moet volgens 5 ook leden zonder PIN tonen. De hook
  wordt ook door `BezettingOverlay` gebruikt.
- `useOpenShift`: `shifts where ended_at is null order by started_at desc
  limit 1`, dus "de" open dienst, ongeacht de sessie.
- `ModusKeuze` ("Bar" is een `Link` naar `/`, plus "Mijn account" met
  `MijnAccountOverlay` en `useSetOwnPin`) en `Assortimentbeheer`: de modus is
  React-state. Er staat niets van in de database.
- De bar-schermen hebben geen uitlogknop. Die staat alleen in `BeheerTabs`
  ("Ingelogd als {naam} — uitloggen") en in de portal.
- De portal kan de bar-PIN al zetten (`usePortalSetOwnPin`, `set_own_pin`,
  `docs/features/portal-profiel.md`). Met 10 wordt dat de enige plek.
- `set_own_pin` (`0014`) hasht met `gen_salt('bf')`, cost 6.
- `useShiftLedger(shiftId)` en de afsluitsamenvatting werken al per
  `shift_id`. `useLogboek` is organisatiebreed.
- `pg_cron` staat aan sinds `0025` (`purge_client_errors`). Er is geen
  mailprovider: alleen de Auth-mails van Supabase.
- De inactiviteitstijd bestond niet in de code (zie de eerdere versie van
  deze spec en vraag 7). Bram koos eerst 30 minuten en heeft dat bij vraag 24 verhoogd naar 60 minuten.

**Kaders.** CLAUDE.md (Domein, Architectuurbeslissingen, Shells, Auth), ADR
0002, 0003, 0005, 0006, 0007, 0008, 0009, 0011, 0012 en 0013,
`docs/features/bar-rpc-autorisatie.md` (A2 gebouwd; A3, A4, B1–B3 worden
hier gerealiseerd) en `docs/ARCHITECTURE.md` → "Shared bar-tablet session
mechanism", "Device sign-in mechanism", "PIN storage/hashing", "Auth-methode
& modus" en "Dienst & bezetting".

## Begrippen

- **Apparaat**: één browserprofiel. Twee tabbladen in dezelfde browser zijn
  één apparaat. Dezelfde tablet in een tweede browser is een tweede
  apparaat. Iets preciezers kan een webapp niet weten zonder
  apparaat-sniffing, en die is verboden (`check:policy`).
- **Apparaatcookie**: `abas_apparaat`, een willekeurig token dat de server
  uitgeeft bij de eerste wachtwoordlogin via de namenlijst. Het overleeft
  uitloggen. Het is nodig voor vraag 3 ("alleen op dit apparaat") en voor
  niets anders. Het PIN-vertrouwen geldt per lid per apparaat: 30 dagen na
  de laatste login van dát lid op dat apparaat, en alleen een login van dat
  lid zelf verlengt het (besloten, 27; per lid: Bram, 2026-09-30).
- **Vertrouwd apparaat (voor een lid)**: een apparaat waarop dat lid via de
  namenlijst met het wachtwoord heeft ingelogd. Alleen daar kan dat lid met
  de PIN inloggen.
- **Sessie**: één Supabase-login in dat browserprofiel, herkenbaar aan het
  JWT-claim `session_id`. De sessie overleeft browser dicht en weer open en
  eindigt bij uitloggen, inactiviteit, afmelden door een beheerder of een
  rolwijziging.
- **Bar-sessie**: een sessie die geregistreerd is in `bar_sessions`, van een
  niet-gearchiveerd lid met rol `bardienst` of `beheerder`, in modus `bar`
  of `beheer`.
- **Koppeling**: een rij in `shift_sessions`. Deze sessie werkt in deze
  dienst.
- **Wees-dienst**: een open dienst zonder actieve koppeling.

## Doel

Bar-werk gebeurt in een persoonlijke sessie per apparaat, en de database
weet in welke sessie of sessies een dienst loopt. Elke bar-RPC dwingt dat af.
Inloggen gaat vanaf de namenlijst, met PIN op een vertrouwd apparaat of met
wachtwoord. De beheerderinstelling (a)/(b)/(c) wordt een set regels over
koppelingen in plaats van drie mechanismen. De gedeelde device-sessie
verdwijnt.

**Hoe dit binnen de twee kernbeslissingen past.**

- *Geld alleen via RPC*: er komt geen nieuw schrijfpad naar een geldtabel.
  De bestaande RPC's krijgen een strengere toegangsvoorwaarde en schrijven
  `bar_session_id` mee. Die waarde leest de RPC zelf uit de sessie, het is
  nooit een clientparameter. `top_up` krijgt A4 (niet naar het lid van de
  sessie). Bedrag, saldo, limiet en €500 veranderen niet. De nieuwe
  loginfuncties raken geen geldtabel.
- *Attributie via de bezetting, niet via een PIN*: `served_by` en
  `reversed_by` blijven gecontroleerd tegen de bezetting van de dienst,
  ongewijzigd. De PIN wordt een login, geen attributie. Nieuw is dat de
  sessie zelf een geïdentificeerd lid is: wie "ingelogd" is. Dat is
  nadrukkelijk niet "wie bediende" (zie Veiligheid → Hervatten).

## Betrokken shell

Alleen `shells/bar`, inclusief `/beheer`. De portal heeft een eigen cookie
(ADR 0009) en geen dienstbegrip. Portal-sessies worden niet geregistreerd. De
portal blijft de enige plek om de PIN te zetten (10). Alle nieuwe schermen
komen in `src/features/`, shell-onwetend. Hergebruik:

- `StaffPicker` (namenlijst), `StaffHeader`, `PinPad` en `ActiviteitKeuze`
  uit `src/features/dienst-starten/`;
- het wachtwoordveld en de "Wachtwoord vergeten"-flow uit `BeheerLogin` en
  `WachtwoordHerstellen` (hergebruik van de onderdelen, geen tweede kopie
  van het formulier; hoe precies is aan de Developer);
- `DienstAfsluitenOverlay` (ook voor afsluiten door een beheerder en voor
  de uitlogkeuze);
- `AuroraMerk` en de bestaande overlay- en toastpatronen.

## Het model

### Fase 1 en de drie standen

| | open diensten | actieve koppelingen per dienst | koppelingen per sessie |
|---|---|---|---|
| **(a)** 1 dienst, 1 apparaat | ≤ 1 | ≤ 1 | ≤ 1 |
| **(b)** 1 dienst, meerdere apparaten | ≤ 1 | ≥ 0 | ≤ 1 |
| **(c)** meerdere diensten | onbeperkt | ≤ 1 | ≤ 1 |

In alle standen werkt een sessie in hooguit één dienst tegelijk. Nul
koppelingen is de wees-dienst: die kan in elke stand ontstaan (inactiviteit,
uitloggen met "open laten", afmelden, rolwijziging) en levert de
beheerdermelding op.

**Fase 1: gedrag (a), vast, zonder instelling** (besloten, 1). Een dienst kan
gestart worden op elk apparaat waar een bardienst of beheerder is ingelogd.
Daarna hoort hij bij die ene sessie. Een ander apparaat ziet dat er een
dienst loopt, maar kan er niet in werken. Een beheerder kan de dienst vanaf
een ander apparaat afsluiten of overnemen.

### Waar "apparaat/sessie" in de database komt

De dienst hangt aan de **sessie**, in een eigen tabel `bar_sessions` met als
sleutel `auth.jwt()->>'session_id'`. Het apparaatcookie is **geen** sleutel
voor de dienst: het bestaat alleen om de PIN-login aan een apparaat te binden
(vraag 3). Waarom niet `auth.sessions` direct: zie ADR 0016 → Verworpen
alternatieven.

Het einde van een sessie wordt zo een database-feit. Een bar-RPC weigert
meteen, ook als het access token nog tot `jwt_expiry` geldig is.

## Datamodel

Alle nieuwe tabellen: RLS aan, schrijven `REVOKE`d voor `anon` en
`authenticated` (alleen via RPC of server-side met de service-role), en voor
elke policy een negatieve test (`check:rls`).

**`bar_sessions`** (nieuw)

| kolom | type | |
|---|---|---|
| `id` | uuid pk | |
| `auth_session_id` | uuid not null unique | uit het JWT, nooit een clientparameter |
| `member_id` | uuid not null → `members` | wie er ingelogd is |
| `mode` | text not null, `bar` \| `beheer` | ADR 0003, nu server-side |
| `device_id` | uuid null → `bar_devices` | gezet bij een login via de namenlijst, null bij `/beheer` |
| `started_at` | timestamptz not null default now() | |
| `last_activity_at` | timestamptz not null default now() | zie Inactiviteit |
| `ended_at` | timestamptz null | |
| `end_reason` | text null: `uitgelogd` \| `inactief` \| `afgemeld` \| `geen_bar_rol` \| `niet_hervat` \| `beheerder_geworden` (ADR 0017, 2026-10-01) | |
| `ended_by` | uuid null → `members` | alleen bij `afgemeld` |

Lezen: bardienst en beheerder (`not caller_is_lid()`). Een lid ziet niets.

**`shift_sessions`** (nieuw)

| kolom | type | |
|---|---|---|
| `shift_id` | uuid → `shifts` | |
| `bar_session_id` | uuid → `bar_sessions` | |
| `joined_at` | timestamptz not null default now() | |
| `left_at` | timestamptz null | |
| `left_reason` | text null: `dienst_afgesloten` \| `afgesloten_door_beheerder` \| `uitgelogd` \| `inactief` \| `overgenomen` \| `afgemeld` \| `geen_bar_rol` \| `beheerder_geworden` (ADR 0017) | |

- pk `(shift_id, bar_session_id)`
- partiële unique index op `bar_session_id where left_at is null`: een sessie
  werkt in hooguit één dienst, in elke stand.
- Lezen: als `bar_sessions`.

**`bar_devices`** (nieuw, voor de PIN-login)

| kolom | type | |
|---|---|---|
| `id` | uuid pk | |
| `token_hash` | text not null unique | SHA-256 van het cookie-token; het token zelf staat nergens |
| `created_at` | timestamptz not null default now() | |
| `last_seen_at` | timestamptz not null default now() | laatste login op dit apparaat, van wie ook; alleen informatief (0033) |
| `revoked_at` | timestamptz null | gezet door `admin_end_bar_session` (afmelden, vraag 27) |

**`bar_device_members`** (nieuw): welk lid op welk apparaat met de PIN mag
inloggen.

| kolom | type | |
|---|---|---|
| `device_id` | uuid → `bar_devices` | |
| `member_id` | uuid → `members` | |
| `password_login_at` | timestamptz not null | laatste wachtwoordlogin via de namenlijst op dit apparaat |
| `last_login_at` | timestamptz not null default now() | laatste login (wachtwoord of PIN) van dit lid op dit apparaat; het PIN-vertrouwen verloopt 30 dagen daarna (0033, vraag 27) |
| `revoked_at` | timestamptz null | gezet bij archiveren, rol `lid` of promotie naar beheerder (vraag 27, ADR 0017) |

pk `(device_id, member_id)`.

**`pin_failures`** (nieuw, lockout B2): `member_id` pk → `members`,
`failed_count int not null`, `last_failed_at timestamptz`, `locked_at
timestamptz null`. De lockout geldt per lid, over alle apparaten: na 5 foute
pogingen, en een geslaagde wachtwoordlogin heft hem op (vraag 25).

`bar_devices`, `bar_device_members` en `pin_failures` hebben **geen**
leespolicy voor `anon` of `authenticated`. Alleen de server-side loginflow
(service-role) leest en schrijft ze. Negatieve tests: `authenticated` en
`anon` zien niets en kunnen niets schrijven.

**`members.pin_hash`**: vanaf fase 1 met kostenfactor 12 (B1, vraag 26).
Bestaande hashes worden bij de eerstvolgende geslaagde PIN-login opnieuw
gehasht, want dan kent de server de PIN (vraag 26).

**`shifts`**: nieuwe kolom `started_session_id uuid null → bar_sessions`.
Null voor diensten van vóór de migratie.

**`orders`, `top_ups`, `order_reversals`**: nieuwe kolom `bar_session_id uuid
null → bar_sessions` (besloten, 18). De RPC vult die uit de aanroepende
sessie. Bij `reverse_order_as_admin` blijft hij null.

**`admin_notifications`** (nieuw, besloten 8 en 9)

| kolom | type | |
|---|---|---|
| `id` | uuid pk | |
| `kind` | text: `dienst_zonder_sessie` | |
| `reason` | text: `inactief` \| `uitgelogd` \| `afgemeld` \| `geen_bar_rol` \| `beheerder_geworden` (ADR 0017) | waarom de laatste koppeling wegviel, voor de tekst |
| `shift_id` | uuid → `shifts` | |
| `bar_session_id` | uuid null → `bar_sessions` | de sessie die wegviel |
| `created_at` | timestamptz not null default now() | |
| `resolved_at` | timestamptz null | |
| `resolved_by` | uuid null → `members` | |

Lezen alleen door een beheerder. Geen vrij tekstveld (zelfde afweging als
`client_errors`, ADR 0015). Er komt één melding per wees-moment; een
volgende koppeling (overname) lost haar op.

**`app_settings`** (fase 2): `shift_session_mode text not null default
'een_apparaat'` (`een_apparaat` \| `meerdere_apparaten` \|
`meerdere_diensten`; standaard (a), besloten 2). De inactiviteitstijd is geen
instelling maar een vaste waarde van 60 minuten (besloten, 7): een constante
in de guard, met een UX-spiegel in de client (zelfde verdeling als
`TOP_UP_MAX_CENTS`).

## Inloggen op de bar (fase 1)

Alle vijf de acties hieronder zijn **server-only entrypoints** (Server Action
of Route Handler, keuze aan de Developer) volgens ADR 0006: de
service-role-client uit `src/lib/supabase/admin.ts`, nooit vanuit
client-code. Nieuw ten opzichte van ADR 0006: de aanroeper heeft nog geen
sessie, dus de databasekant loopt via functies die alleen voor `service_role`
uitvoerbaar zijn (niet voor `anon`/`authenticated`). Zie ADR 0016 →
Beslissing 6.

1. **Namenlijst.** Geeft `id` en `name` van alle niet-gearchiveerde
   leden met rol `bardienst` of `beheerder`, gesorteerd op naam. Sinds ADR
   0017 zonder `role` en zonder rolbadge (`login-rate-limit.md` → Namenlijst
   zonder rol). **Geen**
   filter op `has_pin` (5: alle bardienstleden). Geen e-mail, geen
   `has_pin`, geen saldo. Dit vervangt `useBarStaff` op het startscherm;
   `BezettingOverlay` blijft `useBarStaff` met de sessie gebruiken.
2. **Inlogopties voor een naam.** Leest het apparaatcookie en geeft terug of
   PIN mogelijk is: het apparaat is vertrouwd voor dit lid, niet
   ingetrokken, het lid heeft een PIN, en de PIN is niet geblokkeerd. Anders
   alleen wachtwoord, met een aparte vlag als de PIN geblokkeerd is (voor de
   tekst). Zonder apparaatcookie is het antwoord altijd "alleen wachtwoord",
   dus iemand buiten een vertrouwd apparaat leert niet of een lid een PIN
   heeft.
3. **Inloggen met wachtwoord** (`member_id`, wachtwoord):
   - controleert dat het lid niet gearchiveerd is, een bar-rol heeft en een
     gekoppeld account (`auth_user_id`); anders `not_allowed` of
     `no_account`;
   - zoekt het e-mailadres op (service-role) en logt server-side in met
     `signInWithPassword`, zodat de sessie in de cookies landt
     (`@supabase/ssr`);
   - registreert de sessie meteen als bar-sessie in modus `bar` (zie RPC's →
     `register_bar_session_server`), vóór de browser de tokens krijgt;
   - geeft zo nodig een nieuw apparaatcookie uit (`HttpOnly`, `Secure`,
     `SameSite=Strict`, `Path=/`, 256 bit willekeurig, levensduur 30 dagen,
     vraag 27)
     en zet of ververst `bar_device_members` voor dit lid;
   - foutcodes: `invalid_credentials`, `not_allowed`, `no_account`,
     `rate_limited`, `unknown`.
4. **Inloggen met PIN** (`member_id`, PIN):
   - roept `verify_bar_pin` aan (hieronder), met de hash van het
     apparaatcookie;
   - bij succes maakt de server een sessie voor het account van het lid
     zonder wachtwoord: `auth.admin.generateLink({ type: 'magiclink' })`
     (verstuurt geen mail) en direct daarna `verifyOtp({ token_hash })` met
     de server-client (ADR 0008-patroon). Daarna registreren zoals bij 3;
   - foutcodes: `pin_not_available` (apparaat niet vertrouwd, geen PIN of
     ingetrokken), `invalid_pin` (met het aantal resterende pogingen),
     `pin_locked`, `pin_needs_mfa` (beheerder zonder tweede factor, ADR
     0017), `rate_limited` (`login-rate-limit.md`), `not_allowed`,
     `no_account`, `unknown`.
5. **Wachtwoord vergeten** (`member_id`): zoekt het e-mailadres op en start
   de bestaande herstelflow (`docs/features/wachtwoord-vergeten.md`, ADR
   0008) naar dat adres. Het antwoord is altijd neutraal (ADR 0013), ook als
   het lid geen account heeft.

**Een PIN-login geeft geen beheer** (6). Dat volgt vanzelf: de
PIN-login registreert de sessie in modus `bar`, en een sessie wisselt nooit
van modus (`mode_locked`, ADR 0003 Beslissing 2). Beheer blijft via `/beheer`
met e-mail (wachtwoord of magic link, zoals nu), en eist sinds ADR 0017 ook
een tweede factor (aal2). Dat laatste is nodig, want een PIN-sessie kan het
wachtwoord van het account wijzigen (`beheer-tweede-factor.md`). Precies:
een PIN-login geeft **zonder tweede factor** nooit beheer; met PIN,
vertrouwd apparaat én factor kan het wel (K1, geaccepteerd 2026-10-01).

**`/beheer` blijft zoals het is, op twee punten na:**

- "Mijn account" verdwijnt uit `ModusKeuze` (10). `MijnAccountOverlay` en
  `useSetOwnPin` hebben dan geen gebruiker meer en gaan weg; de PIN zet je in
  de portal.
- De keuze "Bar" of "Beheer" roept `register_bar_session(p_mode)` aan. Een
  e-maillogin op `/beheer` maakt het apparaat **niet** vertrouwd voor de PIN:
  die login loopt in de browser rechtstreeks naar Supabase, dus de server kan
  daar geen `HttpOnly`-cookie zetten. "Eerder met je wachtwoord ingelogd op
  dit apparaat" betekent in deze spec dus: via de namenlijst.

## RPC's

### Guards (intern, geen `EXECUTE` voor API-rollen)

- **`require_bar_session() returns bar_sessions`**. Zoekt de rij bij
  `auth.jwt()->>'session_id'` en weigert met:
  - `no_bar_session` als er geen rij is of het claim ontbreekt. Dit geldt ook
    voor een lid-sessie, een portal-sessie en het device-account;
  - `session_ended` als `ended_at` gezet is;
  - `session_inactive` als `now() - last_activity_at` groter is dan 60
    minuten (vraag 24: 60, niet 30; gebouwd als `bar_inactivity_limit()`);
  - `wrong_mode` als `mode` niet `bar` is;
  - `no_bar_role` als het lid gearchiveerd is of geen rol `bardienst` of
    `beheerder` meer heeft. De rol wordt bij elke aanroep opnieuw gelezen
    (besloten, 21).

  Bij succes zet de guard `last_activity_at = now()`. Die schrijfactie blijft
  alleen staan als de hele RPC slaagt. Een mislukte aanroep telt dus niet als
  activiteit.
- **`require_shift_session(p_shift_id) returns bar_sessions`**: eerst
  `require_bar_session()`, dan een actieve koppeling met `p_shift_id`, anders
  `session_not_on_shift`.
- **`require_beheer_session() returns bar_sessions`** (besloten, 11): zelfde
  controles, maar `mode = 'beheer'` en rol `beheerder`, anders `wrong_mode`
  of `no_admin_role`. Komt vóór de bestaande ADR 0002-actorcheck in elke
  beheer-RPC: assortiment, activiteittypes, negatieflimiet, ledenbeheer
  (inclusief `list_members_admin` en de invite-route),
  `reverse_order_as_admin`. De actorcheck zelf blijft.

Alle guards staan vóór alle andere checks, zodat een buitenstaander niets
leert over diensten.

### Wat er gebeurt met `caller_is_lid()`

In de bar-RPC's wordt de guard vervangen door de allowlist hierboven. Een lid
kan zich niet als bar-sessie registreren (rolcheck), dus A2 blijft
inhoudelijk gedekt. De functie zelf blijft bestaan: de RLS-leespolicies uit
`0015` gebruiken haar, en die veranderen niet. Hiermee zijn A3 en B3 uit
`bar-rpc-autorisatie.md` gerealiseerd zonder `device_accounts`.

### Wat er gebeurt met `no_bar_role` (commit `9d19353`)

- **Op de server** blijft de code `no_bar_role` bestaan, maar de betekenis
  verschuift. Vandaag: "deze sessie is van een lid". Straks: "het lid van
  deze geregistreerde bar-sessie is gearchiveerd of heeft geen bar-rol
  meer". Een lid-sessie krijgt voortaan `no_bar_session`, omdat een lid geen
  bar-sessie kan registreren. De naam blijft, zodat de bestaande
  client-afhandeling niet hernoemd hoeft te worden.
- **In de zes hooks** (`usePlaceOrder`, `useTopUp`, `useReverseOrder`,
  `useEndShift`, `useAddShiftMember`, `useRemoveShiftMember`) groeit de set
  bekende codes van één naar zes **sessiecodes**: `no_bar_session`,
  `session_ended`, `session_inactive`, `wrong_mode`, `no_bar_role`,
  `session_not_on_shift`. Ze blijven wat `no_bar_role` sinds #100 is: een
  bekende domeinuitkomst, zonder `reportClientError`.
  `test/moneyHooksFoutlogging.test.ts` breidt uit naar alle zes. ADR 0017
  voegde een zevende toe, `aal2_required` (`SESSION_ERROR_CODES` in
  `src/lib/barSessie.ts`).
- **Geen inline melding meer per scherm.** Vandaag toont elk scherm
  `NO_BAR_ROLE_SESSION_MESSAGE` als foutregel. Straks betekent elke
  sessiecode dat deze sessie niet (meer) in deze dienst kan werken. Eén
  centrale afhandeling toont dan de melding bij een gesloten sessie
  (Schermflow punt 6, teksten in de sectie Teksten) en zet het scherm in de
  juiste toestand (uitgelogd, of "geen eigen dienst"). De `no_bar_role`-cases
  in `verkoop/messages.ts`, `opwaarderen/messages.ts`,
  `bestelling-terugdraaien/messages.ts`, `DienstAfsluitenOverlay.tsx` en
  `BezettingOverlay.tsx` gaan naar die centrale afhandeling.
- **`NO_BAR_ROLE_SESSION_MESSAGE`** verdwijnt uit `src/lib/staff.ts`. De tekst
  klopt niet meer: "log uit en log in als bardienst" doet de app nu zelf,
  en een lid komt er niet meer. Hij wordt vervangen door de sessieteksten uit
  de sectie Teksten. Waar die constanten komen, is aan de Developer.
- **`start_shift`** verliest `invalid_pin`, `member_not_found` en zijn eigen
  `no_bar_role`: de PIN zit in de login, de starter is het lid van de sessie,
  en de guard dekt de rol. `useStartShift` krijgt de sessiecodes plus
  `shift_already_open` en de drie `activity_type_*`-codes. De
  `barStaff.refetch()` in `DienstStarten.tsx` bij `no_bar_role`/
  `member_not_found` verhuist naar de login: bij `not_allowed` ververst het
  startscherm de namenlijst.
- **Niet geraakt**: de `no_bar_role` van `set_own_pin` (portal,
  `src/lib/ownPinErrors.ts`) en de beheercodes `actor_not_found`/
  `no_admin_role` in `useBeheerSession`. De beheer-hooks krijgen er wel de
  sessiecodes van `require_beheer_session()` bij, met dezelfde centrale
  afhandeling.

### Bestaande RPC's

| RPC | vandaag | wordt |
|---|---|---|
| `start_shift` | `(p_member_id, p_pin, p_activity_type_id)`, lock, `shift_already_open`, PIN van `p_member_id` | `(p_activity_type_id)`. `require_bar_session()`, geen PIN (zie Besloten). Starter is het lid van de sessie. Lock zoals in `0021`. (a)/(b): `shift_already_open` als er ergens een open dienst is. `session_has_shift` als deze sessie al gekoppeld is. Schrijft `shifts.started_session_id`, de starter in `shift_members` (zoals nu) en een koppeling. Nieuwe signatuur, dus drop + create in een nieuwe migratie, en `EXECUTE` opnieuw intrekken voor `PUBLIC`/`anon` (`0018`). |
| `place_order` | `caller_is_lid()`, dan `shift_not_open` | `require_shift_session(p_shift_id)` in plaats van `caller_is_lid()`. Rest ongewijzigd. Schrijft `bar_session_id`. |
| `top_up` | idem | idem, plus **A4** (besloten, alle standen): `p_member_id = sessie.member_id` → `self_top_up_forbidden`, direct na de guard. De €500 blijft. |
| `reverse_order_at_bar` | idem | idem. "Alleen die dienst" blijft staan. |
| `add_shift_member` | idem | `require_shift_session(p_shift_id)` |
| `remove_shift_member` | idem | `require_shift_session(p_shift_id)`. De sessiehouder zelf verwijderen: zie Randgevallen. |
| `end_shift` | `caller_is_lid()`, stille no-op bij een onbekende dienst | `require_shift_session(p_shift_id)`. Sluit ook alle koppelingen (`dienst_afgesloten`). Zonder koppeling is het een fout, geen stille no-op. |
| `reverse_order_as_admin` | ADR 0002-actorcheck | `require_beheer_session()` plus de actorcheck. `bar_session_id` blijft null. |
| `set_own_pin` | ADR 0002-actorcheck | Alleen nog vanuit de portal: weigert vanuit een geregistreerde bar-sessie (`wrong_mode`, 0032). Hasht met de nieuwe kostenfactor (B1). |
| `set_member_role`, `set_member_archived` | actorcheck | `require_beheer_session()`. Maakt het lid `lid` of gearchiveerd, dan eindigen diens actieve bar-sessies meteen (`geen_bar_rol`), met hun koppelingen, en bij een wees-dienst een melding. De guard weigert ook zonder deze stap al (21); dit zorgt dat de melding er meteen is. Maakt `set_member_role` het lid `beheerder` (en was het dat nog niet), dan eindigen diens actieve bar-sessies ook meteen, met `beheerder_geworden`, inclusief de Auth-sessies en het PIN-vertrouwen: zo wordt een lopende aal1-sessie geen beheerder-zonder-factor-sessie (ADR 0017, `beheer-tweede-factor.md` → `set_member_role`, besloten 2026-10-01). |

### Nieuwe RPC's en functies

Allemaal `security definer`. Uitvoerbaar voor `authenticated`, tenzij anders
vermeld. Elke nieuwe functie trekt `EXECUTE` in voor `PUBLIC`/`anon`
(`0018`); `rpc_execute_grants.test.sql` moet een lijst krijgen van de
functies die bewust alleen voor `service_role` of `pg_cron` zijn.

- **`verify_bar_pin(p_device_token_hash, p_member_id, p_pin)`**: alleen
  `service_role`. In één transactie:
  - lid niet gearchiveerd, bar-rol, `auth_user_id` gezet, anders
    `not_allowed`/`no_account`;
  - apparaat bestaat, niet ingetrokken, en `bar_device_members` heeft een
    niet-ingetrokken rij voor dit lid, anders `pin_not_available`;
  - `pin_hash` gezet, anders `pin_not_available`;
  - niet geblokkeerd (`pin_failures.locked_at`), anders `pin_locked`;
  - `crypt(p_pin, pin_hash) = pin_hash`. Fout: teller op, bij 5 fouten
    `locked_at` zetten (vraag 25), `invalid_pin` met resterende pogingen.
    Goed: teller naar 0, en herhashen met kostenfactor 12 als de bestaande
    lager is (vraag 26). Gebouwd als rij-uitkomst, niet als fout: zie Zoals
    gebouwd.

  Geeft bij succes het `auth_user_id` terug. Alle andere antwoorden zijn
  foutcodes zonder verdere informatie.
- **`register_bar_session_server(p_auth_session_id, p_member_id,
  p_device_id)`**: alleen `service_role`. Door de namenlijstlogin, direct na
  het aanmaken van de sessie. Altijd modus `bar`.
- **`register_bar_session(p_mode text) returns bar_sessions`**: door
  `ModusKeuze` op `/beheer` na een e-maillogin. Controles:
  - het claim `session_id` bestaat;
  - `auth.uid()` hoort bij een niet-gearchiveerd lid met rol `bardienst` of
    `beheerder` (modus `beheer`: alleen `beheerder`);
  - bestaat er al een actieve rij met dezelfde modus, dan wordt die
    teruggegeven;
  - met een andere modus: `mode_locked` (ADR 0003: modus wisselen =
    uitloggen). Zo komt een PIN-sessie nooit in beheer;
  - is er een beëindigde rij voor deze `session_id`: `session_ended`. Anders
    kan een inactief gesloten sessie zich meteen opnieuw registreren.
- **`touch_bar_session() returns bar_sessions`**: de hartslag, zie
  Inactiviteit. Werkt in beide modi.
- **`end_bar_session(p_close_shift boolean)`**: uitloggen (besloten, 17).
  Heeft de sessie een open dienst: `p_close_shift = true` sluit de dienst
  zoals `end_shift`; `false` laat hem open, sluit de koppeling (`uitgelogd`)
  en maakt bij een wees-dienst een melding. Daarna `ended_at`, `uitgelogd`.
  Daarna roept de client `signOut({ scope: "local" })` aan.
- **`my_bar_state()`**: de leesbron voor de opvolger van `useOpenShift`. Een
  RPC en geen `select`, omdat "welke sessie ben ik" alleen server-side
  bekend is. Schrijft niet (geen hartslag). Geeft:
  - de eigen bar-sessie (of geen), met modus en of ze actief, beëindigd of
    inactief is, en de reden;
  - de dienst van deze sessie (of geen), of de reden waarom de laatste
    koppeling eindigde (`overgenomen`, `afgesloten_door_beheerder`), voor de
    melding;
  - in (a)/(b): de open dienst elders, met starter, activiteittype,
    begintijd, en per actieve koppeling de naam van de ingelogde en de
    laatste activiteit; of dat het een wees-dienst is;
  - in (c): de lijst van open diensten elders;
  - voor een beheerder: de openstaande meldingen.
- **`admin_end_shift(p_shift_id)`** (besloten, 12a): actorcheck
  (beheerder) plus `require_bar_session()` in modus `bar` óf
  `require_beheer_session()`. Zet `ended_at`, sluit alle koppelingen
  (`afgesloten_door_beheerder`) en lost de meldingen voor deze dienst op.
- **`admin_take_over_shift(p_shift_id)`** (besloten, 12a en 12b):
  actorcheck (beheerder) plus `require_bar_session()` in modus `bar`, en de
  eigen sessie heeft nog geen koppeling (`session_has_shift`). De bestaande
  koppeling krijgt `overgenomen`, de beheerder krijgt een nieuwe koppeling en
  komt in `shift_members`. Meldingen worden opgelost. `shifts.started_by`
  blijft wie hem startte.
- **`admin_end_bar_session(p_bar_session_id)`** (besloten, 12c): actorcheck
  (beheerder), vanuit beide modi. Zet `afgemeld` en `ended_by`, sluit de
  koppeling (`afgemeld`) en maakt bij een wees-dienst een melding. Trekt ook
  het PIN-vertrouwen van dat apparaat in (vraag 27) en de Auth-sessie (ADR
  0017).
- **`close_inactive_bar_sessions()`**: alleen `pg_cron`, geen `EXECUTE` voor
  enige API-rol (patroon `purge_client_errors`, `0025`). Elke minuut. Zet
  `inactief` op sessies die langer dan 60 minuten stil zijn, sluit hun
  koppelingen en maakt een melding voor elke dienst die daardoor wees wordt.
  De guard hangt niet van deze job af: valt `pg_cron` uit, dan weigeren de
  RPC's nog steeds, alleen de melding komt later.
- **`resume_orphan_shift(p_shift_id) returns shifts`** (`0030`, besloten,
  vraag 24 (ii)): `require_bar_session()`, en dan in deze volgorde:
  `session_has_shift` (de sessie werkt al in een dienst), `shift_not_open`
  (dicht of onbekend), `not_in_shift_crew` (de aanroeper staat niet in
  `shift_members` van die dienst), `shift_not_orphan` (de dienst heeft een
  actieve koppeling). Zo leert wie niet in de bezetting staat niets over de
  koppelingen. Bij succes een nieuwe koppeling voor de sessie (een eerdere,
  gesloten rij van dezelfde sessie en dienst wordt heropend) en de openstaande
  meldingen voor de dienst zijn opgelost (`resolved_by` is het lid dat
  hervatte). Zelfde advisory lock als `start_shift`. De bezetting en
  `served_by` veranderen niet. Alleen `authenticated`.
- **`join_shift(p_shift_id)`** (fase 2, stand (b), besloten 13):
  `require_bar_session()` zonder bestaande koppeling, een open dienst, en de
  aansluiter komt in `shift_members`.
- **`set_shift_session_mode(p_mode)`** (fase 2): `require_beheer_session()`
  plus actorcheck; weigert met `shift_open` als er een dienst open is
  (besloten, 16).

**Eén regel voor meldingen.** Een melding ontstaat altijd als een open dienst
zijn laatste actieve koppeling verliest, ongeacht de oorzaak: inactiviteit,
uitloggen met "open laten", afmelden, rolwijziging. Dat is antwoord 9, niet
een extra regel. Ze wordt opgelost door `admin_take_over_shift`,
`admin_end_shift` of `resume_orphan_shift`, of doordat de dienst op een andere
manier sluit.

### Wat er gebeurt met `0021` en "de" open dienst

- `0021` blijft als migratie staan (historie). Een nieuwe migratie vervangt
  `start_shift`. De regel "hooguit één open dienst" blijft in (a) en (b); in
  (c) vervalt hij. Het advisory lock blijft in alle standen.
- **`useOpenShift` wordt vervangen** door een hook op `my_bar_state()`, met
  de werktitel `useMijnDienst`. Het type `OpenShift` en `DienstTabs`,
  `DienstActief`, `VerkoopScherm` en `DienstAfsluitenOverlay` kunnen blijven:
  die krijgen al een `shift` als prop.
- `DienstStarten` beslist niet meer op "er is ergens een open dienst", maar
  op de toestand uit `my_bar_state()` (zie Schermflow).
- `useShiftLedger(shiftId)` en de afsluitsamenvatting veranderen niet. In (c)
  staan boekingen van parallelle diensten door elkaar in `useLogboek`. Een
  dienstkolom daar valt buiten scope.

## Schermflow (bar-shell)

De teksten staan in de sectie Teksten. Hieronder de toestanden.

1. **Geen sessie: het startscherm.** De namenlijst (`StaffPicker`, alle
   bardienstleden, via de server-side namenlijst). Daaronder de bestaande
   link naar `/beheer`. Er loopt mogelijk een dienst, maar dat is zonder
   sessie niet zichtbaar: zonder login is er geen bar-data.
2. **Tik op een naam: het inlogscherm.** `StaffHeader` met de naam en "←
   andere naam". De app vraagt de inlogopties op.
   - PIN mogelijk: `PinPad`, met daaronder de toggle naar wachtwoord. Na vier
     cijfers logt de app in.
   - Anders: het wachtwoordveld, met "Inloggen" en "Wachtwoord vergeten?". Is
     de PIN mogelijk, dan staat er een toggle terug naar de PIN.
   - PIN geblokkeerd: het wachtwoordveld, met de lockoutmelding.
   - Na een geslaagde login: punt 4 of 5.
3. **Hervatten na browser dicht en weer open.** Er is een sessie, maar in
   deze browserstart is die nog niet bevestigd (het sessiecookie
   `abas_bar_bevestigd` met het `session_id` ontbreekt; het geldt voor alle
   tabbladen, zie `beheer-tweede-factor.md` → B). De app leest eerst alleen de toestand (`my_bar_state()`, geen
   hartslag):
   - actieve sessie in modus `bar`: het hervatscherm, met "Verder" en
     "Uitloggen". Iedereen mag bevestigen (Bram). Pas na "Verder" volgt de
     hartslag;
   - actieve sessie die niet te hervatten is (`resumable = false`: modus
     `beheer`, of de bar-sessie van een beheerder zonder tweede factor):
     geen hervatscherm. Hervatten geeft alleen bar-werk (10) en een sessie
     wisselt niet van modus, dus de app sluit de sessie (`niet_hervat`) en
     toont de login;
   - inactief of beëindigd: de melding (punt 6), daarna het startscherm.
4. **Bar-sessie, geen eigen dienst.** Bovenaan "Ingelogd als {naam}" en
   "Uitloggen".
   - Er is geen open dienst: `ActiviteitKeuze`, dan `start_shift`. De
     activiteitkeuze komt nu na de login, niet ertussen.
   - (a) Er loopt een dienst op een ander apparaat: starter, activiteit,
     begintijd, wie daar ingelogd is en de laatste activiteit. Een bardienst
     kan hier niets doen. Een beheerder ziet "Overnemen" en "Afsluiten".
   - (a) Er is een wees-dienst: zelfde scherm, met "er is geen apparaat meer
     ingelogd in deze dienst". Een bardienst die in de bezetting
     van die dienst staat, ziet "Dienst hervatten" (besloten, vraag 24 (ii);
     gebouwd alleen voor rol bardienst, zie Zoals gebouwd):
     dat koppelt deze sessie aan de dienst en lost de melding op. Een
     bardienst buiten de bezetting kan niets; een beheerder houdt "Overnemen" en
     "Afsluiten". Een dienst met een actieve koppeling elders blijft
     onaantastbaar (12d).
   - (b) (fase 2): "Aansluiten".
   - (c) (fase 2): "Nieuwe dienst starten" (alleen een beheerder als er al
     een dienst loopt, besloten 15) en de lijst van diensten elders.
5. **Bar-sessie met eigen dienst**: `DienstTabs`, zoals nu, plus "Ingelogd
   als {naam}" en "Uitloggen". Uitloggen met een open dienst geeft de keuze
   uit 17. Een beheerder ziet hier ook de meldingen.
6. **Sessie of dienst weg.** De volgende RPC, hartslag of verversing geeft
   een sessiecode of een andere toestand in `my_bar_state()`. De app toont
   de melding met de reden:
   - inactief, afgemeld, rol gewijzigd, of geen bar-sessie meer: de app logt
     lokaal uit en toont daarna het startscherm;
   - dienst overgenomen of door een beheerder afgesloten: de sessie blijft
     ingelogd, de app toont daarna punt 4;
   - een half ingevuld mandje gaat verloren. Dat staat in de melding.
7. **Na afsluiten** van de eigen dienst blijft de sessie ingelogd en toont
   de app punt 4 (goedgekeurd met de teksten, 2026-09-29). De sessie sluit
   daarna zelf na 60 minuten, of met "Uitloggen".

**Beheer (`/beheer`)** krijgt, in modus `beheer`:

- een overzicht van de open dienst of diensten, met hun koppelingen en de
  laatste activiteit, en van de actieve bar-sessies;
- "Afsluiten" (hergebruikt `DienstAfsluitenOverlay`, met dezelfde
  samenvatting) en "Afmelden" per sessie;
- de meldingen.

Overnemen gebeurt in bar-modus, want het vraagt een bar-sessie op het nieuwe
apparaat (12a).

## Inactiviteit en de beheerdermelding

- **Tijd**: 60 minuten, vast (besloten, 7). Geldt voor bar- en
  beheersessies.
- **Wat telt als activiteit**: elke geslaagde bar- of beheer-RPC, en een
  hartslag `touch_bar_session()` bij een tik of toets op een bar- of
  beheerscherm, hooguit één keer per minuut. Een scherm dat alleen openstaat,
  telt niet. Een tik op "Nog bezig" in de 6-uursmelding telt dus ook.
- **Waar het wordt afgedwongen**: in de guard, met servertijd. De
  client-timer is alleen UX: de melding verschijnt ook als niemand iets
  aanraakt.
- **De melding voor beheerders**: `admin_notifications`, zie de regel onder
  RPC's. Zichtbaar in `/beheer` en voor beheerders in bar-modus (punt 4 en
  5). Er komt geen e-mail (8).
- **Oplossen**: overnemen, afsluiten of hervatten (24 (ii)). Die RPC's
  markeren de melding als opgelost.
- **Gevolg**: een bar die 60 minuten niets aanslaat, heeft daarna een
  wees-dienst. Een beheerder kan hem overnemen of sluiten, en een bardienst
  uit de bezetting kan hem na opnieuw inloggen hervatten (vraag 24 (ii),
  `resume_orphan_shift`).

## Beheerder: afsluiten, overnemen, afmelden

- **Afsluiten**: `admin_end_shift`. De dienst sluit voor alle koppelingen.
  Het oude apparaat toont bij de volgende verversing de melding en daarna
  punt 4. Omzet en samenvatting horen bij de dienst, er gaat niets verloren.
- **Overnemen**: `admin_take_over_shift`. De nieuwe koppeling vervangt de
  oude. De sessie op het oude apparaat blijft ingelogd, maar kan niet meer in
  de dienst werken. De beheerder komt in de bezetting (12b).
- **Afmelden**: `admin_end_bar_session`. De sessie op dat apparaat stopt
  meteen. Voor een verloren of gestolen tablet.
- De starter kan zijn dienst niet zelf naar een ander eigen apparaat
  verhuizen (12d).
- De ADR 0002-regel "beheeracties nooit op de gedeelde sessie" blijft
  inhoudelijk staan, en is nu server-side waar: beheer-RPC's eisen een
  sessie in modus `beheer`.

## Omzet per dienst, afsluiten en kasopmaak

- **(a) en (b)**: één dienst, één omzet, één afsluiting.
  `DienstAfsluitenOverlay`, ongewijzigd. In (b) is "Opgewaardeerd (contant)"
  één totaal voor alle kasladen samen; een uitsplitsing per apparaat via
  `bar_session_id` komt pas op verzoek (18).
- **(c)**: elke dienst heeft een eigen omzet, activiteit, bezetting en
  afsluiting. De queries per `shift_id` kloppen al. `place_order` zet `for
  update` op de ledenrij, dus gelijktijdig afrekenen bij twee diensten is
  veilig.
- **Overname**: de omzet blijft op de dienst. Via `bar_session_id` is het
  deel voor en na de overname terug te vinden.
- **Kasopmaak**: bestaat niet als functie en komt er niet bij.

## Veiligheid

- **De URL is publiek.** Zonder sessie toont de bar alleen de namenlijst en
  het inlogscherm. Alle bar-data en bar-RPC's vragen een persoonlijke login
  van een bardienst of beheerder. De namenlijst (alleen namen, sinds ADR
  0017 zonder rol) is openbaar; Bram vindt dat acceptabel (5).
- **Wachtwoordpogingen via de namenlijst.** De server doet de
  wachtwoordlogin, dus Supabase ziet het IP-adres van de server, niet dat van
  de gebruiker. Daarom een eigen limiet per IP en per lid vóór Supabase:
  [`login-rate-limit.md`](login-rate-limit.md) (ADR 0017).
- **De PIN-login.** Vier cijfers blijven zwak. Drie lagen samen maken het
  verdedigbaar:
  - alleen op een vertrouwd apparaat (3). Buiten zo'n apparaat is er geen
    PIN-poging mogelijk, dus ook geen lockout van buitenaf;
  - een lockout per lid na 5 foute pogingen (B2, vraag 25);
  - kostenfactor 12 (B1, vraag 26), tegen een uitgelekte hash.

  Daarbovenop een limiet per IP op foute PIN-pogingen (`pin_ip`,
  `login-rate-limit.md`).

  Het apparaatcookie is `HttpOnly`, dus scripts kunnen het niet lezen.
  Wie het cookie kopieert, heeft nog steeds de PIN nodig.
- **Een PIN-sessie komt niet in beheer.** De sessie wordt bij aanmaken als
  `bar` geregistreerd, en `register_bar_session('beheer')` geeft dan
  `mode_locked`. Beheer-RPC's eisen modus `beheer` (11). Het **account**
  komt zonder tweede factor niet in beheer via een wachtwoordwijziging
  vanuit een PIN-sessie: beheer eist aal2, en met een factor weigert
  Supabase Auth een wachtwoordwijziging vanuit een aal1-sessie (ADR 0017).
  Wie naast PIN en vertrouwd apparaat ook de factor heeft, kan in de
  PIN-sessie aal2 halen en dan het wachtwoord wijzigen: restrisico K1,
  geaccepteerd door Bram (2026-10-01).
- **De anon-key is publiek.** Elke nieuwe functie trekt `EXECUTE` in voor
  `PUBLIC`/`anon`. De guards, `verify_bar_pin`,
  `register_bar_session_server` en `close_inactive_bar_sessions` krijgen geen
  `EXECUTE` voor `anon` of `authenticated`. `register_bar_session` is met
  elke JWT aanroepbaar, maar alleen voor het eigen lid met een bar-rol. Een
  bardienst die het vanuit een portal-sessie aanroept, logt in feite in op
  de bar: dezelfde persoon met dezelfde rechten.
- **"De bar-shell draait nooit op een telefoon" is een supportuitspraak**
  (besloten, 20). Elke bardienst kan de bar op elk apparaat openen. In (a)
  en (b) begrenst de koppelregel wat dat oplevert. A4 voorkomt dat iemand
  zichzelf opwaardeert, in alle standen.
- **Hervatten zonder bewijs.** "Iedereen mag bevestigen" betekent dat wie
  het apparaat vasthoudt, werkt onder de sessie van wie er ingelogd is.
  Gevolgen:
  - `bar_sessions.member_id` betekent "ingelogd als", nooit "deed dit";
  - na hervatten is er alleen bar-werk. "Mijn account" bestaat niet op de bar
    (10), en een beheersessie wordt niet hervat;
  - A4 kijkt naar het lid van de sessie. Wie andermans sessie hervat, kan
    zichzelf dus wel opwaarderen. Dat is hetzelfde restrisico als
    `served_by`: de sessie zegt wie ingelogd is, niet wie er staat.
- **Wachtwoord vergeten zonder e-mailadres.** Iedereen bij de publieke URL kan
  voor een naam uit de lijst een herstelmail laten sturen. De mail gaat naar
  het eigen adres van dat lid, dus alleen dat lid kan er iets mee. De rate
  limit van Supabase per adres blijft gelden. Het antwoord is altijd
  neutraal (ADR 0013).
- **Verloren of gestolen apparaat.** Het Supabase-sessiecookie is niet
  `HttpOnly` (restrisico, nu per persoon). `admin_end_bar_session` laat de
  RPC's meteen weigeren en trekt ook de Auth-sessie in (ADR 0017), dus een
  gekopieerd token kan niet meer verversen of het account wijzigen. Leesrechten via RLS blijven voor dat account tot
  het access token verloopt: de status quo voor elke persoonlijke
  bardienst-sessie (ADR 0012). Afmelden trekt ook het PIN-vertrouwen van dat
  apparaat in (vraag 27).

## Tablet koppelen verwijderen (besloten, 19; gebouwd in PR #120)

Met de guards kan de device-sessie geen enkele bar-RPC meer aanroepen: het
device-account heeft geen `members`-rij en dus geen bar-sessie. Fase 1 en het
vervallen van de device-route gaan daarom samen (#117).

- **`/koppel`** (`src/app/(bar)/koppel/`, `src/features/tablet-koppelen/`):
  verwijderd, zonder redirect: een oude bladwijzer geeft een 404.
- **`src/lib/tabletKoppeling.ts`** en de device sign-in in
  **`src/middleware.ts`**: verwijderen. De middleware houdt
  `designPreviewGate` en de gewone cookieverversing.
- **Het cookie `abas_tablet`**: de middleware verwijdert het bij de eerste
  request (`Max-Age=0`). Het nieuwe `abas_apparaat` is een ander cookie met
  een andere betekenis; het oude wordt niet hergebruikt.
- **`BAR_DEVICE_SECRET`, `SUPABASE_DEVICE_EMAIL`,
  `SUPABASE_DEVICE_PASSWORD`**: uit Vercel en CI. `seed.sql` verliest
  `device@aurora.local` en krijgt wachtwoordaccounts voor de seed-bardiensten.
  De e2e-helpers loggen in via de namenlijst als seed-bardienst.
- **Het device-account op het gehoste project**: bij de uitrol eerst de
  sessies intrekken, dan het account verwijderen (19). Tot dat moment kan een
  lopend token van dat account via RLS nog alle leden en saldi lezen.
- **Documentatie**: zie "Doorgevoerd in bestaande documenten". #78 vervalt.
- **Uitrolvolgorde**: zie Zoals gebouwd → Uitrol (de volledige lijst, met de
  stappen uit ADR 0017).

## Rolzichtbaarheid

- **Lid**: niets hiervan. Een lid staat niet in de namenlijst en kan geen
  bar-sessie krijgen. `bar_sessions`, `shift_sessions`, `admin_notifications`
  en de apparaat- en lockouttabellen zijn niet leesbaar.
- **Iedereen zonder sessie**: de namenlijst (alleen namen) en het
  inlogscherm.
- **Bardienst**: de eigen sessie. Welke dienst er loopt, met starter,
  activiteit, en per koppeling de naam en laatste activiteit. Geen ingrepen
  in andermans sessie of dienst.
- **Beheerder**: alles van een bardienst, plus het overzicht van actieve
  sessies, de meldingen, afsluiten, overnemen en afmelden, en in fase 2 de
  instelling.

## Randgevallen

- **Twee tabbladen in één browser**: één sessie, één apparaat. Ze werken
  samen in dezelfde dienst, zoals nu. De hervat-bevestiging geldt voor de
  hele browser (sessiecookie), dus een nieuw tabblad beëindigt ook een
  beheersessie niet.
- **Dezelfde persoon op twee apparaten**: twee sessies. In (a) kan de tweede
  niet in de dienst werken, en de starter kan de dienst niet zelf verhuizen
  (12d).
- **Accountwissel of nieuwe login in dezelfde browser**: schermstatus hoort
  bij de combinatie van gebruikers-ID en Auth-session-ID. Een nieuwe login
  krijgt een nieuwe schermboom; een e-maillogin zonder geregistreerde
  bar-sessie toont opnieuw de modus-keuze. Een oude MFA-stap, mandje of
  vertraagd sessieantwoord gaat niet mee. Tokenverversing en MFA binnen
  dezelfde sessie behouden de schermstatus. De server blijft de rol en modus
  bij elke actie controleren (T01, PR #134).
- **Browser langer dicht dan 60 minuten**: geen hervatscherm, maar de melding
  en het startscherm.
- **Supabase-sessie verlopen** (refresh token ongeldig): het startscherm. De
  `bar_sessions`-rij blijft actief tot de cron-job hem inactief maakt.
- **Een geïnstalleerde PWA op iOS/iPadOS** kan het sessiecookie anders
  bewaren of wissen dan "browser dicht". Het hervatscherm verschijnt dan vaker. Ongevaarlijk,
  maar testen op het echte apparaat.
- **Privévenster of gewiste cookies**: geen apparaatcookie, dus alleen
  wachtwoord. Na een wachtwoordlogin is het apparaat weer vertrouwd.
- **Lid zonder account** (`auth_user_id` leeg) staat wel in de namenlijst,
  maar kan niet inloggen (`no_account`). Dat is precies de voorwaarde uit
  vraag 19.
- **Lid gearchiveerd of rol gewijzigd tussen het laden van de lijst en de
  login**: `not_allowed`, de lijst ververst.
- **PIN ingesteld in de portal, nooit met wachtwoord op de tablet
  ingelogd**: op de tablet alleen wachtwoord, met de uitleg in het
  Tekstvoorstel. Na één wachtwoordlogin werkt de PIN daar.
- **Overname terwijl het oude apparaat midden in een bestelling zit**: die
  bestelling geeft `session_not_on_shift`. Niets geboekt, mandje weg, met de
  melding.
- **Race: twee apparaten starten tegelijk** in (a)/(b): het lock uit `0021`,
  de tweede krijgt `shift_already_open`. In (c): de unique index per sessie.
- **Lid gearchiveerd of rol naar `lid` tijdens de dienst**: de sessie eindigt
  meteen (21), en bij een wees-dienst komt er een melding.
- **Bardienst wordt beheerder tijdens de dienst** (ADR 0017, besloten
  2026-10-01): de sessie eindigt ook meteen, met `beheerder_geworden`, met de
  Auth-sessie en het PIN-vertrouwen, en bij een wees-dienst een melding.
  Zonder dit zou een lopende aal1-sessie (bijv. uit een PIN) de sessie van
  een beheerder zonder factor worden. Teksten: `beheer-tweede-factor.md` →
  Teksten (voorstel).
- **De ingelogde persoon verwijdert zichzelf uit de bezetting**: mag, zoals
  nu. De bezetting gaat over attributie, niet over sessies. De sessie werkt
  door.
- **Een bardienst die alleen staat, wil zichzelf opwaarderen**: geweigerd
  (A4). Een ander lid of een beheerder moet het doen (Bram, vierde ronde).
- **Een beheerder in modus `beheer`** kan geen bar-RPC aanroepen
  (`wrong_mode`), en een beheerder in modus `bar` geen beheer-RPC (11),
  behalve `admin_end_shift` en `admin_end_bar_session` (12a, 12c).
- **`pg_cron` draait niet**: de guard weigert nog steeds. Alleen de melding
  en de sluitreden komen later.
- **Oude diensten** (van vóór de migratie): `started_session_id` is null en er
  zijn geen koppelingen. De migratie weigert als er een open dienst is.

## Fasering

**Fase 1: één dienst, stand (a), persoonlijke login.** Eén uitrol, samen met
het verwijderen van tablet koppelen (#117).

- `bar_sessions`, `shift_sessions`, de guards, en de wijzigingen aan de
  bar-RPC's (inclusief A4 in `top_up`) en `start_shift` zonder PIN
- de modus server-side in alle beheer-RPC's (11)
- inloggen vanaf de namenlijst: namenlijst, inlogopties, wachtwoordlogin,
  PIN-login, wachtwoord vergeten
- `bar_devices`, `bar_device_members`, `pin_failures`, `verify_bar_pin`;
  lockout (B2) en kostenfactor (B1)
- "Mijn account" weg uit de bar-shell
- `register_bar_session(_server)`, `end_bar_session`, `touch_bar_session`,
  `my_bar_state`
- uitloggen op de bar-schermen met de keuze uit 17, het hervatscherm, de
  meldingen bij een gesloten sessie
- `admin_end_shift`, `admin_take_over_shift`, `admin_end_bar_session`
- inactiviteit (60 minuten) met `close_inactive_bar_sessions` en de
  beheerdermelding in de app
- `bar_session_id` op de boekingen
- tablet koppelen en het device-account eruit
- de documentwijzigingen hieronder

**Fase 2: de instelling.**

- `app_settings.shift_session_mode` (standaard (a)) en
  `set_shift_session_mode` (alleen zonder open dienst)
- stand (b): `join_shift` met "Aansluiten", aansluiter in de bezetting, elk
  gekoppeld apparaat mag afsluiten
- stand (c): alleen een beheerder start een extra dienst, een lid staat in
  hooguit één open bezetting (`start_shift`, `add_shift_member` en
  `join_shift` weigeren dan met een eigen code)
- eventueel omzet per apparaat op het afsluitscherm, alleen op verzoek (18)

Er is geen fase 3 meer: de PIN-login zit in fase 1 (6).

## Expliciet buiten scope

- Een kasopmaak- of kastellingfunctie (startgeld, tellen, verschil).
- `served_by` sterker maken (bijvoorbeeld standaard de ingelogde persoon).
  Dat raakt CLAUDE.md → Architectuurbeslissingen en is een eigen beslissing.
- Offline gebruik en service-worker (CLAUDE.md → Shells).
- Een dienstkolom in het Logboek voor stand (c).
- Een naam per apparaat (22).
- De beheerdermelding per e-mail (8).
- Een waarschuwing vóór de 60 minuten verstrijken ("Nog bezig?"). Niet
  gevraagd; de melding komt achteraf.
- Leestoegang op RLS-niveau koppelen aan een actieve bar-sessie. Die blijft
  zoals ADR 0007 en ADR 0012 hem vastleggen.
- Het `has_pin`-filter in `useBarStaff` voor de bezetting. Dat blijft zoals
  het is; alleen het startscherm krijgt een eigen bron.

## Doorgevoerd in bestaande documenten

De wijzigingen die deze spec vooraf beschreef, zijn met de bouw doorgevoerd
(PR #120). De volledige voor-en-na-tekst staat in de git-geschiedenis van dit
document (vóór 2026-10-01); hier alleen waar ze terechtkwamen.

- **CLAUDE.md**: Domein (Opwaarderen met A4, Dienst & bezetting),
  Architectuurbeslissingen (geld-RPC's eisen een gekoppelde bar-sessie,
  interne functies voor geen API-rol of alleen `service_role`; `served_by`
  binnen een persoonlijke sessie), Shells (supportuitspraak, 20) en Auth (PIN
  als login voor bar-modus, alleen in de portal te zetten; beheer vraagt modus
  beheer met tweede factor, ADR 0017).
- **ADR 0002, 0003, 0005**: geamendeerd door ADR 0016 (en 0017).
  **ADR 0011**: vervangen door ADR 0016. **ADR 0006**: aangevuld (login
  zonder sessie via functies die alleen `service_role` mag uitvoeren).
- **`docs/ARCHITECTURE.md`**: persoonlijke bar-sessies in plaats van de
  gedeelde device-sessie; device sign-in, tablet-trust en device-account
  vervallen; PIN-opslag (kostenfactor 12, lockout); Auth-methode & modus;
  Dienst & bezetting; e2e-mocks op `/beheer`.
- **`bar-rpc-autorisatie.md`**: A2 vervangen door de allowlist; A3, A4, B1,
  B2 en B3 gerealiseerd (statusblok bovenaan dat document).
- **Overige specs** (korte verwijzing bovenaan, geen herschrijving):
  `dienst-starten.md`, `auth-methode-per-lid.md`, `tablet-koppelen.md`
  (vervallen), `portal-profiel.md`, `wachtwoord-vergeten.md`, en voor het
  gewijzigde toegangsmodel `opwaarderen.md`, `bezetting-beheren.md`,
  `dienst-afsluiten.md`, `bestelling-terugdraaien.md`,
  `dienst-te-lang-open.md` en `lid-account-invite.md`.
- **Migraties `0021` en `0023`**: niet gewijzigd (historie). `0029` vervangt
  `start_shift` (nieuwe signatuur) en de zes bar-RPC's en zegt dat in haar
  eigen kop.

## Teksten (goedgekeurd door Bram, 2026-09-29)

Toon zoals in `src/features/**`: titels met een hoofdletter ("Dienst staat
nog open"), foutregels klein met een gedachtestreepje ("onjuiste pincode",
"de dienst is niet meer actief — herlaad het scherm"), "je", kort.
`{…}` is een invulveld.

| Invulveld | Tekst als het leeg is |
|---|---|
| `{activiteit}` (een dienst zonder activiteittype) | geen activiteit |

"geen activiteit" is goedgekeurd door Bram (2026-09-30).

### Startscherm (namenlijst)

| Plek | Tekst |
|---|---|
| Titel | Bar openen |
| Ondertitel | Tik op je naam om in te loggen. |
| Link onder de lijst (bestaat) | Inloggen met e-mail |

De bestaande ondertitel "Wie opent de bar vanavond?" past niet meer, want je
logt hier ook in als er al een dienst loopt.

### Inlogscherm na een tik op een naam

| Plek | Tekst |
|---|---|
| Terug-link | ← andere naam |
| PIN: instructie | Voer je pincode in |
| PIN: toggle | Inloggen met wachtwoord |
| Wachtwoord: veldlabel | Wachtwoord |
| Wachtwoord: knop | Inloggen |
| Wachtwoord: toggle (als PIN kan) | Inloggen met pincode |
| Wachtwoord: link | Wachtwoord vergeten? |
| Wachtwoord, PIN kan hier niet | Met je pincode inloggen kan op dit apparaat pas nadat je hier een keer met je wachtwoord bent ingelogd. |
| Fout: PIN | onjuiste pincode — nog {n} pogingen |
| Fout: PIN, laatste poging | onjuiste pincode — nog 1 poging, daarna log je in met je wachtwoord |
| Lockout | Je pincode is geblokkeerd na te veel foute pogingen. Log in met je wachtwoord. |
| Fout: wachtwoord | onjuist wachtwoord |
| Fout: te veel pogingen (rate limit) | te veel pogingen — wacht even en probeer het opnieuw |
| Fout: geen account | er is voor jou nog geen wachtwoord ingesteld — vraag een beheerder om een uitnodiging |
| Fout: gearchiveerd of geen bar-rol | je kunt niet op de bar inloggen — vraag een beheerder |
| Fout: overig | er ging iets mis, probeer het opnieuw |
| Wachtwoord vergeten: uitleg | Je krijgt een mail met een link om een nieuw wachtwoord in te stellen. |
| Wachtwoord vergeten: knop (bestaat) | Stuur herstellink |
| Wachtwoord vergeten: bevestiging | Als er een account bij je naam hoort, is de mail onderweg. De link is 1 uur geldig. |

"{n} pogingen" hangt af van vraag 25.

### Hervatscherm

| Plek | Tekst |
|---|---|
| Titel | Verder als {naam}? |
| Uitleg | Dit apparaat is nog ingelogd als {naam}. |
| Uitleg, met dienst | De dienst ({activiteit}, sinds {tijd}) loopt nog. |
| Knop | Verder |
| Knop | Uitloggen |

### Dienst loopt op een ander apparaat

| Plek | Tekst |
|---|---|
| Titel | Er loopt al een dienst |
| Uitleg | {starter} is om {tijd} een dienst begonnen ({activiteit}). Die loopt op een ander apparaat, ingelogd als {naam}, laatst actief om {tijd}. |
| Uitleg, wees-dienst | {starter} is om {tijd} een dienst begonnen ({activiteit}). Er is geen apparaat meer ingelogd in deze dienst. |
| Voor een bardienst | Alleen een beheerder kan deze dienst overnemen of afsluiten. |
| Knoppen, beheerder | Overnemen · Afsluiten |
| Knop | Uitloggen |

Vraag 24 (ii), gebouwd: bij een wees-dienst waarin de bardienst in de
bezetting staat, vervangt onderstaande uitleg de gewone wees-uitleg, en de
knop "Dienst hervatten" komt in de plaats van de regel "Voor een bardienst".

| Plek | Tekst |
|---|---|
| Uitleg, wees-dienst, lid in de bezetting | {starter} is om {tijd} een dienst begonnen ({activiteit}). Er is geen apparaat meer ingelogd in deze dienst. Jij staat in de bezetting en kunt hem hervatten. |
| Knop | Dienst hervatten |
| Voor een bardienst buiten de bezetting (blijft) | Alleen een beheerder kan deze dienst overnemen of afsluiten. |

Er is geen aparte foutregel voor `shift_not_orphan` en `not_in_shift_crew`: het
scherm ververst zich en toont dan zelf de juiste toestand (andere uitleg, geen
knop). `session_has_shift` en `shift_not_open` hergebruiken "je werkt al in een
dienst — sluit die eerst af" en "deze dienst is al afgesloten".

### Aansluiten (stand b, fase 2)

| Plek | Tekst |
|---|---|
| Titel | Er loopt al een dienst |
| Uitleg | {starter} is om {tijd} een dienst begonnen ({activiteit}). Sluit aan om op dit apparaat mee te werken. Je komt dan in de bezetting. |
| Knop | Aansluiten |

### Overnemen, afsluiten en afmelden door een beheerder

| Plek | Tekst |
|---|---|
| Overnemen: titel | Dienst overnemen? |
| Overnemen: uitleg | De dienst gaat verder op dit apparaat. Op het andere apparaat kan niemand meer in deze dienst werken. Je komt zelf in de bezetting. |
| Overnemen: knoppen | Overnemen · Annuleren |
| Overnemen: toast | Dienst overgenomen |
| Hervatten: toast | Dienst hervat |
| Afsluiten: titel (bestaat) | Dienst afsluiten |
| Afsluiten: extra regel | Deze dienst loopt op een ander apparaat. Daar stopt hij ook. |
| Afmelden: titel | Apparaat afmelden? |
| Afmelden: uitleg | {naam} wordt op dat apparaat uitgelogd. Loopt daar een dienst, dan blijft die open zonder apparaat. |
| Afmelden: knoppen | Afmelden · Annuleren |
| Afmelden: toast | Apparaat afgemeld |
| Fout: al een eigen dienst | je werkt al in een dienst — sluit die eerst af |
| Fout: dienst al dicht | deze dienst is al afgesloten |

### Meldingen bij een gesloten sessie

Eén overlay met titel, uitleg en de knop "OK".

| Reden | Titel | Uitleg |
|---|---|---|
| Inactief | Je bent uitgelogd | Er is 60 minuten niets gedaan op dit apparaat. |
| Inactief, met dienst | Je bent uitgelogd | Er is 60 minuten niets gedaan op dit apparaat. De dienst loopt nog; een beheerder heeft een melding gekregen. |
| Overgenomen | Je dienst is overgenomen | Een beheerder werkt nu op een ander apparaat in deze dienst. |
| Afgesloten door beheerder | De dienst is afgesloten | Een beheerder heeft de dienst afgesloten vanaf een ander apparaat. |
| Afgemeld | Je bent afgemeld | Een beheerder heeft dit apparaat afgemeld. |
| Rol gewijzigd of gearchiveerd | Je bent uitgelogd | Je account mag niet meer op de bar werken. Klopt dat niet, vraag dan een beheerder. |
| Geen bar-sessie (overig) | Je bent uitgelogd | Log opnieuw in om verder te gaan. |

Bij een half ingevuld mandje komt er een regel bij: "Wat nog in het mandje
stond, is niet afgerekend."

### Melding voor de beheerder in de app

| Plek | Tekst |
|---|---|
| Titel | Dienst zonder apparaat |
| Uitleg | De dienst van {starter} ({activiteit}, sinds {tijd}) heeft geen ingelogd apparaat meer. |
| Reden: inactief | Er is 60 minuten niets gedaan. |
| Reden: uitgelogd | {naam} is uitgelogd zonder af te sluiten. |
| Reden: afgemeld | Het apparaat is afgemeld. |
| Reden: rol | {naam} mag niet meer op de bar werken. |
| Knoppen in bar-modus | Overnemen · Afsluiten |
| Knop in beheer | Afsluiten |
| Hint in beheer | Overnemen kan op de bar. |

### Uitloggen

| Plek | Tekst |
|---|---|
| Kop op de bar | Ingelogd als {naam} |
| Knop | Uitloggen |
| Met open dienst: titel | Je dienst loopt nog |
| Met open dienst: uitleg | Wil je de dienst afsluiten voor je uitlogt? |
| Knop | Dienst afsluiten |
| Knop | Open laten en uitloggen |
| Hint bij "open laten" | Een beheerder krijgt dan een melding. |
| Knop | Annuleren |

Zonder open dienst logt "Uitloggen" direct uit, zonder vraag.

### Opwaardering naar jezelf (A4)

| Plek | Tekst |
|---|---|
| Inline bij het kiezen van jezelf | je kunt jezelf niet opwaarderen — laat een collega of een beheerder dit doen |
| Foutmelding van `top_up` (`self_top_up_forbidden`) | dezelfde tekst |

De inline regel staat er al voor het boeken, zodat de weigering niet pas na
de RPC zichtbaar wordt (zelfde verdeling als de €500).

### Gearchiveerd lid

| Plek | Tekst |
|---|---|
| Bij de login (race met de lijst) | je kunt niet op de bar inloggen — vraag een beheerder (staat bij de verversde namenlijst, na een PIN- en na een wachtwoordlogin) |
| Tijdens de sessie | zie "Rol gewijzigd of gearchiveerd" hierboven |
| Afrekenen of opwaarderen bij een gearchiveerd lid (bestaat) | dit lid bestaat niet meer of is gearchiveerd — kies een ander lid |

### Na afsluiten

Geen nieuwe tekst: de app toont "Bar openen" met `ActiviteitKeuze` en
"Ingelogd als {naam}" (Schermflow punt 7).

## Zoals gebouwd (fase 1)

Gemerged in PR #120 (2026-10-01). De tekst hierboven is de spec; dit is wat
er bij de bouw anders of extra is geworden, en waarom.

| Migratie | Inhoud | Spec |
|---|---|---|
| `0027` | datamodel (`bar_sessions`, `shift_sessions`, `bar_devices`, `bar_device_members`, `pin_failures`, `admin_notifications`, `bar_session_id` op de boekingen) | deze |
| `0028` | guards, sessie-RPC's, PIN-login, `close_inactive_bar_sessions` (pg_cron, elke minuut) | deze |
| `0029` | bestaande bar- en beheer-RPC's eisen een bar- of beheersessie; A4 | deze |
| `0030` | `resume_orphan_shift` (vraag 24 (ii)) | deze |
| `0031` | `check_beheer_session` (invite pas na de sessiecontrole) | deze, review-fix 1 |
| `0032` | `set_own_pin` alleen vanuit de portal | deze, review-fix 2 |
| `0033` | PIN-vertrouwen per lid per apparaat | deze, review-fix 4 |
| `0034` | beheer eist aal2, Auth-sessie intrekken, `pin_needs_mfa`, `resumable` | [`beheer-tweede-factor.md`](beheer-tweede-factor.md) |
| `0035` | `login_throttle` en `purge_login_throttle` | [`login-rate-limit.md`](login-rate-limit.md) |
| `0036` | atomaire reservering (`login_throttle_reserve`/`_release`) | [`login-rate-limit.md`](login-rate-limit.md) |
| `0037` | promotie naar beheerder sluit de bar-sessies (`beheerder_geworden`) | [`beheer-tweede-factor.md`](beheer-tweede-factor.md) |

**Database**

- **`verify_bar_pin` geeft een rij terug en raiset niet.** Kolommen
  `result_code` (`ok`, `not_allowed`, `no_account`, `pin_not_available`,
  `pin_locked`, `invalid_pin`), `member_auth_user_id`, `trusted_device_id`,
  `attempts_left`. Een `raise` draait de update van de teller in dezelfde
  transactie terug, en dan telt een foute PIN nooit mee. De spec sprak over een
  fout met resterende pogingen en het `auth_user_id` bij succes. Het
  apparaat-id komt mee zodat `register_bar_session_server` het kan vastleggen.
- **Drie extra functies voor de login vóór er een sessie is**, alle alleen
  `service_role`: `bar_login_options(p_device_token_hash, p_member_id)`
  (inlogopties, spec → Inloggen op de bar punt 2), `record_bar_password_login(
  p_device_token_hash, p_member_id)` (na een wachtwoordlogin: PIN-blokkade
  opheffen en het apparaat vertrouwen; geeft `null` bij een ingetrokken apparaat,
  dan geeft de server een nieuw cookie uit — een ingetrokken apparaat blijft
  voor altijd ingetrokken) en de interne `bar_pin_state`.
- **Vertrouwen verloopt server-side na 30 dagen, per lid per apparaat**
  (`bar_device_members.last_login_at`, sinds `0033`; eerst was het
  `bar_devices.last_seen_at`, dat elke login op het apparaat verlengde, van wie
  ook), niet alleen via de levensduur van het cookie.
- **`end_bar_session(p_close_shift, p_reason default 'uitgelogd')`**: de extra
  parameter (`uitgelogd` of `niet_hervat`) legt vast dat een beheersessie niet is
  hervat (Schermflow punt 3). Geen hartslag: uitloggen is geen activiteit.
- **`admin_end_bar_session` weigert een al beëindigde sessie met
  `target_session_ended`**, niet met `session_ended`: die code is de guardcode
  voor "jouw eigen sessie is beëindigd" en krijgt op de client een eigen,
  centrale afhandeling.
- **`register_bar_session` codes**: `invalid_mode`, `no_bar_session`,
  `no_bar_role`, `no_admin_role`, `session_ended`, `mode_locked`; na ADR 0017
  ook `mfa_not_enrolled` en `aal2_required` (`beheer-tweede-factor.md`).
- **`my_bar_state()`** geeft één JSON-object (typen in `src/lib/barState.ts`): de
  sessie met `status` (`active`/`inactive`/`ended`/`no_role`), de eigen dienst,
  `last_left` (overgenomen of afgesloten door een beheerder), de dienst elders
  (met `orphan`, de sessies en `in_bezetting`), voor een beheerder de
  `notifications`, en voor een beheerder in modus `beheer` het overzicht
  (`admin`). Ook het beheeroverzicht komt dus uit deze ene RPC.
- Een sessiegebonden lid moet ook nog steeds bij het **account van de sessie**
  horen (`members.auth_user_id = auth.uid()`): anders `no_bar_role`.
- De migratie weigert als er een open dienst is, zoals de spec eist.
- `set_member_archived` en `set_member_role` beëindigen de bar-sessies van een
  lid dat `lid` of gearchiveerd wordt en trekken het PIN-vertrouwen in
  (`end_member_bar_sessions`).

**Server en client**

- **Route Handlers** onder `src/app/(bar)/inloggen/` (`namen`, `opties`,
  `wachtwoord`, `pin`, `vergeten`) met de logica in `src/lib/barLogin.ts`;
  `SUPABASE_SECRET_KEY` is nu nodig voor elke login op de bar (ook lokaal en in
  CI).
- **De rate limit van Supabase Auth op wachtwoordpogingen** (Veiligheid) is niet
  te controleren vanuit deze omgeving. De server logt in namens de gebruiker, dus
  Supabase ziet het IP-adres van de server. Er is bewust geen `X-Forwarded-For`
  doorgegeven: als Supabase dat vertrouwt, kan iedereen zijn IP verzinnen en is
  de limiet weg. **Opgevolgd door ADR 0017:** een eigen limiet per IP en per lid
  (`login-rate-limit.md`); `Sb-Forwarded-For` pas als Supabase het bevestigt.
- **`BarSessieProvider`** (`src/features/bar-sessie/`) is de centrale afhandeling
  van de sessiecodes (zes, plus `aal2_required` sinds ADR 0017). Een hook die een sessiecode ontvangt, roept
  `notifySessionCode` aan; `reportClientError` doet dat ook voor hooks die de
  codes niet zelf kennen (dus ook de beheer-hooks), en logt ze niet naar
  `client_errors`. De toestand ververst elke 30 seconden stil (geen hartslag),
  zodat "Je dienst is overgenomen" en nieuwe meldingen ook zonder aanraking
  verschijnen.
- **Persoonlijke frontend-sessiegrens (T01, 2026-10-01)**:
  [`PR #134`](https://github.com/BramLambertJansen/ABAS/pull/134) is gemerged.
  `BarSessieProvider` maakt een `BarSessieScope` per gebruikers-ID en
  Auth-session-ID. `useBarAuth`, `useBeheerSession` en `useMijnDienst`
  negeren verouderde antwoorden; een ontkoppelde scope schrijft geen
  bevestigingscookie meer na een late modusregistratie. Een namenlijstlogin
  bevestigt de nieuwe sessie buiten de oude scope. De afmeldmelding blijft
  daar ook staan, zodat ze na lokaal uitloggen zichtbaar blijft.
  Het contract, de RPC's en de vaste modus blijven het goedgekeurde model.
  Bewijs: [`../audits/t01-session-regressions.md`](../audits/t01-session-regressions.md).
- **Bar-schermen**: `BarApp` (`/`), `BarInloggen`, `HervatScherm`,
  `DienstStarten` (zonder PIN-stap, met `ActiviteitKeuze` zonder terugknop),
  `DienstElders`, `UitloggenKnop` (met de keuze uit vraag 17), `AdminMeldingen`,
  `OvernemenOverlay`, `AfmeldenOverlay`; `DienstAfsluitenOverlay` kent een
  variant `beheerder`. `DienstTabs` heeft "Ingelogd als {naam}" en "Uitloggen"
  onderaan de rail.
- **`/beheer`**: `ModusKeuze` registreert de sessie (`register_bar_session`).
  **De tegel "Beheer" staat er alleen voor een beheerder** (de server registreert
  een beheersessie alleen voor die rol). **De link "← terug naar bardienst" is uit
  `BeheerTabs` verdwenen**: een beheersessie kan niet naar de bar, modus wisselen
  is uitloggen. Een sessie in modus bar op `/beheer` gaat naar `/`, en een
  beheersessie op `/` naar `/beheer`. Nieuw tabblad **Diensten** (alleen
  beheerder): open diensten met koppelingen, actieve sessies, "Afsluiten" en
  "Afmelden".
- **A4 inline**: `OpwaarderenOverlay` toont de goedgekeurde tekst bij het kiezen
  van jezelf, en de knop "boeken" blijft uit.
- **Service-role alleen server-side.** `src/lib/supabase/admin.ts` wordt
  alleen gebruikt door `src/lib/barLogin.ts` (de login vanaf de namenlijst) en
  `src/lib/inviteMember.ts`; `check:arch` weert het uit client-code.

**Aanvullingen uit ADR 0017 (zelfde PR)**, in detail in de twee specs:

- Beheer eist aal2 (`register_bar_session('beheer')`,
  `require_beheer_session`, `check_beheer_session`); de PIN werkt niet voor een
  beheerder zonder factor (`pin_needs_mfa`), en diens bar-sessie wordt niet
  hervat (`my_bar_state().session.resumable`).
- Elk einde van een bar-sessie verwijdert ook de rij in `auth.sessions`
  (`close_bar_session_internal`).
- De hervat-bevestiging is een sessiecookie `abas_bar_bevestigd` met het
  `session_id`, per browser in plaats van per tabblad (Schermflow punt 3).
- Promotie naar beheerder sluit de bar-sessies, met sluitreden
  `beheerder_geworden` (`0037`).
- De server-side login heeft een eigen limiet per IP en per lid
  (`login_throttle`, `0035`/`0036`), en de namenlijst geeft geen rol meer.

**Vraag 24 (ii)**

- **Vraag 24 (ii) is gebouwd** (migratie `0030`, na goedkeuring van ontwerp en
  teksten door Bram, 2026-09-29): `resume_orphan_shift(p_shift_id)` (zie RPC's),
  de hook `useResumeOrphanShift`, en in `DienstElders` de knop "Dienst hervatten"
  met de uitleg uit Teksten voor een bezettinglid van een wees-dienst
  (`my_bar_state` leverde `other_shift.in_bezetting` al). Alleen voor een
  bardienst: een beheerder in de bezetting houdt "Overnemen" en "Afsluiten".
  Na het hervatten gaat het scherm meteen naar de dienst, met de toast "Dienst
  hervat" (Teksten). Nieuwe foutcodes `shift_not_orphan` en
  `not_in_shift_crew` zijn bekende domeinuitkomsten (niet naar `client_errors`).
  Tests: `supabase/tests/resume_orphan_shift.test.sql` (elke weigering, de happy
  path en het oplossen van de melding), `rpc_execute_grants.test.sql`,
  `test/moneyHooksFoutlogging.test.ts` en `e2e/dienst-hervatten.spec.ts`
  (gemockt).

**Niet gebouwd of open**

- **Teksten die niet in de goedgekeurde sectie stonden** en er wel moesten komen
  (goedgekeurd door Bram, 2026-09-29):
  het tabblad "Diensten" en de kopjes "Diensten" en "Ingelogd" in het
  beheeroverzicht, "sinds {tijd}" en "laatst actief om {tijd}" daarin, "Er loopt
  geen dienst." en "Niemand is ingelogd.", "Opnieuw proberen" en de laadteksten
  ("Bardienst-lijst laden…", "Bezig met laden…"), en de hint "← terug naar
  inloggen" in de weergave wachtwoord vergeten.
- Fase 2 (de instelling, `join_shift`, stand (b) en (c)) niet.

**Review-fixes (goedgekeurd door Bram, 2026-09-30)**

1. **Invite pas na de sessiecontrole.** `src/lib/inviteMember.ts` roept vóór
   `inviteUserByEmail` de nieuwe RPC `check_beheer_session()` (`0031`,
   alleen `authenticated`) aan: dezelfde voorwaarde als
   `require_beheer_session()`, zonder hartslag. Een weigering krijgt dezelfde
   afhandeling als een weigering van `mark_member_invite_sent`. Een beheerder
   in een bar-sessie verstuurt dus geen mail meer. Tests:
   `test/inviteMember.test.ts`, `supabase/tests/beheer_rpcs_modus.test.sql`,
   `rpc_execute_grants.test.sql`.
2. **`set_own_pin` alleen vanuit de portal** (`0032`, besluit 10): heeft de
   sessie van de aanroeper een rij in `bar_sessions` (bar of beheer, ook
   beëindigd), dan `wrong_mode`. De portal registreert nooit een bar-sessie
   en werkt zoals voorheen. Tests: `supabase/tests/set_own_pin.test.sql`.
3. **"je kunt niet op de bar inloggen — vraag een beheerder"** staat nu bij de
   verversde namenlijst na `not_allowed`, voor het PIN- en het wachtwoordpad,
   tot er een naam gekozen wordt. Test: `e2e/bar-inloggen-niet-toegestaan.spec.ts`
   (gemockt).
4. **PIN-vertrouwen per lid per apparaat** (`0033`, vraag 27): nieuwe kolom
   `bar_device_members.last_login_at`, gezet door `record_bar_password_login`
   en een geslaagde `verify_bar_pin` van dát lid; `bar_pin_state` eist dat die
   binnen 30 dagen ligt. Een login van een ander lid verlengt het niet. Het
   apparaatcookie is ongewijzigd. Bestaande rijen krijgen `password_login_at`.
   Tests: `supabase/tests/verify_bar_pin.test.sql`.

**Uitrol** (de volledige volgorde, inclusief de stappen uit
`beheer-tweede-factor.md` en `login-rate-limit.md`). Of deze stappen op
productie gedaan zijn, staat niet in de repo: zie Nog open.

1. Controle en actie op productie, vóór alles:
   `select name, role from members where role in ('bardienst','beheerder') and
   not archived and auth_user_id is null;` en voor elke rij eerst een uitnodiging
   sturen, en zorgen dat er een werkend wachtwoord is. Zonder wachtwoord staat
   iemand na de uitrol buiten de bar (de naam staat in de lijst, inloggen geeft
   `no_account`).
2. Alle diensten afsluiten (de migratie weigert anders).
3. `SUPABASE_SECRET_KEY` in Vercel (de login op de bar draait ermee), en de
   pg_cron-extensie staat al aan (`0025`).
4. TOTP aan op het gehoste project (Auth → MFA), en controleren dat
   `postgres` uit `auth.sessions` mag verwijderen en `auth.mfa_factors` mag
   lezen (`beheer-tweede-factor.md` → Uitrol).
5. Deployen (migraties `0027`–`0037`).
6. Device-account intrekken en verwijderen, daarna `SUPABASE_DEVICE_EMAIL`,
   `SUPABASE_DEVICE_PASSWORD` en `BAR_DEVICE_SECRET` uit Vercel en CI.
7. Elke beheerder stelt in de portal tweestapsverificatie in, te beginnen
   met Bram. Tot dan is er geen beheer.
8. Controleren dat Vercel `x-real-ip`/`x-forwarded-for` zelf zet en de
   client ze niet kan meesturen (`login-rate-limit.md` → IP-adres).
9. Op het echte tablet testen (vooral iPadOS en de PWA): hervatscherm,
   het sessiecookie van het hervatten (`abas_bar_bevestigd`), het
   apparaatcookie en de PIN-login.

## Open vragen voor Bram (historie)

Dit blok staat er als historie. De antwoorden zijn bindend en hierboven
verwerkt. Wat nog open is, staat in de laatste sectie (Nog open).

### Antwoorden tot nu toe (Bram, 2026-09-29)

1. **Ja, (i).** Fase 1 is gedrag (a): de dienst start op elk apparaat en
   hoort daarna bij dat apparaat. Een beheerder neemt over bij een kapot
   apparaat.
2. **Ja, (a)** is de standaard van de instelling in fase 2.
3. **Ja.** De PIN werkt alleen op een apparaat waar dat lid eerder met het
   wachtwoord inlogde.
4. **Ja.** Het wachtwoord blijft altijd werken.
5. **Nee, anders dan aanbevolen.** Het startscherm toont altijd alle
   bardienstleden (de `StaffPicker` blijft). Na een tik op een naam log je
   in:
   - met je PIN, als je op **dit apparaat** eerder met je wachtwoord hebt
     ingelogd en een PIN hebt ingesteld;
   - met je wachtwoord via een toggle;
   - anders alleen met je wachtwoord.

   Je typt geen e-mailadres; de server zoekt het e-mailadres bij het lid
   op. Die login maakt de persoonlijke sessie aan. De PIN is een geldige
   vervanger van het wachtwoord, maar pas in te stellen na een eerste login
   met wachtwoord.
6. **Ja**, maar anders gefaseerd: **de PIN-login zit in fase 1**, niet in
   fase 3, in de vorm van vraag 5. De lockout (B2) en de kostenfactor (B1)
   horen daarmee ook bij fase 1. Of een PIN-login ook naar beheer mag, is
   nog open.
7. **(b).** Er komt een aparte inactiviteitstijd, los van de bestaande
   melding "dienst te lang open" (6 uur, `dienst-te-lang-open.md`). Bij
   verloop wordt de sessie gesloten en gaat er een melding naar een
   beheerder. **De waarde is nog open.**

Aanvulling (Bram, 2026-09-29, tweede ronde):

- **Vraag 7: de inactiviteitstijd is 30 minuten**, als vaste waarde.
- **Vraag 6: een PIN-login geeft geen toegang tot beheer**; beheer vraagt
  het wachtwoord.
- **Vraag 5: de openbare namenlijst is acceptabel.**
8. **De beheerdermelding verschijnt in de app.**
9. **Ja.** Alle niet-gearchiveerde beheerders krijgen de melding, alleen als
   een open dienst geen actieve sessie meer heeft. De melding is opgelost
   zodra één beheerder overneemt of afsluit.
10. **"Mijn account" zit niet in de bar-shell, alleen in de portal.** Op de
    bar kun je alleen via de inlogpagina een nieuw wachtwoord aanvragen. Na
    hervatten is er op de bar dus alleen bar-werk, en beheer valt al af door
    vraag 11 (de modus wordt server-side afgedwongen).
11. **Ja**, de modus wordt server-side afgedwongen in de beheer-RPC's, in
    fase 1.
12. **(a) ja, (b) ja, (c) ja, (d) nee.**

Derde ronde (Bram, 2026-09-29):

13. **Ja.** In stand (b) sluit je aan met een expliciete knop
    "Aansluiten", en wie aansluit komt in de bezetting.
14. **Ja.** In stand (b) mag elk gekoppeld apparaat de dienst afsluiten.
15. **Ja.** In stand (c) mag alleen een beheerder een extra dienst starten
    naast een lopende, en een lid staat in hooguit één open bezetting. A4
    ("nooit naar jezelf opwaarderen") is nog niet besloten, zie hieronder.
16. **Ja.** De stand kan alleen gewisseld worden als er geen dienst open is.
17. **Ja.** Bij uitloggen met een open dienst kies je tussen "dienst
    afsluiten" en "open laten, een beheerder krijgt een melding".
18. **Ja.** `bar_session_id` komt nu op de boekingen; een uitsplitsing per
    apparaat volgt pas op verzoek.

Vierde ronde (Bram, 2026-09-29):

- **Vraag 15, A4: in alle standen, niet alleen in (c).** `top_up` weigert
  een opwaardering naar het lid van de ingelogde sessie
  (`self_top_up_forbidden`, `bar-rpc-autorisatie.md` → A4). Gevolg: een
  bardienst die alleen staat, kan zichzelf niet opwaarderen. Dat moet dan
  een ander lid of een beheerder doen.
19. **Ja.** Tablet koppelen verdwijnt in dezelfde uitrol als fase 1 (#117),
    en het device-account wordt bij de uitrol verwijderd.
20. **Ja.** "De bar draait nooit op een telefoon" is een supportuitspraak,
    geen grens die de app afdwingt. Dat komt in CLAUDE.md → Shells.
21. **Ja.** Wordt een lid gearchiveerd of verandert de rol, dan weigert de
    guard de sessie meteen.
22. **Niet in fase 1.**
23. **Akkoord.** De Architect stelt een tekstvoorstel op, en Bram keurt dat
    goed voordat de Developer begint.

### Oorspronkelijke vragen 1–23

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

### Vierde ronde, bevestiging

Bevestigd (Bram, 2026-09-29): A4 in alle standen betekent dat een bardienst
die alleen staat zichzelf niet kan opwaarderen; dat doet dan een collega of
een beheerder.

### Vragen 24–27 (vijfde ronde)

Vragen die niet uit de antwoorden volgden, maar die de Developer nodig had
om fase 1 te bouwen. Alle vier beantwoord (zie hieronder).

24. **Wie heropent een wees-dienst?** *(besloten (ii) en gebouwd, `0030`.)* Met 30 minuten inactiviteit (7) en
    alleen een beheerder die overneemt (12) geldt: een bar die een half uur
    niets aanslaat, kan daarna pas verder als er een beheerder komt. Ook de
    starter zelf kan na opnieuw inloggen niet verder in zijn eigen dienst.
    Staat er die avond geen beheerder achter de bar, dan kan de dienst niet
    meer verkopen tot iemand hem overneemt of sluit.
    - (i) Zo laten: alleen een beheerder (de letterlijke lezing van 7, 9, 12
      en 17).
    - (ii) Een bardienst die in de bezetting van een wees-dienst staat, mag
      hem na opnieuw inloggen weer oppakken. Dat geldt alleen voor een
      wees-dienst, dus 12d (een lopende dienst verhuizen) blijft nee. De
      melding wordt dan opgelost.

    *Aanbeveling: (ii).* Anders wordt de inactiviteitstijd de zwakste plek
    van een gewone avond.
25. **Lockout (B2): na hoeveel foute pogingen, en hoe gaat hij eraf?** En
    telt een fout wachtwoord ook mee?
    *Aanbeveling:*
    - na 5 foute PIN-pogingen is de PIN van dat lid geblokkeerd, op alle
      apparaten;
    - de blokkade gaat eraf bij de eerstvolgende geslaagde login met
      wachtwoord. Dat kan het lid zelf, zonder beheerder, want het wachtwoord
      werkt altijd (4). Dat lost het ontgrendelprobleem uit
      `bar-rpc-autorisatie.md` op;
    - foute wachtwoorden tellen niet mee. De namenlijst is openbaar, dus dan
      kan iedereen elke bardienst buitensluiten. Voor wachtwoorden blijft de
      rate limit van Supabase Auth, die per gebruiker moet blijven gelden
      (zie Veiligheid).
26. **Kostenfactor (B1)**: 10 of 12? Volgens `bar-rpc-autorisatie.md` duurt
    het doorzoeken van alle PIN's van één uitgelekte hash dan 28 of 111
    seconden (nu 2). *Aanbeveling: 12.* Het kost bij één login geen
    merkbare tijd, en de lockout doet het echte werk. Bestaande PIN's worden
    bij de volgende geslaagde PIN-login opnieuw gehasht. Niemand hoeft zijn
    PIN opnieuw in te stellen.
27. **Hoe lang blijft een apparaat vertrouwd voor de PIN, en wanneer vervalt
    dat?** *Aanbeveling:*
    - het apparaatcookie geldt 400 dagen, en elke login verlengt dat (zoals
      `abas_tablet` nu);
    - "Apparaat afmelden" (12c) trekt ook het PIN-vertrouwen van dat apparaat
      in, voor alle leden. Een verloren tablet kan dan niet meer met een PIN
      inloggen, alleen met een wachtwoord;
    - archiveren of de rol naar `lid` trekt het vertrouwen voor dat lid in op
      alle apparaten.

    Een nieuw wachtwoord of een nieuwe PIN verandert niets aan het
    vertrouwen.

#### Beantwoord (Bram, 2026-09-29, vijfde ronde)

- **24: (ii), en de inactiviteitstijd wordt 60 minuten in plaats van 30.**
  Een bardienst uit de bezetting mag een wees-dienst na opnieuw inloggen
  weer oppakken. 12d blijft nee. Overal in deze spec en in ADR 0016 staat nu
  60 minuten.
- **25: zoals aanbevolen.** Na 5 foute PIN-pogingen is de PIN geblokkeerd.
  Een geslaagde wachtwoordlogin heft de blokkade op, en foute wachtwoorden
  tellen niet mee.
- **26: zoals aanbevolen.** Kostenfactor 12, met herhashen bij de volgende
  PIN-login.
- **27: een maand (30 dagen) in plaats van 400 dagen, en elke login
  verlengt die.** Aangescherpt door Bram (2026-09-30): het vertrouwen geldt
  per lid per apparaat. De PIN van lid X werkt op apparaat D alleen als X zelf
  in de laatste 30 dagen op D inlogde (wachtwoord of PIN), en alleen een login
  van X verlengt dat (`0033`). "Apparaat afmelden" trekt het vertrouwen van dat apparaat
  in. Archiveren of de rol terugzetten naar `lid` trekt het op alle
  apparaten in.
- **De keuzes van de Architect zijn akkoord.** Een e-maillogin op `/beheer`
  maakt een apparaat niet vertrouwd, en "Bar" blijft in `ModusKeuze`. Bram
  vraagt later zelf om aanpassing als dat nodig is.

De teksten zijn goedgekeurd (2026-09-29): "goedkeuren, later aanpassen".

## Nog open

1. **Uitrolstappen op productie.** Of de stappen onder Zoals gebouwd → Uitrol
   zijn uitgevoerd (vooral de controle dat elke bardienst en beheerder een
   werkend wachtwoord heeft, voorwaarde uit vraag 19, het verwijderen van het
   device-account en TOTP voor elke beheerder), staat niet in de repo. Bram
   wist het op 2026-09-29 niet voor de wachtwoorden; het blokkeerde de bouw
   niet, maar het is een verplichte stap vóór fase 1 live gaat. Controle:
   `select name, role from members where role in ('bardienst','beheerder')
   and not archived and auth_user_id is null;`.
2. **Fase 2** (de instelling (a)/(b)/(c), `join_shift`,
   `set_shift_session_mode`): ontwerp goedgekeurd, niet gebouwd.

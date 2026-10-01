# 0016 — Een dienst hoort bij een of meer geregistreerde, persoonlijke app-sessies, niet bij een gedeeld device-account

Status: **geaccepteerd door Bram (2026-09-29); fase 1 geïmplementeerd en
gemerged** ([PR #120](https://github.com/BramLambertJansen/ABAS/pull/120),
2026-10-01, merge-commit `ae89bd9`; migraties `0027`–`0033`, de login vanaf de
namenlijst en de schermen). Fase 2, de instelling (a)/(b)/(c) uit Beslissing
3, is niet gebouwd. Hoort
bij [`docs/features/dienst-per-sessie.md`](../features/dienst-per-sessie.md).
De teksten en de vragen 24–27 zijn beantwoord; de waarden staan in die spec
(lockout na 5 foute PIN's, kostenfactor 12, vertrouwen 30 dagen, inactiviteit
60 minuten).

**Geamendeerd door [ADR 0017](0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md)
(2026-09-30):** Beslissing 4 (het einde van een bar-sessie trekt ook de
Auth-sessie in `auth.sessions` in) en Beslissing 7/8 (beheer eist daarnaast
aal2; de PIN werkt niet voor een beheerder zonder tweede factor; een
bar-sessie van zo'n beheerder wordt niet hervat). De namenlijst geeft geen
rol meer en de login heeft een eigen limiet vóór Supabase.

**Vervangt:**

- [ADR 0011](0011-device-sessie-alleen-voor-gekoppelde-tablet.md) (device-sessie
  alleen op een gekoppelde tablet). Bram heeft besloten dat tablet koppelen
  verdwijnt in dezelfde uitrol (spec → vraag 19). Met de guards hieronder kan
  een device-sessie geen bar-werk meer doen.
- De A2-denylist (`caller_is_lid()` in de bar-RPC's,
  `0023_bar_rpcs_weigeren_lid.sql`, `docs/features/bar-rpc-autorisatie.md`).
  Die wordt een allowlist. A3 en B3 uit dat document worden daarmee
  gerealiseerd, zonder de `device_accounts`-tabel die daar werd voorgesteld.
  A4, B1 en B2 worden in fase 1 gebouwd.

**Amendeert:**

- [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md): stap 3
  ("de eerstvolgende bar-request zonder sessie herstelt de device-sessie")
  vervalt. Ook de zin "gewone bardienst-acties zijn nooit afhankelijk van
  *welke* `authenticated`-identiteit de aanroep doet" vervalt: dat worden ze nu
  juist wel. "Eén actieve Supabase-sessie per browser, een nieuwe login
  vervangt de vorige" en de `auth.uid()`-actorcheck blijven staan.
- [ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) →
  Beslissing 3: de PIN-route naar bar-modus via de gedeelde sessie vervalt.
  Andere leden liften mee op de persoonlijke sessie van wie ingelogd is (de
  bezetting blijft zoals hij is). Beslissing 2 (modi zijn losse instanties)
  blijft, en wordt hier voor het eerst server-side vastgelegd (Beslissing 1
  en 8).
- [ADR 0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md) →
  Beslissing 2. De PIN is niet langer alleen een snelkoppeling in een al
  bestaande sessie, maar een login voor bar-modus op een vertrouwd apparaat
  (Beslissing 7). Beslissing 1 en 3 blijven: het wachtwoord is verplicht en
  werkt altijd, en alleen-PIN is verboden. De PIN zet je voortaan alleen in de
  portal.
- [ADR 0006](0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md):
  aangevuld, niet gewijzigd. De login vanaf de namenlijst is een server-only
  entrypoint met de service-role-client, maar de aanroeper heeft nog geen
  sessie. De databasekant loopt daarom via functies die alleen voor
  `service_role` uitvoerbaar zijn (Beslissing 6).

**Laat ongemoeid:** ADR 0007 (leestoegang per rol), ADR 0008 (maillinks via
`token_hash`, hier hergebruikt), ADR 0009 (portal-cookienaam), ADR 0012, ADR
0013 en ADR 0015. Ook de twee kernbeslissingen uit CLAUDE.md blijven gelden:
geld beweegt alleen via RPC, en `served_by` komt uit de bezetting.

## Context

Het huidige bar-model rust op één gedeelde identiteit. De middleware logt een
gekoppelde tablet in als het device-account (ADR 0011). Een dienst wordt
gestart met de PIN van de starter (`start_shift`). Er is hooguit één open
dienst (`0021`), en `useOpenShift` leest "de" open dienst. De database weet
niet op welk apparaat of in welke sessie een dienst loopt. Elke sessie die
geen lid-sessie is, mag in elke open dienst werken (`0023`).

Bram wil het omgekeerde (spec → Aanleiding en Besloten):

- elk apparaat heeft een eigen, persoonlijke sessie;
- je logt in vanaf een namenlijst, met PIN (alleen op een apparaat waar je
  eerder met je wachtwoord inlogde) of met wachtwoord, zonder e-mailadres te
  typen;
- een dienst hoort bij de sessie of sessies waarin hij gestart of geopend is;
- een beheerderinstelling bepaalt of dat één apparaat, meerdere apparaten in
  één dienst, of meerdere diensten tegelijk is;
- een beheerder kan vanaf een ander apparaat een dienst afsluiten, overnemen
  of een apparaat afmelden;
- een sessie die 60 minuten inactief is, wordt gesloten, met een melding in de
  app voor beheerders.

In het huidige model kan dat niet, want in de database is er geen verschil
tussen twee apparaten. Beide draaien als het device-account, of als een
willekeurige bardienst-sessie zonder band met de dienst.

## Beslissing

**1. Bar-werk gebeurt alleen in een persoonlijke Supabase-sessie van een
niet-gearchiveerd lid met rol `bardienst` of `beheerder`, en die sessie wordt
geregistreerd in een eigen tabel `bar_sessions`.** De sleutel is het claim
`session_id` uit het Supabase-JWT (`auth.jwt()->>'session_id'`). Dat claim
blijft gelijk zolang de browser dezelfde refresh-token-keten gebruikt (dus ook
na browser dicht en weer open), en is anders voor elke nieuwe login. De rij
legt vast wie er ingelogd is, in welke modus (`bar` of `beheer`), wanneer de
sessie voor het laatst actief was, en of en waarom hij beëindigd is. Een
sessie krijgt één modus en houdt die.

**2. Een dienst is gekoppeld aan sessies via `shift_sessions`.** Elke bar-RPC
die een `p_shift_id` meekrijgt (`place_order`, `top_up`, `reverse_order_at_bar`,
`end_shift`, `add_shift_member`, `remove_shift_member`) eist dat de sessie van
de aanroeper een actieve, niet-inactieve `bar_sessions`-rij in modus `bar`
heeft **en** een actieve koppeling met die dienst. Dat is een allowlist en
vervangt de `caller_is_lid()`-denylist. `start_shift` eist een actieve
bar-sessie, neemt het lid van die sessie als starter, vraagt geen PIN meer en
legt de eerste koppeling vast. De login is de authenticatie van de starter.

**3. De drie standen zijn regels over die koppelingen, geen aparte
mechanismen.** Het gaat om de instelling `app_settings.shift_session_mode`
(fase 2, standaard (a); fase 1 is vast (a)):

- (a) hooguit één open dienst, met hooguit één actieve koppeling;
- (b) hooguit één open dienst, met één of meer actieve koppelingen;
- (c) meerdere open diensten, met hooguit één actieve koppeling per dienst.

In alle standen heeft een sessie hooguit één actieve koppeling. `0021`
(hooguit één open dienst) wordt zo een regel van stand (a) en (b) in plaats
van een absolute regel. Het advisory lock uit `0021` blijft het middel tegen
races. Een open dienst zonder actieve koppeling (een wees-dienst) kan in elke
stand ontstaan en levert een melding op (Beslissing 5).

**4. Het einde van een sessie is een database-feit, geen JWT-feit.** Een
beëindigde of te lang inactieve `bar_sessions`-rij laat elke bar- en
beheer-RPC weigeren, ook als het access token nog tot `jwt_expiry` geldig is.
Inactiviteit (60 minuten, een vaste waarde) wordt in de guard berekend
(`now() - last_activity_at`). Een `pg_cron`-job (patroon uit `0025`) legt het
einde daarna vast als boekhouding en maakt de beheerdermelding aan. Dat
gebeurt bewust niet in de guard zelf: een `raise` draait de schrijfactie in
dezelfde transactie terug.

**5. Beheerderingrepen lopen via eigen RPC's met een ADR-0002-actorcheck**
(`auth.uid()` → rol `beheerder`): een dienst afsluiten, een dienst overnemen
(alleen vanuit een bar-sessie op het nieuwe apparaat) en een sessie afmelden.
Het zijn de enige wegen om een dienst te raken zonder koppeling. Een melding
voor beheerders ontstaat altijd als een open dienst zijn laatste actieve
koppeling verliest, ongeacht de oorzaak, en is opgelost zodra een beheerder
overneemt of afsluit.

**6. Inloggen op de bar gebeurt server-side, vanaf een openbare namenlijst.**
De namenlijst (id, naam en rol van alle bardienstleden) komt uit een
server-only entrypoint met de service-role-client, omdat er nog geen sessie is
waarmee RLS iets zou teruggeven. De login krijgt een `member_id` en een
wachtwoord of PIN. De server zoekt het e-mailadres op, maakt de
Supabase-sessie aan in de cookies (`@supabase/ssr`) en registreert haar als
bar-sessie in modus `bar`, vóór de browser de tokens krijgt. De
databasefuncties die dit vóór een sessie doen (`verify_bar_pin`,
`register_bar_session_server`) zijn alleen voor `service_role` uitvoerbaar,
nooit voor `anon` of `authenticated`. Dat is de aanvulling op ADR 0006, dat
uitging van een aanroeper die al een sessie had.

**7. De PIN is een login voor bar-modus, alleen op een vertrouwd apparaat.**
Een apparaat is vertrouwd voor een lid nadat dat lid er via de namenlijst met
het wachtwoord heeft ingelogd. Daarvoor geeft de server een eigen
apparaatcookie uit (`abas_apparaat`, `HttpOnly`, willekeurig token, alleen de
hash in `bar_devices`), met per lid een rij in `bar_device_members`. Een
PIN-login vraagt: vertrouwd apparaat, een PIN, geen lockout (per lid, over
alle apparaten, `pin_failures`), en een juiste PIN. Daarna maakt de server de
sessie aan met `auth.admin.generateLink({ type: 'magiclink' })` en
`verifyOtp({ token_hash })` (geen mail, ADR 0008-patroon). De PIN wordt
gehasht met een hogere kostenfactor dan nu; bestaande hashes worden bij de
volgende geslaagde PIN-login opnieuw gehasht. Een PIN-sessie is altijd een
bar-sessie en komt dus nooit in beheer (Beslissing 1: een sessie wisselt
niet van modus). Het wachtwoord blijft altijd werken.

Het apparaatcookie is geen sleutel voor de dienst. De dienst hangt aan de
sessie (Beslissing 1 en 2). Het cookie bestaat alleen om de PIN aan een
apparaat te binden.

**8. De modus wordt server-side afgedwongen, ook in de beheer-RPC's.** Elke
beheer-RPC eist, naast de actorcheck uit ADR 0002, een actieve sessie in
modus `beheer`. Een sessie in modus `beheer` kan geen bar-RPC aanroepen, en
omgekeerd. Een beheersessie wordt na browser dicht en weer open niet hervat.
Alleen een bar-sessie kan hervat worden, en dan zonder bewijs van wie het
apparaat vasthoudt (Brams keuze).

**Geldlaag: de regels veranderen niet, de toegang wordt strenger.** Bedragen,
saldocontrole, de €500-grens, `served_by` en `reversed_by` uit de bezetting en
het `REVOKE` op geldtabellen blijven zoals ze zijn. Er komen twee voorwaarden
bij: *welke* sessie de RPC mag aanroepen, en (A4) dat `top_up` nooit naar het
lid van de aanroepende sessie gaat, in alle standen. De boekingen krijgen
`bar_session_id`, gevuld door de RPC zelf. Elke nieuwe functie trekt `EXECUTE`
voor `PUBLIC`/`anon` in (`0018`); `rpc_execute_grants.test.sql` bewaakt dat al
voor elke functie.

## Verworpen alternatieven

- **`auth.sessions` rechtstreeks gebruiken in plaats van een eigen tabel.**
  Die rij verdwijnt bij uitloggen, dus de dienst verliest zijn geschiedenis
  (welke sessies werkten erin). Er is geen plek voor modus, sluitreden of
  laatste activiteit, en het `auth`-schema is van GoTrue, niet van ons. Het
  claim `session_id` gebruiken we wel, als sleutel.
- **Een apparaat-id-cookie als sleutel voor de dienst.** Bram koppelt de
  dienst aan de *sessie*, niet aan het apparaat. Een apparaatcookie komt er
  wel, maar alleen voor de PIN-login (Beslissing 7).
- **Een PIN die op elk apparaat werkt.** Vier cijfers met een publieke URL en
  een openbare namenlijst zijn dan geen beveiliging. Iedereen kan het van
  buitenaf proberen, en met een lockout kan iedereen elke bardienst
  buitensluiten. Alleen op een vertrouwd apparaat werkt de PIN, en daarbuiten
  is er geen poging mogelijk.
- **De PIN als Supabase-wachtwoord gebruiken.** Dat vervangt het echte
  wachtwoord, en dat verbiedt ADR 0005 (alleen-PIN).
- **Een e-mailadres laten typen op de bar.** Dat heeft Bram afgewezen (spec →
  vraag 5): je tikt op je naam.
- **Het device-account houden en A3 uitvoeren (`device_accounts`-allowlist).**
  Eén account voor meerdere apparaten geeft ze allemaal dezelfde identiteit.
  Twee tablets op het device-account zijn in de database niet te
  onderscheiden. Dat is precies wat Bram niet wil.
- **De binding alleen in de client** (het dienst-id in `localStorage`, de UI
  toont een andere dienst niet). Dat is niet af te dwingen: de anon-key is
  publiek en elke bardienst-sessie kan de RPC's rechtstreeks aanroepen.
- **Een partiële unique index "één open dienst"** in plaats van de lock uit
  `0021`. Die past niet bij stand (c) en is om dezelfde redenen verworpen als
  in `0021`.

## Gevolgen

- **Geen gedeelde sessie meer.** Wie aan de bar werkt, logt persoonlijk in. De
  bezetting blijft hoe andere aanwezigen meewerken zonder zelf in te loggen.
  `served_by` blijft dus een zwakke zelfopgave, alleen nu binnen een sessie
  van een geïdentificeerd lid in plaats van een anoniem apparaat.
  `bar_sessions.member_id` betekent "ingelogd als", nooit "deed dit".
- **Het starten van een dienst is geen losse PIN-controle meer.** De starter
  is wie ingelogd is. CLAUDE.md → Architectuurbeslissingen ("het *starten*
  van een dienst blijft wél op de eigen PIN van de starter") verandert mee.
- **"Mijn account" verdwijnt uit de bar-shell.** De PIN zet je in de portal.
- **`useOpenShift` leest niet meer "de" open dienst, maar "de dienst van deze
  sessie"** via een RPC, plus in (a) en (b) de dienst die elders loopt.
- **De foutcode `no_bar_role` verschuift van betekenis**: van "dit is een
  lid-sessie" naar "het lid van deze bar-sessie heeft geen bar-rol meer". Een
  lid-sessie krijgt `no_bar_session`. De client behandelt alle sessiecodes
  centraal (spec → RPC's → "Wat er gebeurt met `no_bar_role`").
- **Tablet koppelen** (`/koppel`, `BAR_DEVICE_SECRET`, `abas_tablet`, device
  sign-in in `src/middleware.ts`) en het device-account verdwijnen in dezelfde
  uitrol. Voorwaarde: elke bardienst en beheerder heeft een werkend wachtwoord.
- **Een stille bar wordt een wees-dienst.** Na 60 minuten zonder activiteit
  heeft de dienst geen sessie meer. Een beheerder neemt hem over of sluit hem;
  een bardienst uit de bezetting hervat hem met `resume_orphan_shift` (`0030`,
  spec → vraag 24 (ii)). Een dienst met een actieve koppeling elders blijft
  onaantastbaar.
- **Nieuwe negatieve tests** in `supabase/tests/`: elke bar-RPC weigert zonder
  bar-sessie, met een beëindigde of inactieve sessie, met een sessie in modus
  `beheer`, met een gearchiveerd lid, en met een sessie die niet aan de dienst
  gekoppeld is. Elke beheer-RPC weigert een sessie in modus `bar`. `top_up`
  weigert naar het eigen lid. `verify_bar_pin` weigert zonder vertrouwd
  apparaat en na de lockout, en is niet uitvoerbaar voor `anon` of
  `authenticated`. Per stand de koppelregels. `check:rls` eist dat al voor de
  nieuwe tabellen.
- **Geen nieuwe gate.** Dat elke bar- en beheer-RPC de guard aanroept, is met
  een pgTAP-test over alle RPC's te bewaken (patroon van
  `rpc_execute_grants.test.sql`). Daar is geen scanner voor nodig.
- **Documentatie**: CLAUDE.md, ADR 0002/0003/0005/0006/0011,
  `docs/ARCHITECTURE.md` en `bar-rpc-autorisatie.md` zijn met de bouw van fase
  1 bijgewerkt (spec → "Doorgevoerd in bestaande documenten"). `0021`/`0023`
  blijven ongewijzigd als historie; `0029` vervangt de functies.

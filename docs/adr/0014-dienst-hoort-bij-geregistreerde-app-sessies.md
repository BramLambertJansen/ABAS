# 0014 — Een dienst hoort bij een of meer geregistreerde, persoonlijke app-sessies, niet bij een gedeeld device-account

Status: **concept, wacht op akkoord van Bram** (geschreven 2026-09-29). Hoort
bij [`docs/features/dienst-per-sessie.md`](../features/dienst-per-sessie.md).
Niets hiervan is gebouwd. Welke onderdelen doorgaan hangt af van de open
vragen in die spec; dit ADR legt alleen het mechanisme vast dat alle drie de
standen draagt.

**Vervangt, na akkoord:**

- [ADR 0011](0011-device-sessie-alleen-voor-gekoppelde-tablet.md) (device-sessie
  alleen op een gekoppelde tablet), **als** Bram besluit dat tablet koppelen
  verdwijnt (spec → open vraag 19). Met de guards hieronder kan een
  device-sessie geen bar-werk meer doen, dus ADR 0011 beschermt dan niets meer.
- De A2-denylist (`caller_is_lid()` in de bar-RPC's,
  `0023_bar_rpcs_weigeren_lid.sql`, `docs/features/bar-rpc-autorisatie.md`).
  Die wordt een allowlist. A3 en B3 uit dat document worden daarmee
  gerealiseerd, maar zonder de `device_accounts`-tabel die daar werd
  voorgesteld.

**Amendeert:**

- [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md): stap 3
  ("de eerstvolgende bar-request zonder sessie herstelt de device-sessie")
  vervalt. Ook de zin "gewone bardienst-acties zijn nooit afhankelijk van
  *welke* `authenticated`-identiteit de aanroep doet" vervalt: dat worden ze nu
  juist wel. "Eén actieve Supabase-sessie per browser, een nieuwe login
  vervangt de vorige" blijft staan, en is de basis van "eigen sessie per
  apparaat".
- [ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) →
  Beslissing 3: de PIN-route naar bar-modus via de gedeelde sessie vervalt, en
  andere leden "liften" niet meer op een gedeelde sessie. Ze liften nog wel mee
  op de sessie van wie de dienst opende (de bezetting blijft zoals hij is).
  Beslissing 2 (modi zijn losse instanties) blijft staan. Ze wordt hier voor het
  eerst server-side vastgelegd in de sessieregistratie, zie Beslissing 1.
- [ADR 0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md): **nog
  niet.** Of Brams "de PIN is een persoonlijke inlog die e-mail/wachtwoord
  vervangt" ADR 0005 raakt, hangt af van open vraag 4 in de spec. Dit ADR gaat
  niet over de PIN. Een PIN-login is een eigen beslissing en krijgt een eigen
  ADR zodra Bram de vragen 3 t/m 6 heeft beantwoord.

**Laat ongemoeid:** ADR 0007 (leestoegang per rol), ADR 0009
(portal-cookienaam), ADR 0012 (client-fouten) en ADR 0013. Ook de twee
kernbeslissingen uit CLAUDE.md blijven gelden: geld beweegt alleen via RPC, en
`served_by` komt uit de bezetting.

## Context

Het huidige bar-model rust op één gedeelde identiteit. De middleware logt een
gekoppelde tablet in als het device-account (ADR 0011). Een dienst wordt
gestart met de PIN van de starter (`start_shift`). Er is hooguit één open
dienst (`0021`), en `useOpenShift` leest "de" open dienst. De database weet
niet op welk apparaat of in welke sessie een dienst loopt. Elke sessie die
geen lid-sessie is, mag in elke open dienst werken (`0023`).

Bram wil het omgekeerde (spec → Aanleiding):

- elk apparaat heeft een eigen sessie;
- een dienst hoort bij de sessie of sessies waarin hij gestart of geopend is;
- een beheerderinstelling bepaalt of dat één apparaat, meerdere apparaten in
  één dienst, of meerdere diensten tegelijk is;
- een beheerder kan vanaf een ander apparaat een dienst afsluiten of
  overnemen;
- een inactieve sessie wordt gesloten.

In het huidige model kan dat niet, want in de database is er geen verschil
tussen twee apparaten. Beide draaien als het device-account, of als een
willekeurige bardienst-sessie zonder band met de dienst.

## Beslissing (concept)

**1. Bar-werk gebeurt alleen in een persoonlijke Supabase-sessie van een
niet-gearchiveerd lid met rol `bardienst` of `beheerder`, en die sessie wordt
geregistreerd in een eigen tabel `bar_sessions`.** De sleutel is het claim
`session_id` uit het Supabase-JWT (`auth.jwt()->>'session_id'`). Dat claim
blijft gelijk zolang de browser dezelfde refresh-token-keten gebruikt (dus ook
na browser dicht en weer open), en is anders voor elke nieuwe login. Daarmee is
"een apparaat" in de database: één browserprofiel met één ingelogde
Supabase-sessie. De rij legt vast wie er ingelogd is, in welke modus (`bar` of
`beheer`), wanneer de sessie voor het laatst actief was, en of en waarom hij
beëindigd is.

**2. Een dienst is gekoppeld aan sessies via `shift_sessions`.** Elke bar-RPC
die een `p_shift_id` meekrijgt (`place_order`, `top_up`, `reverse_order_at_bar`,
`end_shift`, `add_shift_member`, `remove_shift_member`) eist dat de sessie van
de aanroeper een actieve, niet-inactieve `bar_sessions`-rij in modus `bar`
heeft **en** een actieve koppeling met die dienst. Dat is een allowlist en
vervangt de `caller_is_lid()`-denylist. `start_shift` eist een actieve
bar-sessie en legt de eerste koppeling vast.

**3. De drie standen zijn regels over die koppelingen, geen aparte
mechanismen.** Het gaat om de instelling `app_settings.shift_session_mode`:

- (a) hooguit één open dienst, met precies één actieve koppeling;
- (b) hooguit één open dienst, met één of meer actieve koppelingen;
- (c) meerdere open diensten, met hooguit één actieve koppeling per sessie.

`0021` (hooguit één open dienst) wordt zo een regel van stand (a) en (b) in
plaats van een absolute regel. Het advisory lock uit `0021` blijft het middel
tegen races.

**4. Het einde van een sessie is een database-feit, geen JWT-feit.** Een
beëindigde of te lang inactieve `bar_sessions`-rij laat elke bar-RPC weigeren,
ook als het access token nog tot `jwt_expiry` geldig is. Inactiviteit wordt in
de guard berekend (`now() - last_activity_at`). Een `pg_cron`-job (patroon uit
`0025`) legt het einde daarna vast als boekhouding en maakt de
beheerder-melding aan. Dat gebeurt bewust niet in de guard zelf: een `raise`
draait de schrijfactie in dezelfde transactie terug.

**5. Beheerderingrepen lopen via eigen RPC's met een ADR-0002-actorcheck**
(`auth.uid()` → rol `beheerder`). Het gaat om afsluiten en overnemen van een
dienst waar de eigen sessie niet aan gekoppeld is. Het zijn de enige wegen om
een dienst te raken zonder koppeling.

**Geldlaag: de regels veranderen niet, de toegang wordt strenger.** Bedragen,
saldocontrole, de €500-grens, `served_by` en `reversed_by` uit de bezetting en
het `REVOKE` op geldtabellen blijven zoals ze zijn. Er komt één voorwaarde bij:
*welke* sessie de RPC mag aanroepen. Elke nieuwe functie trekt `EXECUTE` voor
`PUBLIC`/`anon` in (`0018`); `rpc_execute_grants.test.sql` bewaakt dat al voor
elke functie.

## Verworpen alternatieven

- **`auth.sessions` rechtstreeks gebruiken in plaats van een eigen tabel.**
  Die rij verdwijnt bij uitloggen, dus de dienst verliest zijn geschiedenis
  (welke sessies werkten erin). Er is geen plek voor modus, sluitreden of
  laatste activiteit, en het `auth`-schema is van GoTrue, niet van ons. Het
  claim `session_id` gebruiken we wel, als sleutel.
- **Een apparaat-id-cookie als sleutel** (een opvolger van `abas_tablet` met
  status in de database). Bram koppelt de dienst aan de *sessie*, niet aan het
  apparaat. Een apparaat-id is alleen nodig als een PIN-login aan een apparaat
  gebonden moet worden (spec → open vraag 3). Dat is een aparte beslissing.
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
- **Het starten van een dienst is geen losse PIN-controle meer**, als Bram
  vraag 5 zo beantwoordt. De starter is dan wie ingelogd is. CLAUDE.md →
  Architectuurbeslissingen ("het *starten* van een dienst blijft wél op de
  eigen PIN van de starter") moet dan mee veranderen.
- **`useOpenShift` leest niet meer "de" open dienst, maar "de dienst van deze
  sessie"**, plus in (a) en (b) de dienst die elders loopt.
- **`orders`, `top_ups` en `order_reversals` krijgen een nullable
  `bar_session_id`** (spec → open vraag 18), zodat per apparaat of kaslade
  terug te vinden is wat er geboekt is. Dat kan niet achteraf worden
  gereconstrueerd.
- **Tablet koppelen** (`/koppel`, `BAR_DEVICE_SECRET`, `abas_tablet`, device
  sign-in in `src/middleware.ts`, het device-account) werkt technisch nog wel,
  maar kan geen bar-RPC meer aanroepen: het device-account heeft geen
  `members`-rij en dus geen bar-sessie. Verwijderen is een actiepunt (spec →
  Tablet koppelen), geen onderdeel van dit ADR.
- **Nieuwe negatieve tests** in `supabase/tests/`: elke bar-RPC weigert zonder
  bar-sessie, met een beëindigde of inactieve sessie, met een sessie in modus
  `beheer`, met een gearchiveerd lid, en met een sessie die niet aan de dienst
  gekoppeld is. Per stand de koppelregels. `check:rls` eist dat al voor de
  nieuwe tabellen.
- **Geen nieuwe gate.** Dat elke bar-RPC de guard aanroept, is met een
  pgTAP-test over alle bar-RPC's te bewaken (patroon van
  `rpc_execute_grants.test.sql`). Daar is geen scanner voor nodig.
- **Documentatie, na akkoord:** CLAUDE.md → Architectuurbeslissingen (de
  alinea over `served_by` noemt "één bardienst-tablet, één Supabase-sessie") en
  → Auth. In `docs/ARCHITECTURE.md` worden "Shared bar-tablet session
  mechanism", "Device sign-in mechanism", "Dienst & bezetting" en "Auth-methode
  & modus" herschreven.

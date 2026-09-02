# Auth-methode per lid + dual-mode login (bar via e-mail)

Conceptspec voor [issue #42](https://github.com/BramLambertJansen/ABAS/issues/42).
**Nog niet goedgekeurd door Bram** — bevat één echte openstaande vraag (zie
"Openstaande vragen voor Bram" hieronder) die vóór de Developer begint moet
worden beantwoord, per CLAUDE.md → Werkstraat.

Voert **[ADR 0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)**
volledig uit — het deel dat #14 bewust niet bouwde (zie ADR 0003 →
scope-splitsing en `docs/ARCHITECTURE.md` → "Auth-methode & modus"). Bouwt
voort op **[ADR 0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)**
(de sessie zelf: één actieve Supabase Auth-sessie per browser, een nieuwe
login vervangt de vorige) en op het al gemergede `/beheer`
(`docs/features/assortimentbeheer.md`, issue #14). Lees beide ADR's en
`assortimentbeheer.md` eerst — deze spec herhaalt hun motivatie niet, alleen
het generaliseren ervan.

**Geen nieuwe ADR.** Elke beslissing hieronder is een toepassing van ADR 0003
op een concreet datamodel/schermflow, geen nieuw architectuurprincipe. Eén
punt (Datamodel → "Let op voor toekomstige features") is subtiel genoeg om
expliciet uit te schrijven zodat een latere feature (#15/#24) het niet mis
leest, maar het weerspreekt ADR 0003 niet — het past het toe.

## Openstaande vragen voor Bram

Twee punten die deze conceptspec **niet** zelf invult, per CLAUDE.md →
Werkstraat ("geen aanname, geen placeholder"):

1. **Navigatie-ingang naar e-mail-login vanaf de bar-shell root — geen
   bruikbaar ontwerp gevonden.** Zie "Onderzocht in /designs/" hieronder voor
   wat wél bestaat en waarom het niet 1-op-1 toepasbaar is. Schermflow →
   stap 0 hieronder beschrijft een concreet voorstel (subtiele tekstlink
   onder de stafkeuze-grid, zelfde soort understatement als de bestaande
   "← terug naar bardienst"-link) zodat er iets is om op te reageren — dit is
   een **voorstel, geen besluit**. Graag akkoord of een alternatief van Bram
   vóór de Developer de schermtekst/positie bouwt.
2. **"Terug naar PIN" blijft geblokkeerd zonder al bestaande `pin_hash`.**
   Deze spec bouwt geen "geef dit lid een (nieuwe) pincode"-functie (zie
   Datamodel/RPC's/Expliciet buiten scope). Een lid dat naar e-mail/
   wachtwoord overstapt kán dus alleen terug naar PIN als er nog een oude,
   werkende `pin_hash` bestaat — nooit voor een lid dat nog nooit een PIN
   had (bijv. rechtstreeks met een e-mailaccount aangenomen). Dat is een
   bewuste, kleinere bouw dan "volledig vrij wisselen", **niet** wat het
   ticket letterlijk zegt ("je kan zelf instellen ... of pin of email/ww"),
   dus dit vraagt expliciet Bram's akkoord, niet alleen een architectuur-
   redenering. Zie Randgevallen voor de volledige afweging.

Alle overige vragen die de issue zelf opwierp (waar wordt dit ingesteld, wat
is het default-gedrag, blijft een e-mail-lid zichtbaar in StaffPicker) zijn
hieronder beantwoord vanuit ADR 0003/bestaande code — zie "Besloten door de
Architect" voor de motivatie per punt.

## Onderzocht in /designs/

`designs/Bar App.dc.html` heeft twee elementen die op het eerste gezicht
lijken te passen, maar geen van beide is het gevraagde dual-entry-scherm:

- **"Anders inloggen"-sheet** (`methodSheetOpen`, regel 1449–1467, bereikbaar
  via "Staat je naam er niet bij?"/"pincode vergeten?"): e-mail/wachtwoord en
  magic link staan hier expliciet geframed als **noodingang voor dezelfde
  identiteit** wanneer de normale tik-plus-pincode niet lukt ("Normaal tik je
  jezelf aan en typ je je pincode. Deze twee zijn voor als dat niet lukt.",
  regel 1454) — niet als een permanente, exclusieve alternatieve methode per
  lid. Dat is een ander model dan wat Bram voor #42 heeft vastgesteld (ADR
  0003: een blijvende, exclusieve per-lid keuze, geen fallback-voor-hetzelfde-
  account). Dit scherm is dus geen bruikbaar ontwerp voor de navigatie-ingang
  zelf, wel voor losse stijlelementen (zie Schermflow stap 0's voorstel,
  hieronder, dat er wél de vorm — subtiele understatement-link + sheet — van
  leent).
- **Modus-keuzekaart** (`showModeChoice`, regel 1334–1354: "Bardienst
  draaien"/"Beheer", twee kaarten met icoon + korte uitleg): dit *is* een
  bruikbaar visueel precedent voor Schermflow stap 2 hieronder (de
  bar/beheer-keuze na e-mail-login) — zie daar. Maar in het ontwerp verschijnt
  deze kaart na **elke** identificatie (ook na PIN), wat een ander mechanisme
  is dan ADR 0003 vastlegt (PIN-flow krijgt bewust geen modus-keuze, zie
  `docs/features/dienst-starten.md` → Expliciet buiten scope, amendement).
  Deze spec hergebruikt dus alleen de kaart-vorm, niet het bredere
  triggermoment uit het ontwerp.

`designs/Lid App.dc.html` (portal, `loginMethods`: wachtwoord/pincode/
maillink, regel 140/447/600) is een ander scherm voor een ander doel (leden
die zelf op hun telefoon inloggen, "pincode is een sneltoets, geen vervanging
van het account" — regel 447) — niet van toepassing op bar/beheer-personeel.

Geen van beide bestanden toont dus het per-lid-exclusieve either/or-model of
de daadwerkelijke navigatie-ingang vanaf de bar-shell root — vandaar
Openstaande vraag 1 hierboven.

## Doel

Elk lid met rol `bardienst` of `beheerder` kan zelf, op het eigen account,
kiezen tussen PIN en e-mail/wachtwoord als inlogmethode — nooit allebei
tegelijk, geen systeembrede instelling (ADR 0003 → Beslissing 1). Na een
succesvolle e-mail/wachtwoord-login kiest de ingelogde persoon een echte
modus — **Bar** of **Beheer** — in plaats van (zoals #14 bouwde) altijd
rechtstreeks naar de productenlijst te gaan. **Bar**-modus is, hoe ook
ingelogd, functioneel identiek aan de bestaande PIN-flow (#6/#7): zelfde
`start_shift`/`add_shift_member`/`remove_shift_member`, zelfde
`served_by`-attributie uit de bezetting — dit ticket bouwt geen tweede
bar-mechanisme, het opent alleen een tweede weg ernaartoe (ADR 0003 →
Beslissing 3).

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6/#7/#14: er is geen dienst- of
beheerconcept in `shells/portal`, en portal-login blijft ongewijzigd
e-mail-only (CLAUDE.md → Auth; ADR 0003 → Beslissing 1, "leden met alleen de
`lid`-rol vallen hier buiten").

Raakt drie bestaande plekken, geen van alle als herbouw:

- **`src/features/dienst-starten/DienstStarten.tsx`** — krijgt de nieuwe
  navigatie-ingang (Schermflow stap 0). De PIN-staffkeuze/PinPad zelf zijn
  ongewijzigd (#6, `docs/features/dienst-starten.md` blijft geldig).
- **`src/features/assortimentbeheer/`** (`Assortimentbeheer.tsx`,
  `BeheerLogin.tsx`, en de sessiehook `useBeheerSession.ts`) — worden
  gegeneraliseerd van "beheerder-only" naar "bardienst-of-beheerder", plus een
  nieuwe modus-keuze-stap ertussen. Zie Schermflow stap 1–2 en
  "Wijziging aan bestaande bestanden" hieronder voor de precieze scope
  daarvan; `BeheerTabs.tsx`/`ProductenLijst.tsx`/`LedenLijst.tsx`/
  `NegatieveLimietInstellingen.tsx` zelf blijven **ongewijzigd** — ze worden
  na de modus-keuze precies zo gerenderd als vandaag.
- **`src/features/ledenbeheer/LidBeherenOverlay.tsx`** — krijgt een nieuwe
  "Inlogmethode"-sectie, zie Schermflow stap 3.

**Route: `/beheer` blijft ongewijzigd, wordt niet hernoemd.** Overwogen
(bv. `/inloggen`, `/personeel`) omdat de route nu ook de weg naar Bar-modus
is, niet meer alleen naar Beheer. Verworpen: (1) `shells/bar` is installable
als PWA (CLAUDE.md → Shells) — in standalone-modus is er geen adresbalk, dus
geen gebruiker ziet deze URL ooit; het is een louter interne naam. (2)
Hernoemen zou de magic-link-redirect-URL raken die aan de Supabase-project-
kant is toegestaan (ADR 0002 → Beslissing, `signInWithOtp()`/callback-route)
— een deploy-configuratiewijziging voor een voordeel dat niemand ziet. Wel
wijzigt de **tekst** op het scherm: de letterlijke kop "Beheer" in
`BeheerLogin.tsx` (regel 62) verdwijnt vóór een modus gekozen is — zie
Schermflow stap 1.

## Datamodel

Nieuwe migratie `supabase/migrations/0008_auth_methode_per_lid.sql`
(opeenvolgend na `0007_ledenbeheer.sql`).

- **Nieuw enum-type `member_auth_method` (`'pin'`, `'email'`).**
- **Nieuwe kolom `members.auth_method member_auth_method not null default
  'pin'`.** Default `'pin'` dekt letterlijk het ticket-acceptatiecriterium
  "bestaande leden die nog nooit een keuze maakten: blijven gewoon PIN
  gebruiken" — geen migratie-datawijziging nodig, iedere bestaande rij krijgt
  de kolomdefault. `members` staat al in de blanket-`REVOKE` sinds
  `0001_init.sql` — geen nieuwe REVOKE nodig (zelfde constatering als
  `ledenbeheer.md` → Datamodel voor `role`/`archived`).
- **Geen wijziging aan `pin_hash`/`auth_user_id` zelf.** Met name: **een
  overstap naar `'email'` wist `pin_hash` niet.** Dat is bewust anders dan
  hoe `supabase/seed.sql` Femke Bos vandaag handmatig behandelt (haar
  `pin_hash` wordt daar expliciet leeggemaakt zodra ze een
  `auth_user_id` krijgt, met het commentaar "zodat een lid nooit een
  werkende PIN houdt naast een wachtwoord") — dat was de enige beschikbare
  manier om "nooit allebei" af te dwingen *vóórdat* deze kolom bestond. Met
  `auth_method` erbij hoeft dat niet meer: mutual exclusivity wordt
  afgedwongen door de **RPC's** (`start_shift` controleert `auth_method`,
  zie hieronder), niet door de data te vernietigen. Reden om `pin_hash` te
  bewaren: het is de enige manier waarop Openstaande vraag 2's "terug naar
  PIN"-pad ooit kan werken zonder een nieuwe "PIN uitgeven"-RPC te bouwen
  (zie RPC's → `set_member_auth_method`). **Developer-actie**: `seed.sql`'s
  Femke-Bos-blok moet worden bijgewerkt — `auth_method = 'email'` zetten in
  plaats van/naast `pin_hash = null` — zodat de seed het nieuwe mechanisme
  gebruikt in plaats van de oude workaround. Dit is een implementatiedetail,
  geen architectuurkeuze.

**Let op voor toekomstige features (#15/#24):** `auth_method` is losgekoppeld
van `auth_user_id is not null`. Een lid kan een gekoppeld Supabase
Auth-account hebben (bv. een `bardienst`-lid met **ook** een portal-account,
of een lid wiens `auth_user_id` is gezet maar dat zelf nog voor `'pin'`
gekozen heeft) zonder dat dat betekent "kiest e-mail voor bar/beheer-
toegang". Omgekeerd is een gekoppeld account wél een **voorwaarde** om naar
`'email'` te mogen overstappen (zie RPC's → `no_linked_account`). Een
toekomstige feature die aanneemt dat "heeft `auth_user_id`" hetzelfde is als
"logt in met e-mail voor bar/beheer" leest dit verkeerd — dat is precies het
scenario dat deze spec voorkomt door een los veld te introduceren in plaats
van op `auth_user_id`'s aan/afwezigheid te leunen.

## RPC's

Nieuwe migratie, zelfde ADR-0002-actorcheck-vorm als
`set_member_role`/`set_member_archived` (1-op-1 gekopieerd, inclusief het
verplichte `select * into v_actor`-patroon):

- **`set_member_auth_method(p_member_id uuid, p_auth_method text) returns
  members`** — nieuw, beheerder-only. Na de actor-check: lid bestaat →
  anders `member_not_found`; `p_auth_method` (getrimd) is `'pin'` of
  `'email'` → anders `invalid_auth_method` (server-fallback, de UI biedt zelf
  maar twee opties aan, zelfde soort verdediging als `invalid_role`). Dan,
  per gekozen waarde:
  - **Naar `'email'`**: vereist `auth_user_id is not null` → anders
    `no_linked_account`. Er is geen self-service-koppeling in dit ticket
    (zie Expliciet buiten scope) — een lid krijgt een `auth_user_id` zoals
    #14 dat al voor beheerders regelde: handmatig geprovisioned (Supabase
    Studio/CLI, `docs/ARCHITECTURE.md` → "Provisioning voor #14"), nu ook
    toegepast op `bardienst`-leden die voor e-mail kiezen.
  - **Naar `'pin'`**: vereist `pin_hash is not null` → anders `no_pin_set`.
    Zie Openstaande vraag 2 — dit ticket bouwt geen "geef een nieuwe PIN"-pad,
    dus dit pad werkt alleen voor een lid dat ooit al een PIN had.
  - Idempotent: dezelfde waarde opnieuw sturen slaagt (geen wijziging, geen
    fout) — zelfde verdraagzaamheid als `set_member_role`. Update alleen
    `members.auth_method` — raakt nooit `pin_hash`/`auth_user_id`/`role`/
    `balance_cents`/`archived`.
  - **Geen zelfreferentie-guard nodig** (in tegenstelling tot
    `set_member_role`/`set_member_archived`'s `self_demote_forbidden`/
    `self_archive_forbidden`): `auth_method` bepaalt nooit of een sessie
    `/beheer` mag gebruiken (dat blijft `auth.uid()` → `role = 'beheerder'`,
    ongewijzigd) — een beheerder die de eigen `auth_method` wijzigt kan
    zichzelf dus niet buitensluiten van een RPC-aanroep zoals bij die twee
    andere velden wel het risico was.
- **`start_shift(p_member_id, p_pin)` — bestaande RPC, wijziging.** Voegt één
  voorwaarde toe aan de bestaande PIN-check (`0001_init.sql`/
  `0002_fix_start_shift_pgcrypto_search_path.sql`, regel 34): naast
  `pin_hash is null or crypt(...) <> pin_hash` faalt de RPC nu **ook** als
  `v_member.auth_method <> 'pin'`, met exact dezelfde `invalid_pin`-fout —
  geen nieuwe foutcode, zelfde "lekt niet of er een PIN bestaat of welke
  methode gekozen is"-redenering als `docs/features/dienst-starten.md` →
  Randgevallen al vaststelt voor "lid heeft nog nooit een PIN gekregen". Dit
  is de daadwerkelijke handhaving van "nooit allebei tegelijk" (ADR 0003):
  zonder deze wijziging zou een lid met een oude, nog intacte `pin_hash` een
  dienst kunnen starten via PIN **terwijl** de eigen instelling op `'email'`
  staat. Nieuwe, opeenvolgend genummerde migratie
  (`create or replace function`, zelfde signatuur — geen nieuwe `grant`
  nodig, zelfde patroon als `bezetting-beheren.md`'s
  `remove_shift_member`-fix). **Dit moet met naam terugkomen in Developer's
  PR-beschrijving en Tester's testplan** — het is de enige wijziging aan een
  bestaande, geld-aangrenzende RPC in deze spec (`start_shift` zelf beweegt
  geen geld, maar is de poort naar de bezetting die `served_by` bepaalt).
- `grant execute on function set_member_auth_method to authenticated;` —
  zelfde grant-regel als de andere beheerder-only RPC's.
- **Geen wijziging aan `place_order`/`top_up`/`add_shift_member`/
  `remove_shift_member`.** Bevestigt het ticket se eigen "buiten scope"-punt:
  `served_by`-attributie en de bezetting-RPC's blijven functioneel exact
  zoals ze zijn — alleen de weg náár de bezetting toe (wie mag een dienst
  starten, via welke inlogmethode) verandert.

## Leeshook-wijziging

**`useBarStaff()` (`src/hooks/queries/useBarStaff.ts`) — wijziging, geen
nieuwe hook.** Voegt `.eq("auth_method", "pin")` toe aan de bestaande query
(naast de al bestaande `role in (...)`/`archived = false`-filters). De hook
heeft dit filterprincipe al expliciet in zijn eigen commentaar staan
("filtering here is just so the staff-picker doesn't offer a choice that can
only fail") — dit is een letterlijke toepassing daarvan, geen nieuw idee: een
lid op `auth_method = 'email'` kan, na de `start_shift`-wijziging hierboven,
nooit meer via PIN inloggen, dus tonen in de PIN-stafkeuze zou altijd op een
mislukte poging uitlopen. **Dit beantwoordt de issue's eigen open vraag**
("blijft die persoon zichtbaar in StaffPicker, of verdwijnt de rij") —
verdwijnt, met exact dezelfde motivatie als de hook al voor archief/rol
hanteert. Het type `BarStaffMember` en de selecterende kolommen (`id, name,
role`) blijven ongewijzigd — `auth_method` wordt alleen gefilterd op, niet
teruggegeven.

`useAlleLeden()`/`LedenbeheerLid` (ledenbeheer's eigen leeshook) krijgt een
nieuw veld: `authMethod: "pin" | "email"` — nodig voor `LidBeherenOverlay.tsx`
om de huidige instelling vooraf in te vullen (zelfde patroon als `role`
daarvoor al deed).

## Schermflow

0. **Navigatie-ingang op de bar-shell root** (`DienstStarten.tsx`,
   `barStaff.status === "ready" && !selectedStaff`-tak, dus alleen op het
   "Wie start de dienst?"-stafkeuzescherm, niet tijdens PIN-invoer). **Zie
   Openstaande vraag 1** — het volgende is een voorstel, geen besluit:
   een subtiele tekstlink onder de `StaffPicker`-grid, bijvoorbeeld
   "Inloggen met e-mail" (exacte bewoording aan Bram/Developer), stijl
   vergelijkbaar met de bestaande "← terug naar bardienst"-link in
   `BeheerLogin.tsx` (kleine, gedempte tekst, geen prominente knop — dit is
   een secundaire ingang, de PIN-stafkeuze blijft de primaire) — naar `/beheer`
   (route ongewijzigd, zie Betrokken shell). Alleen zichtbaar op de
   stafkeuze-staat, niet tijdens een open dienst (dan toont dit scherm sowieso
   `DienstTabs`, geen stafkeuze meer).
1. **`/beheer`, geen sessie** (`BeheerLogin.tsx`, gegeneraliseerd): zelfde
   inlogformulier als vandaag (e-mail + magic link/wachtwoord, ongewijzigd),
   **min de letterlijke "Beheer"-kop** (regel 62) — die impliceert nu ten
   onrechte dat dit alleen naar beheer leidt. Vervangen door een neutrale kop,
   bv. "Inloggen" (exacte tekst aan Developer, geen architectuurkeuze).
   `deniedMessage`-tekst wordt eveneens generieker: niet meer "kan het
   assortiment niet beheren" als default-afwijzing vóór een rol bekend is
   (dat blijft wél de boodschap ván de individuele RPC's als iemand zonder
   beheerder-rol op "Beheer" tikt, zie stap 2) — zie Rolzichtbaarheid voor de
   exacte tekst-mapping.
2. **`/beheer`, sessie herleidt naar een actieve `bardienst`- of
   `beheerder`-rij** (`useBeheerSession.ts` gegeneraliseerd — controleert nu
   `role in ('bardienst','beheerder')` in plaats van alleen `'beheerder'`,
   zie Rolzichtbaarheid): **nieuw modus-keuzescherm**, in plaats van
   rechtstreeks naar de productenlijst (dat verving #14's tijdelijke
   "geen bar-knop"-beslissing, ADR 0003 → scope-splitsing, nu ingehaald).
   Twee gelijkwaardige tegels/kaarten (visuele vorm leent van het ontwerp's
   `showModeChoice`, regel 1334–1354 — zie "Onderzocht in /designs/"):
   - **"Bar"** — onderschrift bijv. "Verkopen, saldo's opwaarderen,
     bestellingen aanpassen" (letterlijk uit het ontwerp, regel 1344, blijft
     inhoudelijk kloppen). Tik → cliëntside navigatie naar `/` (de bar-shell
     root). **Geen nieuwe sessiestap** — de al actieve e-mail-sessie
     (ADR 0002's vervang-mechanisme) is dezelfde `authenticated`-sessie die
     `DienstStarten`/`start_shift`/`add_shift_member`/`place_order` al
     accepteren, ongeacht welke identiteit erachter zit (ADR 0002 →
     Beslissing: "Gewone bardienst-acties... nooit afhankelijk van welke
     `authenticated`-identiteit de aanroep doet"). `/` rendert vanaf dat
     moment precies zoals het vandaag al doet voor de gedeelde
     device-sessie — geen enkele wijziging aan `DienstStarten.tsx` voor dit
     pad zelf (buiten stap 0's nieuwe link).
   - **"Beheer"** — onderschrift ongewijzigd uit de bestaande copy. Tik →
     toont `BeheerTabs` (ongewijzigd), **ongeacht** of dit specifieke lid
     `bardienst` of `beheerder` is (zie Rolzichtbaarheid voor waarom dit
     bewust geen rolcheck vooraf krijgt — consistent met hoe `/beheer` dat nu
     al voor "ingelogd maar geen beheerder" doet).
   - Geen "terug"-stap nodig hier vóór een keuze — de enige weg terug is
     uitloggen (ADR 0003 → Beslissing 2, geen wisselknop). Een
     "uitloggen"-link is op dit scherm zelf aanwezig (zelfde
     `supabase.auth.signOut()` als vandaag).
3. **Bar-modus, eenmaal op `/`**: identiek aan de bestaande PIN-flow-schermen
   (#6/#7/#8/#10/#12) — geen enkel scherm daarbinnen weet of de actieve
   sessie de gedeelde device-sessie is of een persoonlijke e-mail-sessie, en
   dat hoeft ook niet (ADR 0002/0003).
4. **Beheer-modus**: identiek aan vandaag (`BeheerTabs.tsx`, ongewijzigd) —
   de "← terug naar bardienst"-link (`BeheerTabs.tsx` regel 51) blijft
   bestaan maar navigeert nu naar een bar-shell root die, als de sessie nog
   actief is, gewoon Bar-modus (`DienstStarten`/`DienstTabs`) toont via
   dezelfde sessie — geen gedragswijziging aan die link zelf, alleen aan wat
   er "toevallig" achter `/` zit zodra deze spec is gebouwd (voorheen kon
   diezelfde link ook al, incidenteel, bar-schermen tonen via een
   beheerder-sessie — zie Randgevallen — dit ticket maakt dat gedrag
   opzettelijk en zichtbaar in plaats van een toevallige bijwerking).
5. **Uitloggen** (vanaf modus-keuze, Bar-modus is er geen uitlog-affordance
   nodig bovenop wat #6/#7/#12 al bieden, Beheer-modus ongewijzigd): zelfde
   `supabase.auth.signOut()` + `src/middleware.ts`'s bestaande
   `if (!session)`-herstel van de gedeelde device-sessie, ongewijzigd.
6. **Inlogmethode wijzigen** (`LidBeherenOverlay.tsx`, nieuwe sectie, alleen
   zichtbaar wanneer `member.role` — de laatst **opgeslagen** rol, niet een
   nog niet opgeslagen keuze in de Barrechten-select ernaast — `'bardienst'`
   of `'beheerder'` is; niet zichtbaar voor `'lid'`, per ADR 0003 →
   Beslissing 1): een keuzerij met twee opties, **PIN** en **E-mail &
   wachtwoord**, vooringevuld op `member.authMethod`. "Opslaan" pas actief
   bij een afwijkende keuze (zelfde "wijkt af van huidige waarde"-patroon als
   Naam/Barrechten in dezelfde overlay). Tik op "Opslaan" → direct
   `set_member_auth_method`. Succes-toast: **"Inlogmethode bijgewerkt"**.
   Mislukt (`no_linked_account`/`no_pin_set`) → Nederlandse foutmelding
   binnen deze actie via `role="alert"`, select springt terug naar de huidige
   waarde, de rest van de overlay blijft bruikbaar (zelfde
   "isoleer de fout tot deze actie"-patroon als `set_member_role`'s
   `self_demote_forbidden`-afhandeling in dezelfde overlay).

## Rolzichtbaarheid

**`/beheer` zelf is nu bereikbaar voor elke sessie die herleidt naar een
actieve `bardienst`- of `beheerder`-rij**, niet meer alleen `beheerder` — dat
is precies waarom stap 1/2 hierboven de bestaande `useBeheerSession.ts`
generaliseert. Verdediging blijft in twee lagen, zelfde vorm als
`assortimentbeheer.md` → Rolzichtbaarheid al vaststelde:

- **Sessieniveau** (nieuw, generieker): geen actieve `members`-rij, of rol is
  `'lid'` → "denied"-scherm, tekst wordt bijvoorbeeld "dit account heeft geen
  bar- of beheerrechten — vraag een beheerder" (generieker dan de huidige
  beheerder-specifieke tekst, exacte bewoording aan Developer). Rol
  `bardienst`/`beheerder` → modus-keuze (stap 2).
- **RPC-niveau** (ongewijzigd): kiest iemand met rol `bardienst` voor
  "Beheer", dan faalt elke schrijfactie in `BeheerTabs` alsnog op
  `no_admin_role` — exact zoals vandaag al gebeurt voor een lid dat toevallig
  inlogt zonder beheerder-rol (`assortimentbeheer.md` → Rolzichtbaarheid,
  "dat is bewust gedrag, geen gat"). Er is dus bewust **geen** rolcheck vóór
  het tonen van de "Beheer"-tegel zelf — zelfde consistente
  "RPC handhaaft, scherm filtert niet vooraf"-lijn als de rest van deze
  codebase (`start_shift`, `add_shift_member`, alle beheerder-only RPC's).
- **Bar-modus**: geen wijziging — iedereen die `/` bereikt met een
  `authenticated`-sessie (device- of persoonlijk) ziet dezelfde schermen,
  zelfde vertrouwensmodel als `docs/ARCHITECTURE.md` → "Shared bar-tablet
  session mechanism" al vaststelt.

De **"Inlogmethode"-sectie** in `LidBeherenOverlay.tsx` is alleen bereikbaar
via een actieve **beheerder**-sessie op `/beheer` (ongewijzigd t.o.v. de rest
van Ledenbeheer — `set_member_auth_method` is beheerder-only, zelfde
`no_admin_role`-pad).

## Randgevallen

- **Lid met `auth_method = 'email'` maar (nog) geen `auth_user_id`** — kan
  in theorie niet ontstaan via `set_member_auth_method` zelf
  (`no_linked_account` blokkeert dat), maar wel als een beheerder later
  handmatig (Supabase Studio) een `auth_user_id` weer loskoppelt. Niet apart
  afgevangen door deze spec — zelfde soort "handmatige actie buiten de RPC
  om kan een inconsistente staat veroorzaken"-acceptatie als elders (bv.
  `actor_not_found` voor een losgeraakte koppeling).
- **Lid met `auth_method = 'pin'` maar `pin_hash is null`** (nooit een PIN
  gehad, of gearchiveerd/nieuw aangemaakt lid dat inmiddels bardienst is) —
  bestaand gedrag, ongewijzigd: verschijnt (na de `useBarStaff()`-wijziging)
  gewoon in de stafkeuze (auth_method is `'pin'`), maar elke PIN-poging faalt
  op `invalid_pin`, zelfde niet-onderscheidende boodschap als
  `docs/features/dienst-starten.md` al vaststelt voor "lid heeft nog nooit
  een PIN gekregen" — dit ticket introduceert dat gat niet, het bestond al
  vóór #42 (nieuwe leden krijgen sowieso `pin_hash = null` via
  `create_member`, zie `ledenbeheer.md` → RPC's) en blijft een bekende,
  buiten-scope aanname: PIN-uitgifte voor een gloednieuw bardienst/
  beheerder-lid is sowieso altijd al handmatig (Supabase Studio), net als
  e-mailaccount-koppeling.
- **"Terug naar PIN" zonder oude `pin_hash`** — zie Openstaande vraag 2:
  `set_member_auth_method` geeft `no_pin_set`, geen crash, duidelijke
  Nederlandse boodschap (bv. "dit lid heeft nog nooit een pincode gehad —
  neem contact op om er een in te laten stellen", exacte tekst aan
  Developer/Bram).
- **Bestaand "toevallig bar-toegankelijk via beheerder-sessie"-gedrag vóór
  deze spec**: zoals Schermflow stap 4 noemt, kon "← terug naar bardienst"
  al vóór #42 een actieve beheerder-sessie meenemen naar `/`, wat al werkte
  omdat geen enkele bar-RPC ooit naar identiteit keek (ADR 0002). Dit was
  nooit als scherm getest/gedocumenteerd als een "modus" — deze spec maakt
  het voor het eerst een benoemd, getest pad (zie A11y hieronder) in plaats
  van een niet-geteste bijwerking.
- **Lid wisselt eigen inlogmethode terwijl het op de actieve bezetting
  staat** — `set_member_auth_method` raakt `shift_members`/
  `is_shift_member()` niet, zelfde soort "geen cascade naar bezetting"-
  precedent als `ledenbeheer.md` → Randgevallen al vaststelt voor rol-/
  archiefwijziging tijdens een dienst. Geen nieuw gedrag om te specificeren.
- **`invalid_auth_method`** — niet bereikbaar via de UI (de select biedt
  zelf maar twee waarden), server-fallback zelfde soort verdediging als
  `invalid_role`.
- **A11y**: `e2e/a11y.spec.ts` moet uitgebreid worden met (a) de nieuwe
  modus-keuzestaat op `/beheer` (nieuw, stateful scherm — net als eerdere
  overlays een aparte testcase nodig, zie `bezetting-beheren.md`/
  `ledenbeheer.md`'s eigen precedent hiervoor) en (b) de uitgebreide
  Lid-beheren-overlay (bestaande scan uitbreiden, geen nieuw scenario nodig
  — de overlay zelf is al gedekt, alleen de inhoud groeit). De bestaande
  "beheer login"-scan (regel 14, signed-out state) blijft ongewijzigd
  bruikbaar op de nu generiekere kop-tekst.
- **`db:test`**: nieuwe negatieve tests voor `set_member_auth_method`
  (`no_linked_account`, `no_pin_set`, `invalid_auth_method`,
  `actor_not_found`, `no_admin_role`) en een uitbreiding van
  `start_shift.test.sql` (correcte PIN, maar `auth_method = 'email'` →
  `invalid_pin`) — exact zoals `assortimentbeheer.md`/`ledenbeheer.md` dat
  voor hun eigen nieuwe RPC's al vastleggen.

## Expliciet buiten scope

- **Self-service PIN-uitgifte/-reset voor een lid dat er nooit een had** —
  zie Openstaande vraag 2. Blijft, net als e-mailaccount-koppeling,
  handmatig (Supabase Studio) tot een toekomstig ticket dit oppakt.
- **Self-service e-mailaccount-koppeling/-uitnodiging voor bardienst/
  beheerder-leden** — blijft #24's territorium (ledenbeheer's bestaande
  uitnodigingsflow, nog niet gebouwd), nu ook impliciet van toepassing op
  bar-personeel in plaats van alleen beheerders. `no_linked_account` is de
  server-fallback zolang dat niet bestaat.
- **Wijzigen van `pin_hash`/wachtwoord zelf** — geen "wachtwoord vergeten"-
  flow, geen "nieuwe PIN"-flow. Supabase Auth's eigen wachtwoord-herstel
  (buiten deze app om) blijft de enige weg voor het e-mail-wachtwoord;
  PIN-wijziging is sowieso nooit gebouwd (ook niet voor de bestaande
  PIN-flow, #6).
- **Rolgebaseerde filtering van de modus-keuzetegels** (bv. "Beheer"-tegel
  verbergen voor een `bardienst`-lid) — bewust niet gedaan, zie
  Rolzichtbaarheid: consistent met "RPC handhaaft, scherm filtert niet
  vooraf" elders in deze codebase.
- **Wijzigingen aan `place_order`/`top_up`/`add_shift_member`/
  `remove_shift_member`** — functioneel ongewijzigd, zoals de issue zelf al
  vaststelt. Alleen `start_shift` (PIN-check) en de nieuwe
  `set_member_auth_method`-RPC zijn nieuw/gewijzigd.
- **Issue #22** ("Alternatieve inlogmethoden bar-shell naast PIN") — deze
  spec is, zoals ADR 0003 al aankondigde, de volledige voortzetting van #22's
  oorspronkelijke scope. **Aanbeveling aan Bram**: #22 sluiten als
  gedupliceerd/opgelost door #42 zodra deze spec is gebouwd, geen aparte
  bouw nodig.
- **Race-conditie-bescherming bij gelijktijdige `auth_method`-wijzigingen** —
  zelfde buiten-scope-afweging als elders in deze codebase (#29 en
  navolgende specs).

## `useShell()`-contract

Geen nieuwe invulling. Het modus-keuzescherm (stap 2) is, net als
`BeheerLogin.tsx` vandaag, een volledig scherm, geen overlay — geen
`useShell().overlay`-gebruik. `columns`/`density` zijn niet van toepassing:
twee gelijkwaardige tegels naast elkaar is een vaste layout, geen grid dat
met apparaatbreedte meeschaalt (zelfde soort "geen architectuurkeuze"-status
als de productenlijst/ledenlijst in eerdere specs).

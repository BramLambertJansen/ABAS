# Assortimentbeheer (producten en prijzen)

Spec voor [issue #14](https://github.com/BramLambertJansen/ABAS/issues/14).
Onafhankelijk van ledenbeheer, kan parallel — raakt geen van de bestanden die
op dit moment door de lopende bezetting/dienst/auth/CI-sessie worden
aangepast (`src/middleware.ts`, `supabase/seed.sql`, `supabase/config.toml`,
`.github/workflows/ci.yml`, `e2e/a11y.spec.ts`,
`src/hooks/queries/useOpenShift.ts`).

Deze spec volgt
**[ADR 0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)**
(hoe een schrijfactie die alleen een `beheerder` mag uitvoeren zich laat
afdwingen: een eigen, losse e-mail-sessie, niet de gedeelde tablet-sessie en
niet een PIN-per-actie) **en**
**[ADR 0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)**
(dat e-mail-login geen beheer-specifiek mechanisme is maar één van twee
methodes die een lid zelf kiest — hier toegepast op het enige doel dat
e-mail-login vandaag daadwerkelijk bereikt: beheer). Lees beide ADR's eerst;
deze spec past ze toe, herhaalt de motivatie niet. **ADR 0002 vervangt ADR
0001** (PIN-per-actie tegen de gedeelde sessie) — een eerdere versie van
deze spec volgde nog 0001; alle verwijzingen hieronder zijn bijgewerkt.

**Voorheen een openstaande vraag, nu beslist (ADR 0003):** ADR 0002's
mechanisme steunt op `members.auth_user_id` (koppeling lid-record ↔
Supabase Auth-account) en een e-mail-inlogflow (magic
link/wachtwoord-formulier, callback-route) — geen van beide bestaat vandaag
in de code. `docs/ARCHITECTURE.md` → "Lid-accounts" plant een
self-service-uitnodigingsflow onder issue #24; de volledige portal-inlogflow
is issue #15. **#14 bouwt hier zelf een minimale slice van**, niet #15/#24's
volledige versie: een eigen inlogformulier (magic link of wachtwoord — zie
Schermflow) en de `auth_user_id`-kolom, maar geen self-service-uitnodiging
en geen portal-registratiestroom. Beheerder-accounts worden tot #15/#24
**handmatig geprovisioned** (Supabase Studio/CLI — zelfde patroon als het
bestaande device-account, `docs/ARCHITECTURE.md` → "Provisioning voor
#14"), niet via een in-app uitnodigingsknop.

## Doel

Een beheerder kan producten toevoegen, de prijs van een bestaand product
wijzigen, en een product uit het assortiment halen (archiveren) of terugzetten
— vanaf het gedeelde bar-tablet. Prijswijzigingen raken nooit al bestaande
bestellingen: `order_lines.unit_cents` is al bevroren op het moment van
bestellen (`place_order`, `0001_init.sql`), dit scherm verandert daar niets
aan, het bouwt er alleen bovenop.

## Betrokken shell

`shells/bar` alleen. Er is geen assortimentsbeheer-concept in
`shells/portal` — leden zien nooit een beheerscherm (CLAUDE.md → Domein: geen
los adminscherm, beheerder werkt binnen `shells/bar`). Het scherm staat
shell-agnostic in `src/features/assortimentbeheer/`, naast (niet in)
`src/features/dienst-starten/` en `src/features/bezetting-beheren/` — zelfde
reden als die twee: eigen issue, eigen spec, eigen featuremap.

**Navigatie-ingang (herzien door ADR 0002 — niet langer een knop op
`DienstActief`)**: een eerdere versie van deze spec hing "Assortiment
beheren" op als knop naast "Bezetting wijzigen" op `DienstActief`
(`src/features/bezetting-beheren/DienstActief.tsx`), omdat actor-verificatie
toen een PIN-invoer binnen dezelfde gedeelde sessie was — een lichte overlay
volstond. Dat past niet meer: ADR 0002's mechanisme *vervangt* de gedeelde
device-sessie tijdelijk door een eigen, ingelogde beheerder-sessie
(`supabase.auth.signInWithOtp()`/`signInWithPassword()`, zie ADR 0002 →
Beslissing), dus de ingang moet een echte in-/uitlogstap zijn, geen
overlay-detail binnen een dienst-scherm.

Nieuwe, eigen route `/beheer` (thin wrapper
`src/app/(bar)/beheer/page.tsx`/`layout.tsx`, zelfde patroon als
`src/app/(bar)/page.tsx`), **bereikbaar vanaf de bar-shell root, niet alleen
tijdens een open dienst** — dat is een bewuste wijziging t.o.v. de vorige
versie van deze spec: nu de ingang zelf al een aparte inlogstap is (in
plaats van "een knop op het dienst-scherm"), is er geen reden meer om 'm
kunstmatig aan een open dienst te koppelen; assortimentbeheer heeft
conceptueel niets met een dienst te maken. `/beheer` toont eerst een
inlogformulier (e-mail + magic link of wachtwoord — zelfde formulier-vorm
als issue #15 voor de portal bouwt, hier zelf gebouwd, minimaal — zie de
inleiding hierboven) als er geen actieve
beheerder-sessie is; na een succesvolle login toont het de productenlijst
(zie Schermflow) plus een zichtbare "Ingelogd als [naam] — uitloggen"-status
(uitloggen = `supabase.auth.signOut()`, per ADR 0002 stap 3 — dit herstelt
de gedeelde device-sessie niet meteen zelf, dat doet `src/middleware.ts`'s
bestaande `if (!session)`-stap vanzelf bij de eerstvolgende bar-shell-request
na het uitloggen). Een "← terug naar bardienst"-link is aanwezig maar
logt **niet** automatisch uit — terugnavigeren zonder uitloggen laat de
beheerder-sessie actief staan tot de expliciete uitlog-tik, precies zoals
ADR 0002 vaststelt (geen impliciete sessiewissel).

Dit blijft, net als de vorige versie, **een tijdelijk, minimaal
koppelpunt** — geen tabbalk, geen navigatiestructuur; zie
`docs/features/bezetting-beheren.md`'s zelfde constatering voor
`DienstActief`. Verschil met de vorige versie: het koppelpunt is nu een
eigen route met een eigen inlogstap, niet een knop binnen een bestaand
scherm — een rechtstreeks gevolg van ADR 0002, geen aparte
navigatiebeslissing.

## Datamodel

Geen wijziging aan de kolommen van `products` — die staan al precies goed in
`0001_init.sql`: `name text not null`, `category text not null`,
`price_cents integer not null check (price_cents > 0)`, `archived boolean not
null default false`. Deze spec voegt geen `created_by`/`updated_by`-kolom
toe en bouwt geen wijzigingslogboek — dat hoort bij de nog niet besloten
`Logboek`-feature (`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier
nog niet is besloten"). De actor-check in de RPC's hieronder (ADR 0002) dient
uitsluitend om de schrijfactie te autoriseren, niet om een auditspoor vast
te leggen.

**Wél een afhankelijkheid op `members`**: ADR 0002's mechanisme steunt op
`members.auth_user_id` — die kolom bestaat nog niet in `0001_init.sql`/
latere migraties. Deze spec voegt 'm zelf toe (minimale slice, zie de
inleiding hierboven); het bredere ledenbeheer-gebruik ervan
(zelf-registratie-invite) blijft gepland onder issue #24.

**Interpretatie van ticket-tekst "naam, prijs, evt. categorie"**: het schema
maakt `category` al `not null` sinds `0001_init.sql` (vóór dit ticket). Deze
spec verandert dat niet — "evt." uit het ticket wordt gelezen als "een vrije
tekstwaarde die per product verschilt", niet als "mag leeg zijn". Elk nieuw
product krijgt dus een categorie; zie Schermflow voor hoe dat ingevuld wordt
zonder dat het als een vervelend verplicht veld aanvoelt.

**Geen echte delete.** "CRUD" uit de acceptatiecriteria wordt voor de D
ingevuld als archiveren, niet als een DELETE-statement — exact hetzelfde
patroon als `members.archived`. Een harde delete zou bovendien vast lopen op
de foreign key vanuit `order_lines.product_id` zodra een product ooit besteld
is (geen `on delete cascade` in `0001_init.sql`, terecht: dat zou historie
laten verdwijnen). Dit is geen nieuwe beslissing, alleen het toepassen van
een patroon dat al bestaat.

**Belt-and-braces REVOKE, voor symmetrie** (klein, geen ADR nodig — sluit aan
bij de bestaande motivatie in `0001_init.sql` regel 133–137, niet een nieuw
principe): de nieuwe migratie voegt `products` toe aan een
`revoke insert, update, delete ... from authenticated`-statement. Functioneel
verandert dit niets (er bestaat al geen insert/update/delete-policy voor
`authenticated` op `products`, dus RLS blokkeert dit al) — het maakt alleen
expliciet, net als bij de geldtabellen, dat dit niet per ongeluk via een
toekomstige policy open kan schuiven zonder dat iemand het REVOKE ook moet
intrekken.

## RPC's

Nieuwe migratie, opeenvolgend genummerd na `0003_remove_shift_member_requires_open_shift.sql`
(dus `0004_...`), per het bestaande patroon in dit repo — niet
`0001_init.sql` zelf aanpassen. Deze migratie voegt ook
`members.auth_user_id uuid references auth.users(id)` toe, nullable (zie
`docs/ARCHITECTURE.md` → "Lid-accounts": nullable omdat een lid zonder
e-mail nooit een account krijgt) — dit is de kolom die ADR 0002/0003's
mechanisme nodig heeft en die tot nu toe alleen gepland stond onder issue
#24; #14 bouwt 'm hier zelf, minimaal (zie de inleiding bovenaan deze spec).

Alle drie volgen ADR 0002: **geen** `p_actor_member_id`/`p_actor_pin`-
parameters meer (dat was ADR 0001, vervangen). In plaats daarvan verifieert
elke RPC de aanroeper aan het begin van dezelfde `SECURITY DEFINER`-functie
via de sessie zelf:

```sql
select id, role into v_actor
from members
where auth_user_id = auth.uid() and not archived;

if v_actor.id is null then
  raise exception 'actor_not_found';
end if;
if v_actor.role <> 'beheerder' then
  raise exception 'no_admin_role';
end if;
```

— dezelfde twee foutcodes als ADR 0001 kende (`actor_not_found`,
`no_admin_role`), maar geen `invalid_pin` meer: die controle bestaat niet
meer, Supabase Auth heeft de identiteit al geverifieerd bij het inloggen op
`/beheer` (zie Betrokken shell). Pas ná deze check voert de RPC de
eigenlijke schrijfactie uit, in dezelfde functie/hetzelfde statement — geen
aparte "ontgrendel"-RPC, zelfde vorm als ADR 0001 al vastlegde.

- **`create_product(p_name text, p_category text, p_price_cents integer)
  returns products`** — nieuw. Na de actor-check: `p_name` (getrimd) niet
  leeg → anders `invalid_name`; `p_category` (getrimd) niet leeg → anders
  `invalid_category`; `p_price_cents` niet null en `> 0` → anders
  `invalid_price` (dezelfde soort voorvalidatie als `place_order`'s
  `invalid_qty`-check, zodat de UI een nette Nederlandse boodschap kan tonen
  in plaats van een rauwe check-constraint-foutmelding). Insert, `archived`
  default `false`, retourneert de nieuwe rij.
- **`update_product_price(p_product_id uuid, p_price_cents integer) returns
  products`** — nieuw. Na de actor-check: product bestaat → anders
  `product_not_found` (geen eis dat het product niet gearchiveerd is — een
  gearchiveerd product blijft prijs-bewerkbaar, zie Randgevallen);
  `p_price_cents` niet null en `> 0` → anders `invalid_price`. Update alleen
  `products.price_cents` — raakt nooit `order_lines`/`orders`, dus bevroren
  `unit_cents` van bestaande bestellingen blijven exact zoals ze waren (dit
  is het mechanisme achter acceptatiecriterium 2, hieronder verder
  uitgewerkt onder Randgevallen).
- **`set_product_archived(p_product_id uuid, p_archived boolean) returns
  products`** — nieuw. Client stuurt de gewenste eindstaat expliciet (niet
  "toggle") — zelfde stijl als `place_order`'s expliciete `p_lines` in
  plaats van impliciete server-berekening. Na de actor-check: product
  bestaat → anders `product_not_found`. Idempotent: alsnog `p_archived =
  true` sturen voor een al gearchiveerd product slaagt gewoon (geen
  foutmelding), zelfde verdraagzaamheid als `add_shift_member`'s `on
  conflict do nothing`.
- `grant execute on function create_product, update_product_price,
  set_product_archived to authenticated;` — zelfde grant-regel als de
  bestaande RPC's onderaan `0001_init.sql`.
- Verder geen nieuwe RPC's. "Welke producten bestaan er, wat kosten ze, wat
  is de categorie" is een platte `select` op `products` (bestaande
  `products_select`-policy, `authenticated` mag alles lezen, single-tenant)
  en hoort dus in `src/hooks/queries/`, niet in een RPC.

## Schermflow

0. **Inloggen** (`/beheer`, zie Betrokken shell): geen actieve
   beheerder-sessie → inlogformulier (e-mail + magic link of wachtwoord,
   zelfde twee mechanismen als CLAUDE.md → Auth voor de portal noemt).
   Succesvolle login vervangt de gedeelde device-sessie in de tablet-browser
   door de beheerder-sessie (ADR 0002 → Beslissing, stap 1) en toont
   vervolgens **direct** de productenlijst (stap 1 hieronder) plus een
   permanent zichtbare "Ingelogd als [naam] — uitloggen"-indicator — **geen**
   tussenliggend "bar of beheer"-keuzescherm, ook al stelt ADR 0003 een
   modus-keuze vast als algemeen principe: er bestaat vandaag geen
   bar-bestemming om via deze inlogroute naartoe te routeren (zie ADR 0003 →
   scope-splitsing, "Geen zichtbare 'bar'-knop in #14's inlogflow"), dus is
   er nog niets om tussen te kiezen. Dit is bewust geen definitieve
   schermvorm — een later issue voegt hier een echte "bar"-optie toe zodra
   die bestaat, geen herontwerp van deze stap. Mislukte login (onbekend
   e-mailadres, verkeerd wachtwoord, verlopen/ongeldige magic link) →
   Nederlandse foutmelding via `role="alert"`, formulier blijft staan. Exacte
   formulier-UI (velden, foutmeldingen, magic-link-vs-wachtwoord-keuze) is
   aan de Developer.
1. **Productenlijst** (na een actieve beheerder-sessie): gesorteerd op
   categorie dan naam (nieuwe leeshook `useProducts()` in
   `src/hooks/queries/`, ordering server-side via `.order()`, zelfde stijl
   als `useBarStaff()`). Elke rij toont naam, categorie, huidige prijs; een
   gearchiveerd product blijft in de lijst maar visueel gedempt (zelfde
   soort onderscheid als het ontwerp's `archived`-status,
   `designs/Bar App.dc.html` regel 2618–2620), niet weggefilterd — anders is
   er geen manier om het terug te zetten.
2. **"+ nieuw product"** (header-knop, zelfde opmaak/positie als het ontwerp,
   regel 410) → opent de `Overlay`-primitive (`src/components/Overlay.tsx`,
   hergebruikt ongewijzigd — geen nieuwe overlay-component nodig, dit is
   precies waar `useShell().overlay` al voor gebouwd is). Titel: **"Nieuw
   product"**. Inhoud: **één stap**, geen naamkeuze/PIN-pad meer (dat was
   ADR 0001's stap B — vervallen, want de aanroeper is al geïdentificeerd
   door de actieve `/beheer`-sessie, zie ADR 0002). Naam (tekstveld),
   categorie (zes keuzechips, exact de zes uit het ontwerp — Bier, Fris,
   Wijn, Snacks, Sterke drank, Warm, regel 1472 — geen vrij tekstveld voor
   categorie in deze eerste bouw, zie Datamodel voor waarom dat geen
   schema-beperking is), prijs (tekstveld, `€`-prefix zoals het ontwerp).
   "Toevoegen"-knop pas actief als naam niet leeg, een categorie gekozen, en
   prijs een geldig bedrag `> €0,00` is (client-side validatie is UX, geen
   vervanging van de RPC-validatie — de RPC valideert hetzelfde hierboven,
   ongeacht wat de client toestond). Tik op "Toevoegen" → direct de
   RPC-call `create_product` (geen tussenstap meer). Succes → overlay
   sluit, lijst ververst (refetch van `useProducts()`), toast/bevestiging
   **"[Naam] toegevoegd"** (stijl vrij aan Developer, geen bestaand
   toast-patroon in deze codebase om aan te sluiten — dit is de eerste
   feature die er een nodig heeft). Mislukt (elke foutcode) → Nederlandse
   foutmelding in de overlay via `role="alert"`, formulier blijft open met
   de ingevulde gegevens bewaard.
3. **Tik op een productrij** → opent dezelfde soort overlay, titel **"Product
   beheren"**, twee acties (matcht het ontwerp, regel 1236–1271, min de
   naam/categorie-bewerking die het ontwerp zelf ook niet aanbiedt hier):
   - **Prijs wijzigen**: huidige prijs getoond, nieuw bedrag invoerbaar,
     "Opslaan"-knop pas actief bij een geldig bedrag `> €0,00` dat afwijkt
     van de huidige prijs. Tik op "Opslaan" → direct `update_product_price`
     (geen naamkeuze/PIN-stap, zelfde reden als hierboven).
   - **Uit assortiment halen / terug in assortiment** (tekst wisselt op
     basis van huidige `archived`-staat, zelfde als het ontwerp regel 2619):
     tik → direct `set_product_archived` met de expliciete tegenovergestelde
     boolean (geen bevestigingsstap nodig — de sessie zelf is al de
     bevestiging, zie Rolzichtbaarheid).
   - Beide acties delen dezelfde overlay-instantie maar zijn onafhankelijke
     schrijfacties — elk een eigen RPC-call, geen gecombineerde aanroep.
4. **Sluiten** (knop, Escape, backdrop-tik — zelfde a11y-eisen als
   `Overlay.tsx` al afdwingt) → terug naar de productenlijst, die de actuele
   staat toont (refetch van `useProducts()` bij elke succesvolle mutatie,
   niet pas bij het sluiten van de overlay).
5. **Uitloggen** (indicator uit stap 0) → `supabase.auth.signOut()`, terug
   naar het inlogformulier van stap 0. `src/middleware.ts`'s bestaande
   `if (!session)`-stap herstelt de gedeelde device-sessie vanzelf bij de
   eerstvolgende bar-shell-request — geen aparte "terug naar bardienst"-
   handeling nodig buiten uitloggen zelf.

## Rolzichtbaarheid

**Alleen bereikbaar met een actieve beheerder-sessie**, niet meer "zichtbaar
voor iedereen op de gedeelde sessie, afgedwongen in de RPC" zoals ADR 0001's
versie van deze spec beschreef. `/beheer` toont zonder sessie alleen het
inlogformulier (stap 0); de productenlijst en beide overlays zijn pas
zichtbaar ná een succesvolle e-mail-login. Autorisatie zit dus op twee
lagen, niet meer op één: het inlogformulier zelf laat elk e-mailadres met
een geldig account inloggen (er is geen rol-check bij het inloggen zelf —
zie hieronder), en de RPC's controleren daarna alsnog `no_admin_role` — dus
een lid met een eigen portal-account maar zonder `beheerder`-rol kan wél
inloggen op `/beheer` (er is geen reden om dat tegen te houden op
sessie-niveau) maar krijgt op elke schrijfactie `no_admin_role` terug,
exact zoals een `bardienst`-medewerker dat eerder op het PIN-pad kreeg.
Dat is bewust gedrag, geen gat: net als bij `start_shift` wordt de
rol-eis niet op het scherm afgedwongen maar in de RPC, en zoals CLAUDE.md
het zelf beschrijft — attributie/autorisatie hoort serverside gecontroleerd
te worden, nooit client-side vertrouwd. Overwogen om dit strenger te maken
(alleen een `beheerder`-e-mailadres mag `/beheer` sowieso in) — niet gedaan
in deze spec: dat zou een aparte pre-login rolcheck vereisen die nergens
anders in dit patroon voorkomt, en de RPC-laag dekt het acceptatiecriterium
al volledig. Heroverwegen als dit in de praktijk verwarrend blijkt (een
lid dat inlogt en alleen foutmeldingen ziet).

De **productenlijst zelf** (lezen), eenmaal ingelogd, is ongewijzigd: de
bestaande `products_select`-policy staat dit toe aan iedere `authenticated`
sessie (nodig voor het toekomstige verkoopscherm, #8, dat dezelfde tabel
leest) — dit was al zo onder ADR 0001 en verandert niet door ADR 0002.

## Randgevallen

- **Regressietest prijs-freeze (acceptatiecriterium 2)**: prijs wijzigen via
  `update_product_price` raakt uitsluitend `products.price_cents`. Een
  bestaande `order_lines`-rij verwijst naar dat product via `product_id`,
  maar zijn eigen `unit_cents`-kolom is en blijft ongewijzigd — dat is een
  kolom op `order_lines`, niet een live lookup naar `products`. Test
  (Tester, nieuw testbestand, bv. `supabase/tests/assortimentbeheer.test.sql`):
  plaats een order via `place_order` tegen prijs A, roep `update_product_price`
  aan met prijs B, select de order_line opnieuw, assert `unit_cents = A`.
  Dit is geen nieuw mechanisme — het bewijst alleen dat de nieuwe RPC het
  bestaande bevriezingsgedrag niet doorbreekt.
- **Gearchiveerd product, prijs wijzigen**: toegestaan (zie RPC's) — een
  beheerder kan een prijs corrigeren vlak voordat een product weer actief
  wordt, zonder eerst te moeten de-archiveren.
- **Product bestaat niet meer op het moment van opslaan** (race: twee
  bardienst-tablets, of het product werd tussen laden en opslaan al
  gearchiveerd/aangepast door iemand anders) → `product_not_found`
  (update/archiveren) — Nederlandse foutmelding, overlay blijft open, lijst
  ververst zodat de rij verdwijnt/actualiseert.
- **Ingelogd, maar geen beheerder** (lid met eigen portal-account, rol
  `lid`/`bardienst`) → elke schrijfactie faalt met `no_admin_role`,
  Nederlandse boodschap in de overlay via `role="alert"` (bv. "dit account
  kan het assortiment niet beheren — vraag een beheerder", exacte
  bewoording aan Developer). Zie Rolzichtbaarheid voor waarom dit pas in de
  RPC gecontroleerd wordt, niet al bij het inloggen.
- **Ingelogd account bestaat niet (meer) als `members`-rij, of is
  gearchiveerd** (`auth_user_id` matcht geen actieve rij — zou niet moeten
  voorkomen bij een consistente `members`/`auth.users`-koppeling, maar de
  RPC controleert het toch expliciet) → `actor_not_found`, zelfde
  Nederlandse-boodschap-aanpak als hierboven.
- **Verkeerde inloggegevens op `/beheer` zelf** (onbekend e-mailadres,
  verkeerd wachtwoord, verlopen/ongeldige magic link) → dit is geen
  RPC-foutcode meer maar een Supabase Auth-foutrespons op het inlogformulier
  zelf (stap 0), Nederlandse foutmelding, formulier blijft staan. Exacte
  boodschap-mapping is aan de Developer — dit formulier is hier zelf
  gebouwd, minimaal (zie de inleiding bovenaan deze spec), geen bestaand
  patroon om op aan te sluiten.
- **Dubbele/gelijktijdige prijswijziging** (twee tikken kort na elkaar) —
  expliciet buiten scope, zelfde soort afweging als issue #29 voor
  `start_shift` en bezetting-beherens eigen "race-condition-bescherming"
  buiten-scope-punt.
- **Lege productenlijst** (nieuwe/lege installatie) → geen crash, duidelijke
  lege staat ("Nog geen producten — voeg het eerste toe") in plaats van een
  loze lijst.
- **Kan productenlijst niet laden** (netwerkfout) → vaste Nederlandse
  foutmelding, zelfde patroon als `useOpenShift`/`useBarStaff`, geen crash.
- **A11y van de overlay(s)**: zelfde openstaande punt als
  `docs/features/bezetting-beheren.md` → Randgevallen al noteerde voor de
  bezetting-overlay — `e2e/a11y.spec.ts` scant vandaag geen geopende
  overlay-staat. Als Tester dat voor #7 al oplost (uitbreiden van de scan
  naar een geopende-overlaystaat), hoort deze feature's overlay(s) in
  dezelfde uitbreiding mee te lopen in plaats van een tweede losse oplossing.

## Expliciet buiten scope

- **Naam/categorie wijzigen na aanmaken** — het ontwerp biedt dit zelf ook
  niet aan in "Product beheren" (regel 1236–1271: alleen prijs + archief),
  dus dit is geen afwijking van "prototype bepaalt de eerste bouw", maar het
  letterlijk volgen ervan. Kan een latere, aparte iteratie zijn zodra daar
  behoefte aan blijkt (normale evolutie, geen nieuwe spec nodig tenzij het
  weer een architectuurvraag raakt).
- **Wijzigingslogboek / audit-trail van prijswijzigingen en
  productmutaties** (`Logboek` in het ontwerp) — expliciet nog niet besloten
  scope, zie `docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog
  niet is besloten".
- **Tijdgebonden "beheermodus"-ontgrendeling** (het ontwerp's `adminUntil`,
  10 minuten) — nog steeds niet gebouwd, nu om een andere reden dan eerst:
  ADR 0001 verwierp het als tijdelijke ontgrendeling bovenop een PIN-per-actie;
  ADR 0002 maakt de vraag grotendeels overbodig — de sessie zelf is al het
  "ontgrendelde venster", zolang de beheerder niet uitlogt.
- **Een echte tabbalk/navigatiestructuur voor `shells/bar`** — de nieuwe
  `/beheer`-route (zie Betrokken shell) is een tijdelijk koppelpunt, geen
  voorschot op een navigatie-architectuur.
- **Een herbruikbaar, gedeeld inlogformulier-component voor #15's
  portal-login, en #24's self-service-uitnodigingsflow** (`inviteUserByEmail`
  vanuit ledenbeheer) — #14 bouwt zijn eigen, minimale `/beheer`-formulier
  (zie inleiding bovenaan deze spec en `docs/ARCHITECTURE.md` →
  "Provisioning voor #14"); of #15 dat later hergebruikt/refactort is aan de
  Developer die #15 oppakt, geen eis hier.
- **Auth-methode-instelling per lid (PIN of e-mail/wachtwoord kiezen) en
  bar-modus bereikbaar via e-mail/wachtwoord-login** — expliciet niet in
  #14; dit raakt de al gemergede PIN-flow (#6) en het device-sign-in-
  mechanisme (#32/#33), en krijgt een eigen issue + eigen spec. Zie ADR
  [0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) →
  scope-splitsing.
- **Voorraad/beschikbaarheid buiten archiveren** (het ontwerp's
  `prodStockFilter`) — geen acceptatiecriterium in #14, niet gebouwd.
- **Race-condition-bescherming bij gelijktijdige schrijfacties** — zie
  Randgevallen, zelfde afweging als elders in deze codebase (#29).

## `useShell()`-contract

Geen nieuwe invulling. De overlay(s) hergebruiken `Overlay.tsx`'s bestaande
`useShell().overlay`-gedrag (vandaag altijd `"modal"` op de bar-shell,
ongewijzigd door deze spec). `columns`/`density` worden hier niet nieuw
ingevuld — de productenlijst is een verticale lijst (zoals het ontwerp
'm ook toont), geen grid; als een latere iteratie 'm als grid wil tonen is
dat een implementatiedetail, geen architectuurkeuze.

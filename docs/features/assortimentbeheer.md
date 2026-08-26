# Assortimentbeheer (producten en prijzen)

Spec voor [issue #14](https://github.com/BramLambertJansen/ABAS/issues/14).
Onafhankelijk van ledenbeheer, kan parallel — raakt geen van de bestanden die
op dit moment door de lopende bezetting/dienst/auth/CI-sessie worden
aangepast (`src/middleware.ts`, `supabase/seed.sql`, `supabase/config.toml`,
`.github/workflows/ci.yml`, `e2e/a11y.spec.ts`,
`src/hooks/queries/useOpenShift.ts`).

Deze spec introduceert één nieuwe architectuurbeslissing — zie
**[ADR 0001](../adr/0001-beheerder-only-writes-require-actor-pin-per-rpc.md)**
— over hoe een schrijfactie die alleen een `beheerder` mag uitvoeren zich op
het gedeelde bar-tablet laat afdwingen zonder per-operator sessie. Lees die
ADR eerst; deze spec past het toe, herhaalt de motivatie niet.

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

**Navigatie-ingang (nieuw, want er is nog geen tabbladen-shell)**: er bestaat
vandaag maar één bereikbaar bar-scherm na het starten van een dienst —
`DienstActief` (`src/features/bezetting-beheren/DienstActief.tsx`), met
daarop al de "Bezetting wijzigen"-knop. Dit scherm krijgt er een tweede,
gelijkwaardige knop bij: **"Assortiment beheren"** (zelfde opmaak/tapdoel
≥44px als "Bezetting wijzigen"), die navigeert naar een nieuwe route
`/assortiment` (nieuwe thin wrapper `src/app/(bar)/assortiment/page.tsx`,
zelfde patroon als `src/app/(bar)/page.tsx`: `layout.tsx` mount
`ShellProvider`, `page.tsx` re-exporteert het feature-component). Dat scherm
krijgt een simpele "← terug"-link naar `/` (dienst-actief). Dit is bewust een
volledige route, geen overlay — het ontwerp toont Assortiment zelf ook als
een volwaardig scherm (tab), niet als modal (`designs/Bar App.dc.html`, regel
403–411), in tegenstelling tot de kleinere "nieuw product"/"product
beheren"-dialogen daarbinnen, die wél overlays zijn (zie Schermflow).
**Dit is expliciet een tijdelijk, minimaal koppelpunt** — net zoals
`docs/features/bezetting-beheren.md` al vaststelde dat een schermbrede
navigatie/tab-chip pas zinvol is "zodra #8 een tweede bar-scherm toevoegt";
met deze spec zijn er dan twee (verkoop volgt nog in #8), dus een echte
tabbalk blijft nog steeds een aparte beslissing voor wanneer er meer van
dit soort schermen zijn — niet hier vooruit bouwen.

Gevolg van "alleen bereikbaar via `DienstActief`": Assortimentbeheer is
vandaag alleen te openen tijdens een open dienst, ook al heeft het
conceptueel niets met een dienst te maken (producten beheren kan net zo goed
vóór een dienst begint). Geaccepteerd voor nu, om dezelfde reden als hierboven
— er is geen ander navigeerbaar bar-scherm om dit aan op te hangen. Geen
architectuurbeslissing, gewoon een gevolg van scope: verandert vanzelf zodra
een echte navigatiestructuur gebouwd wordt.

## Datamodel

Geen wijziging aan de kolommen van `products` — die staan al precies goed in
`0001_init.sql`: `name text not null`, `category text not null`,
`price_cents integer not null check (price_cents > 0)`, `archived boolean not
null default false`. Deze spec voegt geen `created_by`/`updated_by`-kolom
toe en bouwt geen wijzigingslogboek — dat hoort bij de nog niet besloten
`Logboek`-feature (`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier
nog niet is besloten"). De PIN-check in de RPC's hieronder dient uitsluitend
om de schrijfactie te autoriseren (ADR 0001), niet om een auditspoor vast te
leggen.

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
`0001_init.sql` zelf aanpassen.

Alle drie volgen ADR 0001: `p_actor_member_id uuid, p_actor_pin text` als
eerste twee parameters, dezelfde controlevolgorde
(`actor_not_found` → `no_admin_role` → `invalid_pin`), vóór de eigenlijke
schrijfactie, in dezelfde `SECURITY DEFINER`-functie (geen aparte
"ontgrendel"-RPC).

- **`create_product(p_actor_member_id uuid, p_actor_pin text, p_name text,
  p_category text, p_price_cents integer) returns products`** — nieuw.
  Na de actor-check: `p_name` (getrimd) niet leeg → anders `invalid_name`;
  `p_category` (getrimd) niet leeg → anders `invalid_category`;
  `p_price_cents` niet null en `> 0` → anders `invalid_price` (dezelfde
  soort voorvalidatie als `place_order`'s `invalid_qty`-check, zodat de UI
  een nette Nederlandse boodschap kan tonen in plaats van een rauwe
  check-constraint-foutmelding). Insert, `archived` default `false`,
  retourneert de nieuwe rij.
- **`update_product_price(p_actor_member_id uuid, p_actor_pin text,
  p_product_id uuid, p_price_cents integer) returns products`** — nieuw.
  Na de actor-check: product bestaat → anders `product_not_found` (geen eis
  dat het product niet gearchiveerd is — een gearchiveerd product blijft
  prijs-bewerkbaar, zie Randgevallen); `p_price_cents` niet null en `> 0` →
  anders `invalid_price`. Update alleen `products.price_cents` — raakt nooit
  `order_lines`/`orders`, dus bevroren `unit_cents` van bestaande
  bestellingen blijven exact zoals ze waren (dit is het mechanisme achter
  acceptatiecriterium 2, hieronder verder uitgewerkt onder Randgevallen).
- **`set_product_archived(p_actor_member_id uuid, p_actor_pin text,
  p_product_id uuid, p_archived boolean) returns products`** — nieuw. Client
  stuurt de gewenste eindstaat expliciet (niet "toggle") — zelfde stijl als
  `place_order`'s expliciete `p_lines` in plaats van impliciete
  server-berekening. Na de actor-check: product bestaat → anders
  `product_not_found`. Idempotent: alsnog `p_archived = true` sturen voor een
  al gearchiveerd product slaagt gewoon (geen foutmelding), zelfde
  verdraagzaamheid als `add_shift_member`'s `on conflict do nothing`.
- `grant execute on function create_product, update_product_price,
  set_product_archived to authenticated;` — zelfde grant-regel als de
  bestaande RPC's onderaan `0001_init.sql`.
- Verder geen nieuwe RPC's. "Welke producten bestaan er, wat kosten ze, wat
  is de categorie" is een platte `select` op `products` (bestaande
  `products_select`-policy, `authenticated` mag alles lezen, single-tenant)
  en hoort dus in `src/hooks/queries/`, niet in een RPC.

## Schermflow

1. **Binnenkomst** (`/assortiment`, alleen bereikbaar via de nieuwe knop op
   `DienstActief`, zie Betrokken shell): productenlijst, gesorteerd op
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
   product"**. Inhoud, in twee stappen binnen dezelfde overlay (geen twee
   losse overlays na elkaar — zie toelichting onder ADR 0001 → Gevolgen):
   - **Stap A — gegevens**: naam (tekstveld), categorie (zes keuzechips,
     exact de zes uit het ontwerp — Bier, Fris, Wijn, Snacks, Sterke drank,
     Warm, regel 1472 — geen vrij tekstveld voor categorie in deze eerste
     bouw, zie Datamodel voor waarom dat geen schema-beperking is), prijs
     (tekstveld, `€`-prefix zoals het ontwerp). "Toevoegen"-knop pas actief
     als naam niet leeg, een categorie gekozen, en prijs een geldig bedrag
     `> €0,00` is (client-side validatie is UX, geen vervanging van de
     RPC-validatie — de RPC valideert hetzelfde hierboven, ongeacht wat de
     client toestond).
   - **Stap B — wie bevestigt dit?** (nieuw, per ADR 0001): na "Toevoegen"
     schuift de overlay-inhoud (geen nieuwe overlay, dezelfde) naar een
     naamkeuze + PIN-pad, exact het `StaffPicker` + `PinPad`-paar uit
     `src/features/dienst-starten/` hergebruikt — met één verschil: de
     kandidatenlijst komt uit een **nieuwe** leeshook `useBeheerders()`
     (`src/hooks/queries/`, zelfde vorm als `useBarStaff()` maar
     `.eq("role", "beheerder")` in plaats van `.in("role", [...])`) — een
     losse hook, geen wijziging van `useBarStaff()` zelf, want die wordt al
     gebruikt waar zowel `bardienst` als `beheerder` moeten kunnen kiezen
     (dienst starten, bezetting beheren); die twee gebruiksplekken mogen niet
     ineens tot alleen-beheerders inperken. Na de 4e PIN-cijfer: RPC-call
     `create_product`. Succes → overlay sluit, lijst ververst (refetch van
     `useProducts()`), toast/bevestiging **"[Naam] toegevoegd"** (stijl vrij
     aan Developer, geen bestaand toast-patroon in deze codebase om aan te
     sluiten — dit is de eerste feature die er een nodig heeft).
     Mislukt (elke foutcode) → Nederlandse foutmelding in de overlay via
     `role="alert"`, terug naar het PIN-pad met lege invoer (zelfde gedrag
     als `DienstStarten`'s `pressDigit`), gegevens uit stap A blijven
     bewaard (niet opnieuw hoeven intypen na een foute PIN).
3. **Tik op een productrij** → opent dezelfde soort overlay, titel **"Product
   beheren"**, twee acties (matcht het ontwerp, regel 1236–1271, min de
   naam/categorie-bewerking die het ontwerp zelf ook niet aanbiedt hier):
   - **Prijs wijzigen**: huidige prijs getoond, nieuw bedrag invoerbaar,
     "Opslaan"-knop pas actief bij een geldig bedrag `> €0,00` dat afwijkt
     van de huidige prijs. Tik op "Opslaan" → zelfde stap-B-patroon als
     hierboven (naamkeuze + PIN via `useBeheerders()`/`StaffPicker`/
     `PinPad`), dan `update_product_price`.
   - **Uit assortiment halen / terug in assortiment** (tekst wisselt op
     basis van huidige `archived`-staat, zelfde als het ontwerp regel 2619):
     tik → direct door naar stap B (geen los formulier, er is niets in te
     vullen), dan `set_product_archived` met de expliciete tegenovergestelde
     boolean.
   - Beide acties delen dezelfde overlay-instantie maar zijn onafhankelijke
     schrijfacties — prijs wijzigen én archiveren in één bezoek aan deze
     overlay betekent twee keer door stap B (twee keer PIN), niet één
     gecombineerde aanroep. Consistent met ADR 0001: elke schrijfactie
     verifieert opnieuw.
4. **Sluiten** (knop, Escape, backdrop-tik — zelfde a11y-eisen als
   `Overlay.tsx` al afdwingt) → terug naar de productenlijst, die de actuele
   staat toont (refetch van `useProducts()` bij elke succesvolle mutatie,
   niet pas bij het sluiten van de overlay).

## Rolzichtbaarheid

De **productenlijst zelf** (lezen) is zichtbaar voor iedereen die de
gedeelde bar-tablet-sessie gebruikt tijdens een open dienst — zelfde model
als `dienst-starten`/`bezetting-beheren`: er is geen manier om op dit scherm
zelf te filteren op rol (geen per-operator sessie, zie ADR 0001 → Context),
en de bestaande `products_select`-policy staat dit al toe aan iedere
`authenticated` sessie (nodig voor het toekomstige verkoopscherm, #8, dat
dezelfde tabel leest). De knoppen "+ nieuw product" en elke productrij zijn
dus ook voor iedereen zichtbaar/tikbaar — dat is geen gat: acceptatiecriterium
"alleen beheerder-rol" wordt niet op het scherm afgedwongen maar in de RPC
(`no_admin_role`), exact zoals `start_shift` de bardienst/beheerder-eis ook
niet op het scherm afdwingt maar in de RPC, en zoals CLAUDE.md het zelf
beschrijft: attributie/autorisatie hoort serverside gecontroleerd te worden,
nooit client-side vertrouwd.

Praktisch gevolg: een `bardienst`-medewerker kan de hele flow doorlopen tot
en met het PIN-pad, en krijgt daar een `no_admin_role`-foutmelding als diegene
zichzelf kiest (of een correcte PIN van een niet-beheerder invoert). Dat is
bedoeld gedrag, geen bug.

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
- **Verkeerde PIN, of PIN van een niet-beheerder** → `invalid_pin` resp.
  `no_admin_role`, zelfde soort Nederlandse boodschap-mapping als
  `dienst-starten.md` → Randgevallen ("onjuiste pincode" voor `invalid_pin`;
  voor `no_admin_role` een eigen boodschap, bv. "dit account kan het
  assortiment niet beheren — vraag een beheerder", exacte bewoording aan
  Developer). Geen apart pad voor `pin_hash is null` (lid heeft nog nooit een
  PIN gehad) — valt onder `invalid_pin`, zelfde lek-vermijdende reden als
  `dienst-starten.md`.
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
  10 minuten) — expliciet verworpen voor deze RPC-laag, zie ADR 0001.
- **Een echte tabbalk/navigatiestructuur voor `shells/bar`** — de nieuwe
  "Assortiment beheren"-knop op `DienstActief` is een tijdelijk koppelpunt,
  geen voorschot op een navigatie-architectuur; zie Betrokken shell.
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

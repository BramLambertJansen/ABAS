# Wachtwoord verplicht + PIN als optionele snelkoppeling; dual-mode login (bar via e-mail)

> **Bijgewerkt door [`dienst-per-sessie.md`](dienst-per-sessie.md) (2026-09-29,
> ADR 0016):** "Mijn account" bestaat niet meer op de bar (de PIN zet je alleen
> in de portal), de keuze "Bar"/"Beheer" registreert de sessie server-side
> (`register_bar_session`), "Beheer" is er alleen voor een beheerder, en de PIN
> is een login voor bar-modus op een apparaat waar het lid eerder met het
> wachtwoord inlogde. De PIN-stafkeuze via de gedeelde sessie bestaat niet meer.

Spec voor [issue #42](https://github.com/BramLambertJansen/ABAS/issues/42).

**Status: gebouwd en gemerged (2026-09-20) —
[PR #60](https://github.com/BramLambertJansen/ABAS/pull/60).** Goedgekeurd
door Bram op 2026-09-19; de rest van dit document is de spec zoals die toen
goedgekeurd is. De
drie punten die de vorige versie als "Openstaande vragen voor Bram" openliet
zijn beantwoord — zie **"Definitieve keuzes (Bram, 2026-09-19)"** hieronder,
die die sectie vervangt. Er staat in dit document geen open vraag meer; elke
sectie (Datamodel, RPC's, Schermflow, Randgevallen) is bijgewerkt zodat hij
consistent is met deze drie definitieve keuzes.

**Herziening (Architect, 2026-09-02):** deze spec verving een eerdere versie
die uitging van een exclusief either/or-model (PIN *of* e-mail/wachtwoord,
nooit allebei — ADR 0003 → Beslissing 1). Bram heeft dat model gekanteld:
wachtwoord is altijd verplicht, PIN is een optionele, aanvullende
snelkoppeling. Zie **[ADR 0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)**,
die dit vastlegt en ADR 0003 → Beslissing 1 amendeert. Elk datamodel-,
RPC- en schermflow-onderdeel hieronder is opnieuw doordacht vanuit dat
nieuwe model — dit is geen kleine patch op de vorige versie, alle secties
zijn herschreven.

Voert, voor het deel dat ongewijzigd blijft, nog steeds
**[ADR 0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)**
uit (modus-keuze na login, bar-modus functioneel identiek via `served_by`) en
bouwt voort op **[ADR 0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)**
(de sessie zelf) en op het al gemergede `/beheer`
(`docs/features/assortimentbeheer.md`, issue #14). Lees ADR 0002, ADR 0003,
ADR 0005 en `assortimentbeheer.md` eerst — deze spec herhaalt hun motivatie
niet.

**Geen nieuwe ADR nodig voor de hieronder uitgewerkte details** — ADR 0005
legt het principe vast, deze spec past het toe op een concreet
datamodel/schermflow. Wel wordt op meerdere plekken expliciet gemotiveerd
*hoe* een detail uit ADR 0005 volgt, zodat een latere feature het niet
per ongeluk als toeval leest.

## Definitieve keuzes (Bram, 2026-09-19)

Bram heeft de drie punten die de vorige versie als "Openstaande vragen voor
Bram" openliet, beantwoord. Met "doe wat logisch is" (punt 2) en "zet waar
logisch is" (punt 3) heeft hij het architectuur-/UX-vakoordeel expliciet aan
de Architect gedelegeerd — dat is geen ontbrekende beslissing meer per
CLAUDE.md → Werkstraat ("geen aanname, geen placeholder"), wel een die
hieronder wordt vastgelegd en beargumenteerd, niet aangenomen of als
placeholder opengelaten. Dit was de laatste onderhandelingsronde vóór de
Developer begint; er blijft na dit document geen open vraag over.

1. **Provisioning van bestaande PIN-only bardienst/beheerder-leden zonder
   account.** Bram: **"die zijn er nog niet"** — er bestaat vandaag geen
   echt Aurora-lid met rol `bardienst`/`beheerder` en `auth_user_id is
   null`. Geverifieerd, niet aangenomen:
   - `supabase/seed.sql` bevat op het eerste gezicht twee tegenvoorbeelden —
     Tom Willems en Sanne Bakker (`bardienst`, `pin_hash` gezet, geen
     `auth_user_id`). Maar dat bestand opent met "Local dev seed data...
     fine for local `supabase start`, never seed this into a real
     deployment", en `docs/ARCHITECTURE.md` → "Local/CI device account"
     bevestigt hetzelfde expliciet voor precies dit soort rijen: "seed.sql
     only runs on local `supabase start`/`db reset`, never against a
     remote/production project — same guarantee the existing member/
     product demo data already relies on." Tom Willems/Sanne Bakker zijn
     dus fixtures om `start_shift`/de PIN-stafkeuze lokaal en in CI te
     kunnen testen (zoals de PIN-stafkeuze dat al voor #6 nodig had), geen
     bewijs van een echt Aurora-lid in die staat. **Bijgewerkt (2026-09-25,
     #19):** Sanne Bakker kreeg zelf inmiddels ook een e-mail/wachtwoord-
     account (`supabase/seed.sql`), nodig om een échte `bardienst`-sessie
     te kunnen inloggen op `/beheer` voor `docs/features/logboek.md`'s
     rolcheck-test — Tom Willems blijft de PIN-only fixture die dit punt
     hieronder illustreert.
   - Het enige spoor van een **echt** geprovisioned account in de codebase
     is Femke Bos' patroon (`seed.sql`: handmatige `auth.users`/
     `auth.identities`-insert, hetzelfde patroon als `docs/ARCHITECTURE.md`
     → "Still open" voor productie noemt: "manual via Studio"). Nergens in
     de codebase staat een aanname of registratie van een tweede, derde,
     etc. echt lid dat nog geprovisioned zou moeten worden — de vorige
     versie van deze spec noemde dat al slechts "vermoedelijk"
     (ongeverifieerd), nooit als vaststaand feit.
   - **Consequentie:** dit is geen migratie-/beleidsvraag die dit ticket
     hoeft op te lossen. Datamodel hieronder **behoudt** de
     overgangsstaat-toelating (geen `not null`-constraint op
     `auth_user_id`) — niet langer omdat die vandaag een echt lid zou
     beschermen (dat blijkt niet nodig), maar omdat (a) de lokale/
     CI-seedfixture (Tom Willems, zie boven) een `supabase start`/
     CI-breuk zou veroorzaken als de constraint er wél kwam, en (b) ADR
     0004 → Beslissing 5 de *handhavingstiming* (of/wanneer een harde
     deadline komt voor een toekomstig, wél bestaand geval) bewust als
     Bram's eigen, nog te nemen beleidsvraag openlaat — een
     schema-constraint zou die vraag stilzwijgend beslissen zonder dat
     Bram dat hier gedaan heeft. Zie Datamodel en Randgevallen hieronder
     voor de bijgewerkte formulering. **Mocht dit scenario ooit tóch
     voorkomen** (bv. een toekomstig ticket voegt een bulkimport toe die
     geen account koppelt): niets in deze spec breekt daarop — zo'n lid
     blijft gewoon met PIN werken (Randgevallen), en kan alleen zelf geen
     wachtwoordaccount koppelen totdat een beheerder dat handmatig doet
     (ongewijzigd buiten scope). Dat is geen bouwverplichting van dit
     ticket, alleen een vastgelegde uitkomst voor het geval het zich
     voordoet.

2. **Navigatie-ingang naar e-mail-login vanaf de bar-shell root.** Bram:
   **"doe wat logisch is."** Definitieve keuze: **een zichtbare, secundair
   gestileerde knop over de volle breedte, direct onder de
   `StaffPicker`-grid** ("Inloggen met e-mail", exacte copy aan de
   Developer/design system) — niet de eerder voorgestelde subtiele
   tekstlink (zelfde understatement als "← terug naar bardienst"), en ook
   geen even zwaar gewicht als de PIN-tegels zelf.
   - **Waarom niet subtiel meer:** onder ADR 0005 is e-mail/wachtwoord niet
     langer een uitzonderingspad voor wie het ooit koos (het oude
     either/or-model, ADR 0003) maar de enige gegarandeerd werkende
     inlogmethode voor 100% van bardienst/beheerder. Sterker: voor een lid
     zonder PIN (nooit een PIN gehad, of net zelf uitgezet via "Mijn
     account", zie punt 3) verschijnt dat lid door de
     `useBarStaff()`-wijziging (zie Leeshook-wijziging) helemaal niet meer
     in de `StaffPicker`-grid — voor zo'n lid is deze knop niet "de
     uitzondering", het is **de enige deur**. Een subtiele
     understatement-link past bij "noodpad voor een enkeling"; het past
     niet bij "enige deur voor een deel van de bezetting, universele
     garantie voor de rest".
   - **Waarom niet even zwaar als de PIN-tegels:** de dagelijkse,
     tientallen-keren-per-dienst-flow blijft PIN voor wie een PIN heeft —
     daar is `StaffPicker` voor ontworpen en dat blijft de snelste weg. Een
     knop met hetzelfde visuele gewicht als de tegels zou een route
     promoten die de meeste bardienst-leden zelden gebruiken, ten koste van
     de snelheid van de dagelijkse flow. Een herkenbare, volwaardige knop
     (geen miniatuur-tekstlink) met secundaire styling (outline/
     ghost-variant, geen primary-kleur) geeft de universele-voordeur-status
     het gewicht dat ADR 0005 vereist, zonder met de dagelijkse PIN-flow te
     concurreren.
   - **Plaats/zichtbaarheid**: ongewijzigd t.o.v. het vorige voorstel — enkel
     zichtbaar op de stafkeuze-staat (`barStaff.status === "ready"`), naar
     `/beheer`. Zie Schermflow stap 0 (bijgewerkt hieronder).

3. **Waar "PIN aan-/uitzetten" leeft: "Mijn account."** Bram: er moet een
   "Mijn account"-scherm/-ingang komen; plaatsing aan de Architect. Het
   eerdere voorstel (een derde, kleinere ingang op het modus-keuzescherm,
   naast Bar/Beheer) wordt hier heroverwogen, niet zomaar herbevestigd — en
   blijkt bij die heroverweging niet alleen "nog steeds oké" maar **de
   enige plek die daadwerkelijk werkt**, gegeven hoe `set_own_pin` de
   aanroeper herleidt:
   - `set_own_pin` herleidt de aanroeper via `select * into v_actor from
     members where auth_user_id = auth.uid()`. Dat vereist een sessie
     waarin `auth.uid()` daadwerkelijk het individuele lid is — dus een
     sessie die tot stand kwam via het lid se **eigen**
     e-mail/wachtwoord-login (`/beheer`, Schermflow stap 1).
   - **Bar-modus, bereikt via de gedeelde PIN-stafkeuze, is daarom
     technisch géén plek waar "Mijn account" kán werken.** Die sessie is
     de gedeelde tablet-/device-sessie (`docs/ARCHITECTURE.md` → "Device
     sign-in mechanism"; `src/middleware.ts` logt het tablet in als één
     vast device-account, ongeacht wie er als bezetting geselecteerd is).
     `auth.uid()` is dan het device-account, niet het individuele lid —
     `set_own_pin` zou op zo'n sessie altijd `actor_not_found` teruggeven
     (het device-account heeft geen eigen `members`-rij). Dit is geen
     stijlkeuze maar een rechtstreeks gevolg van hoe bezetting/attributie
     werkt (CLAUDE.md → Architectuurbeslissingen, "`served_by` komt uit de
     bezetting, niet uit een PIN") — elke plek binnen Bar-modus zelf valt
     dus af als kandidaat, ook al zou dat voor sommige leden korter voelen.
   - **Het modus-keuzescherm (Schermflow stap 2) is de enige plek die alle
     volgende eisen tegelijk vervult**: (a) uitsluitend bereikbaar via een
     echte individuele e-mail/wachtwoord-sessie, nooit via de gedeelde
     device-sessie; (b) even natuurlijk bereikbaar voor `bardienst` als
     voor `beheerder`, zonder dat een van beide eerst een modus moet
     kiezen die niet bij de eigen rol past — Beheer-modus/`BeheerTabs.tsx`
     is voor een `bardienst`-lid weliswaar zichtbaar (rolgebaseerde
     filtering van de modus-tegels is buiten scope, ADR 0003 →
     Beslissing 4), maar functioneel een beheerder-scherm waarvan de
     schrijfacties voor een `bardienst`-lid toch op ADR 0002's actorcheck
     stuklopen — "Mijn account" daar plaatsen zou een zelfbedieningsactie
     voor iedereen verstoppen achter een effectief beheerder-only scherm;
     en (c) een plek die door zijn aard al tussen sessie-start en gekozen
     werkcontext in zit — precies waar een korte, niet-modale
     instellingenactie hoort, in plaats van middenin een van de twee echte
     werkmodi.
   - **Naamgeving:** de ingang heet **"Mijn account"** (Bram's eigen
     woordkeuze), niet "Mijn PIN instellen" zoals het vorige voorstel
     suggereerde — dat laatste dekte alleen de huidige inhoud, niet het
     concept dat Bram benoemt en dat later (buiten dit ticket) meer kan
     gaan bevatten dan alleen de PIN-toggle.
   - Zie Schermflow stap 6 (bijgewerkt hieronder) voor de definitieve
     uitwerking — dit is geen voorstel meer.

Openstaande vraag 2 uit de versie van deze spec vóór de ADR 0005-herziening
("terug naar PIN blijft geblokkeerd zonder al bestaande `pin_hash`") was al
eerder vervallen verklaard — zie "Besloten door de Architect" hieronder voor
de expliciete verificatie waarom, in plaats van dat aan te nemen.

## Onderzocht in /designs/

`designs/Bar App.dc.html` heeft twee elementen die eerder al bekeken zijn
(vorige versie van deze spec) en met het nieuwe model opnieuw beoordeeld
zijn:

- **"Anders inloggen"-sheet** (`methodSheetOpen`, regel 1449–1467): e-mail/
  wachtwoord en magic link staan hier geframed als **noodingang** ("Normaal
  tik je jezelf aan en typ je je pincode. Deze twee zijn voor als dat niet
  lukt.", regel 1454). Onder het nieuwe model is dat frame nog minder
  passend dan onder het oude either/or-model: wachtwoord is niet een
  uitzondering voor wie het koos, het is de gegarandeerde basis voor
  iedereen. Dit scherm blijft dus geen bruikbaar ontwerp voor de
  navigatie-ingang zelf (zie "Definitieve keuzes" punt 2 voor de definitieve
  vorm) — hooguit voor losse stijlelementen, zoals de vorige versie al
  concludeerde.
- **Modus-keuzekaart** (`showModeChoice`, regel 1334–1354): nog steeds een
  bruikbaar visueel precedent voor Schermflow stap 2 — ongewijzigd
  bruikbaar, dit onderdeel raakt Beslissing 1 niet.

**Nieuw onderzocht voor deze herziening — `designs/Lid App.dc.html`
(portal), "Instellingen"-scherm (regel 660–735):** dit scherm is voor een
andere doelgroep (leden op hun eigen telefoon, niet bar/beheer-personeel op
een gedeeld tablet) maar toont wél, voor het eerst in `/designs/`, precies
het patroon dat Bram nu voor #42 vraagt:

- Regel 447: *"Drie inlogmethodes: Wachtwoord, pincode (alleen op dit
  toestel) of opnieuw een inloglink per mail. Pincode is een sneltoets, geen
  vervanging van het account."* — letterlijk het nieuwe model (wachtwoord
  als basis, PIN als sneltoets), alleen dan voor `lid`-rol leden op de
  portal in plaats van bardienst/beheerder-leden op de bar-shell.
- Regel 668/680/714: een "Wachtwoord wijzigen"/"Pincode instellen"-sheet
  binnen een "Instellingen"-scherm, zelfbediening, met een bevestigingsstap
  ("Voer dezelfde 4 cijfers nog een keer in") en de tekst "Kies 4 cijfers om
  in te loggen zonder wachtwoord."
- **Dit is geen bruikbaar 1-op-1 ontwerp voor `shells/bar`**: het is een
  volledig scherm binnen `shells/portal`'s navigatie (een tabblad/menu-item
  dat in de bar-shell niet bestaat), voor een rol (`lid`) die geen dienst
  start. Het bevestigt wél dat het gevraagde patroon al een keer is
  doordacht in het ontwerp — alleen nooit voor bar/beheer-personeel. Er was
  hiervoor geen wireframe voor *waar in `shells/bar`* dit hoort, alleen het
  bewijs dat het concept elders al bestaat — zie "Definitieve keuzes (Bram,
  2026-09-19)" punt 3 hieronder voor de plek die de Architect op basis
  hiervan én op basis van `set_own_pin`'s technische eisen heeft vastgelegd.

`designs/Lid App.dc.html`'s `loginMethods` (regel 140/447/600) blijft, zoals
de vorige versie al vaststelde, een ander scherm voor een ander doel (leden
die zelf op hun telefoon inloggen) — niet van toepassing op bar/beheer-
personeel, maar nu dus wel de bron van het hergebruikte *principe*.

## Doel

Elk lid met rol `bardienst` of `beheerder` heeft altijd, gegarandeerd, een
werkende e-mail/wachtwoord-login (ADR 0005 → Beslissing 1). In de eigen
profielinstellingen kan zo'n lid optioneel een PIN aan- of uitzetten als
snelkoppeling voor de gedeelde bar-tablet — een PIN vervangt het wachtwoord
nooit, schakelt het nooit uit, en beide kunnen tegelijk actief zijn (ADR 0005
→ Beslissing 2/3). Na een succesvolle e-mail/wachtwoord-login kiest de
ingelogde persoon een echte modus — **Bar** of **Beheer** — in plaats van
(zoals #14 bouwde) altijd rechtstreeks naar de productenlijst te gaan.
**Bar**-modus is, hoe ook ingelogd, functioneel identiek aan de bestaande
PIN-flow (#6/#7): zelfde `start_shift`/`add_shift_member`/
`remove_shift_member`, zelfde `served_by`-attributie uit de bezetting — dit
ticket bouwt geen tweede bar-mechanisme, het opent alleen een tweede weg
ernaartoe (ADR 0003 → Beslissing 3, ongewijzigd door ADR 0005).

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6/#7/#14: er is geen dienst- of
beheerconcept in `shells/portal`, en portal-login blijft ongewijzigd
e-mail-only (CLAUDE.md → Auth). PIN-toggle voor `lid`-rol leden bestaat al
conceptueel in het portal-ontwerp (zie "Onderzocht in /designs/") maar is
geen onderdeel van dit ticket — dit ticket bouwt alleen de
bardienst/beheerder-kant.

Raakt vier bestaande plekken, geen van alle als herbouw:

- **`src/features/dienst-starten/DienstStarten.tsx`** — krijgt de nieuwe
  navigatie-ingang (Schermflow stap 0). De PIN-staffkeuze/PinPad zelf zijn
  ongewijzigd (#6, `docs/features/dienst-starten.md` blijft geldig) — zie
  wel de leeshook-wijziging hieronder.
- **`src/features/assortimentbeheer/`** (`Assortimentbeheer.tsx`,
  `BeheerLogin.tsx`, `useBeheerSession.ts`) — gegeneraliseerd van
  "beheerder-only" naar "bardienst-of-beheerder", plus een nieuwe
  modus-keuze-stap ertussen. `BeheerTabs.tsx`/`ProductenLijst.tsx`/
  `LedenLijst.tsx`/`NegatieveLimietInstellingen.tsx` blijven **ongewijzigd**.
- **`src/features/ledenbeheer/LidBeherenOverlay.tsx`** — krijgt een nieuwe,
  **alleen-lezen** "Inloggegevens"-sectie (zie Schermflow stap 7) — geen
  beheerder-bewerkbare selector meer, zie "Besloten door de Architect"
  hieronder voor waarom dat verschilt van de vorige versie.
- **Nieuw: een "Mijn account"-scherm**, ingang op het modus-keuzescherm (zie
  "Definitieve keuzes" punt 3 en Schermflow stap 6) waar een
  bardienst/beheerder-lid de eigen PIN zelf aan-/uitzet. Dit is de enige
  daadwerkelijk nieuwe schermcomponent in deze spec.

**Route: `/beheer` blijft ongewijzigd, wordt niet hernoemd.** Zelfde
motivatie als de vorige versie (PWA-standalone verbergt de URL toch, en
hernoemen raakt de magic-link-redirect-configuratie voor niets) — dit is niet
geraakt door ADR 0005. De letterlijke kop "Beheer" (`BeheerLogin.tsx` regel
62) verdwijnt nog steeds vóór een modus gekozen is — zie Schermflow stap 1,
ongewijzigd t.o.v. de vorige versie.

## Datamodel

**Geen nieuw enum-type, geen nieuwe kolom op `members`.** Dit is de
belangrijkste wijziging t.o.v. de vorige versie. Onder het either/or-model
had `set_member_auth_method` een expliciete vlag nodig om te weten *welke*
van twee exclusieve staten een lid koos; onder het nieuwe model zijn er geen
twee exclusieve staten meer om te onderscheiden — er is alleen een vraag
"heeft dit lid een PIN aan staan?", en die vraag beantwoordt de bestaande
kolom al volledig:

- **`pin_hash is not null`** = PIN-snelkoppeling staat aan. Geen nieuwe
  kolom nodig — dit is exact wat `pin_hash` al sinds `0001_init.sql`
  betekent, alleen kreeg het nooit een expliciete "aan/uit"-lezing omdat er
  tot nu toe geen zelfbedienings-toggle voor bestond.
- **`auth_user_id is not null`** (bestaand, `0001_init.sql`) = lid heeft een
  gekoppeld Supabase Auth-account, dus *kán* met wachtwoord inloggen. ADR
  0004 → Beslissing 1 maakt dit voor elk `bardienst`/`beheerder`-lid
  verplicht als **eindsituatie** — maar deze migratie voegt **geen**
  `not null`- of `check`-constraint toe die dat afdwingt. Bram heeft
  bevestigd (zie "Definitieve keuzes" punt 1) dat er vandaag geen echt
  Aurora-lid bestaat dat zo'n constraint zou breken — dit is dus geen geval
  van "voorkomt vandaag een crash op bestaande rijen". De constraint blijft
  toch achterwege, om twee andere, wel nog geldige redenen: (a)
  `supabase/seed.sql`'s eigen lokale/CI-fixture (Tom Willems — Sanne Bakker
  kreeg sinds #19 zelf een e-mail/wachtwoord-account, zie "Definitieve
  keuzes" punt 1) modelleert bewust precies deze overgangsstaat om
  `start_shift`/de PIN-stafkeuze te kunnen testen — een harde constraint
  zou `supabase start`/CI breken op data die met opzet zo is opgezet; en
  (b) *of/wanneer*
  een toekomstig, wél bestaand geval van deze staat verplicht naar een
  account gemigreerd moet worden is ADR 0005 → Beslissing 5's bewust
  opengelaten beleidsvraag — een schema-constraint zou die handhavingstiming
  stilzwijgend beslissen zonder dat Bram dat gedaan heeft. Deze spec staat
  dus een **overgangsstaat toe die vandaag geen enkel echt lid raakt**, maar
  wel de lokale/CI-fixtures en een eventueel toekomstig geval — zie
  Randgevallen voor het concrete gedrag daarvan (zo'n lid kan gewoon met PIN
  blijven werken, kan zichzelf alleen geen wachtwoord-fallback geven totdat
  een account geprovisioned is).
- **Geen wijziging aan hoe `pin_hash`/`auth_user_id` samen mogen voorkomen.**
  Beide gezet is de normale, verwachte eindsituatie (ADR 0005 → Beslissing
  3) — er is geen constraint die dat verbiedt of afdwingt, exact zoals ze nu
  al onafhankelijk van elkaar bestaan.

**`useAlleLeden()`/`LedenbeheerLid` (ledenbeheer's leeshook) krijgt twee
nieuwe, informatieve velden**, niet één `authMethod`-veld zoals de vorige
versie voorstelde:

- `hasPin: boolean` (`pin_hash is not null`)
- `hasAccount: boolean` (`auth_user_id is not null`)

Beide zijn **alleen-lezen weergave-velden** voor `LidBeherenOverlay.tsx` (zie
Schermflow stap 7) — geen van beide wordt via deze hook of overlay
geschreven; de daadwerkelijke PIN-mutatie is zelfbediening (zie RPC's).

## RPC's

- **`set_own_pin(p_pin text)` — nieuwe RPC, zelfbediening, geen
  beheerder-only actie.** Migratie `supabase/migrations/0014_pin_zelfbediening.sql`
  (opeenvolgend na `0007_ledenbeheer.sql`). Verifieert de aanroeper via
  `auth.uid()` — **niet** ADR 0002's beheerder-only actorcheckvorm (die
  eist `role = 'beheerder'`), maar een lichtere variant die alleen eist dat
  de aanroeper een niet-gearchiveerd `bardienst`- of `beheerder`-lid is en
  bij *zichzelf* schrijft:
  1. `select * into v_actor from members where auth_user_id = auth.uid() and
     not archived` → geen rij: `actor_not_found`.
  2. `v_actor.role not in ('bardienst', 'beheerder')` → `no_bar_role`
     (zelfde foutcode-naam als `start_shift` al gebruikt voor hetzelfde
     soort afwijzing — een `lid`-rol lid heeft geen bar-PIN-concept, dat
     blijft zo).
  3. `p_pin is null` → `update members set pin_hash = null where id =
     v_actor.id` (PIN uitzetten). Anders: `p_pin` moet voldoen aan
     `p_pin ~ '^[0-9]{4}$'` (zelfde 4-cijferige formaat als de bestaande
     PinPad, `docs/features/dienst-starten.md`) → anders
     `invalid_pin_format`; voldoet het wel, dan
     `update members set pin_hash = crypt(p_pin, gen_salt('bf')) where id =
     v_actor.id` (PIN aanzetten/wijzigen).
  4. Retourneert de bijgewerkte `members`-rij (zelfde vorm als
     `set_member_role`/`set_member_archived`).
  - **Geen `auth_user_id`-check nodig als voorwaarde om een PIN aan te
    zetten.** Dit lijkt op het eerste gezicht tegenstrijdig met "wachtwoord
    is verplicht", maar is bewust: de aanroeper *bewijst al* een werkend
    wachtwoordaccount te hebben door deze RPC via een `authenticated`-sessie
    met een geldige `auth.uid()` aan te roepen — er bestaat geen pad waarop
    iemand zonder account deze RPC ooit bereikt. Een expliciete
    `auth_user_id is not null`-check zou dus dode code zijn.
  - **Geen zelfreferentie-guard nodig** (in tegenstelling tot
    `set_member_role`/`set_member_archived`): een lid kan zichzelf met deze
    RPC nooit buitensluiten — wachtwoord-login blijft überhaupt ongemoeid,
    en zelfs het uitzetten van de eigen PIN kan nooit een sessie breken
    omdat de sessie zelf al via wachtwoord tot stand kwam.
  - `grant execute on function set_own_pin to authenticated;`
- **`start_shift` — geen wijziging.** De vorige versie van deze spec voegde
  een `auth_method <> 'pin'`-voorwaarde toe om "nooit allebei" af te
  dwingen; die handhaving is met ADR 0005 overbodig **en fout** geworden —
  er is niets meer om af te dwingen, PIN-login moet gewoon blijven werken
  zolang `pin_hash is not null`, ongeacht of er ook een wachtwoord bestaat.
  `start_shift` doet dat vandaag al precies zo (`0001_init.sql`, regel
  171: `v_member.pin_hash is null or crypt(p_pin, v_member.pin_hash) <>
  v_member.pin_hash`) — **geen migratie nodig voor deze RPC**, de vorige
  versie se geplande wijziging vervalt volledig, niet gedeeltelijk.
- **`set_member_auth_method` — vervalt volledig, wordt niet gebouwd.** De
  vorige versie ontwierp deze RPC (beheerder-only, exclusieve
  `'pin'`/`'email'`-keuze namens een ander lid) om de either/or-handhaving
  van ADR 0003 → Beslissing 1 te bedienen. Die handhaving bestaat niet meer
  (ADR 0005) en de vervangende actie (PIN aan-/uitzetten) is zelfbediening,
  niet iets wat een beheerder namens een ander lid doet — zie "Besloten door
  de Architect" hieronder voor waarom hier bewust geen beheerder-equivalent
  voor terugkomt.
- **Geen wijziging aan `place_order`/`top_up`/`add_shift_member`/
  `remove_shift_member`** — ongewijzigd, zoals de vorige versie ook al
  vaststelde.

## Leeshook-wijziging

**`useBarStaff()` (`src/hooks/queries/useBarStaff.ts`) — wijziging, geen
nieuwe hook.** Voegt `.not("pin_hash", "is", null)` toe aan de bestaande
query (naast `role in (...)`/`archived = false`). Dit is een andere
implementatie dan de vorige versie (die filterde op `auth_method = 'pin'`,
een kolom die niet meer bestaat), maar dezelfde motivatie, letterlijk uit de
hook se eigen bestaande commentaar: *"filtering here is just so the
staff-picker doesn't offer a choice that can only fail."* Een lid zonder PIN
(nooit een PIN gehad, of zelf uitgezet in de nieuwe profielinstellingen) kan
sowieso nooit via de PIN-stafkeuze inloggen — tonen zou altijd op
`invalid_pin` uitlopen. Zo'n lid blijft gewoon bereikbaar via de
e-mail/wachtwoord-route (Schermflow stap 1–2), wat onder het nieuwe model
altijd werkt, in tegenstelling tot onder het oude model waar "geen PIN"
soms ook "geen enkele werkende inlogmethode" betekende.

**Dit lost, als bijwerking, ook `docs/features/dienst-starten.md` →
Randgevallen's al langer bestaande, gedocumenteerde gat op** ("Lid heeft nog
nooit een PIN gekregen" verschijnt vandaag gewoon in de PIN-stafkeuze en
faalt altijd op `invalid_pin`) — na deze wijziging verdwijnt zo'n lid
simpelweg uit die keuze. `dienst-starten.md` zelf wordt hier niet herschreven
(gemergede spec, gedrag van #6 zelf verandert niet) — dit is puur een
gevolg van de nieuwe query, geen nieuw gedrag in `start_shift` of `PinPad`.

Het type `BarStaffMember` en de geselecteerde kolommen (`id, name, role`)
blijven ongewijzigd.

## Besloten door de Architect

Drie punten die de issue-tekst en Bram's reactie zelf niet expliciet
uitspraken, hieronder gemotiveerd vanuit ADR 0005/bestaande code in plaats
van als aanname:

1. **Openstaande vraag 2 uit de vorige versie is vervallen, niet alleen
   "minder relevant".** Die vraag ging over een lid dat naar `'email'`
   overstapte en vervolgens nooit meer terug naar PIN kon zonder een oude,
   nog werkende `pin_hash` — omdat de vorige spec expliciet **geen**
   "geef dit lid een nieuwe PIN"-RPC bouwde (buiten scope, "self-service
   PIN-uitgifte/-reset"). Onder het nieuwe model bestaat die hele situatie
   niet meer: er is geen "overstappen" — een lid dat een PIN wil, zet 'm
   zelf aan via `set_own_pin`, ongeacht of er ooit eerder een PIN was.
   Bram's eigen beschrijving ("je kan in je profielinstellingen aangeven
   dat je een pin wil") *is* letterlijk de self-service PIN-uitgifte die de
   vorige versie bewust buiten scope hield. Dat is dus geen toevallige
   bijwerking van het gewijzigde model — het is een directe, expliciete
   scope-uitbreiding die uit Bram's eigen woorden volgt, niet een aanname
   van de Architect. Zie RPC's → `set_own_pin`.
2. **Geen beheerder-equivalent van de oude `set_member_auth_method`-RPC.**
   Denkbaar alternatief: een beheerder-only RPC die de PIN van een ander
   lid kan resetten (bv. voor een lid dat de eigen PIN vergeten is en niet
   zelf bij de instellingen kan). Niet gebouwd: onder het nieuwe model werkt
   wachtwoord altijd, dus een lid dat de PIN vergeten is, logt gewoon met
   wachtwoord in en zet in de eigen profielinstellingen een nieuwe PIN —
   geen tussenkomst van een beheerder nodig. Dat was onder het oude
   either/or-model wél nodig (een lid zonder werkende PIN én zonder
   wachtwoord zat vast), maar die noodsituatie kan nu per definitie niet
   meer bestaan. Mocht Bram toch een beheerder-gestuurde
   reset-voor-een-ander willen (bv. omdat een lid zelf niet goed met de
   profielinstellingen overweg kan), dan is dat een nieuw, apart te
   beslissen ticket — geen architectuurprincipe dat deze spec vooruitloopt.
3. **`LidBeherenOverlay.tsx` krijgt geen bewerkbare PIN-selector, alleen
   alleen-lezen status.** De vorige versie liet een beheerder namens een
   ander lid tussen `'pin'`/`'email'` kiezen; dat paste bij een exclusieve
   keuze die iémand moest vastleggen. Onder het nieuwe model is er niets
   exclusiefs meer om namens een ander lid vast te leggen — de enige
   schrijfactie (PIN aan/uit) is zelfbediening (punt 2 hierboven). Een
   beheerder kan nu wel zien of een lid een PIN heeft en een gekoppeld
   account heeft (nuttig om te signaleren dat een lid nog geprovisioned
   moet worden — vandaag naar verwachting nooit, zie "Definitieve keuzes"
   punt 1), maar niet namens dat lid schrijven. Zie Schermflow stap 7.

## Schermflow

0. **Navigatie-ingang op de bar-shell root** (`DienstStarten.tsx`,
   `barStaff.status === "ready"`-tak, stafkeuzescherm) — **definitief, zie
   "Definitieve keuzes" punt 2**: een zichtbare, secundair gestileerde knop
   over de volle breedte, direct onder de `StaffPicker`-grid, bijvoorbeeld
   "Inloggen met e-mail" (exacte copy aan Developer/design system), naar
   `/beheer`. Geen tekstlink meer, geen even zwaar gewicht als de
   PIN-tegels — zie de motivatie hierboven. Alleen zichtbaar op de
   stafkeuze-staat.
1. **`/beheer`, geen sessie** (`BeheerLogin.tsx`, gegeneraliseerd) —
   ongewijzigd t.o.v. de vorige versie: neutrale kop ("Inloggen" i.p.v.
   "Beheer"), `deniedMessage` generieker. Dit klopt nu nog sterker dan
   voorheen: dit inlogformulier is niet langer de ingang voor "wie voor
   e-mail koos", het is de gegarandeerde ingang voor **iedereen** met
   bardienst/beheerder-rol.
2. **`/beheer`, sessie herleidt naar een actieve `bardienst`- of
   `beheerder`-rij** — ongewijzigd t.o.v. de vorige versie voor de
   **Bar**/**Beheer**-tegels zelf (visuele vorm van `showModeChoice`, regel
   1334–1354). **Definitief, zie "Definitieve keuzes" punt 3**: dit scherm
   krijgt daarnaast een derde, kleinere ingang **"Mijn account"** (zie
   Schermflow stap 6) — de enige plek in deze spec waar dat kan werken,
   omdat dit het enige scherm is dat altijd op een individuele
   e-mail/wachtwoord-sessie draait, ongeacht of het lid daarna Bar of Beheer
   kiest.
3. **Bar-modus, eenmaal op `/`**: ongewijzigd, identiek aan de bestaande
   PIN-flow-schermen.
4. **Beheer-modus**: ongewijzigd, identiek aan vandaag.
5. **Uitloggen**: ongewijzigd.
6. **"Mijn account" — nieuw, definitief, zie "Definitieve keuzes" punt 3.**
   Een derde, kleinere ingang op het modus-keuzescherm (stap 2) — bijv. een
   tekstlink onder de twee Bar/Beheer-tegels (exacte vorm aan de
   Developer/design system, zie hieronder), met het label **"Mijn
   account"** (Bram's eigen woordkeuze, niet "Mijn PIN instellen": de naam
   dekt het concept, niet alleen de huidige PIN-toggle-inhoud). Bewust
   kleiner/onopvallender dan de Bar/Beheer-tegels — het is geen derde
   werkmodus die je "binnengaat", maar een korte zelfbedieningsactie die je
   bezoekt en weer verlaat om alsnog Bar of Beheer te kiezen. **Uitsluitend
   bereikbaar vanaf dit scherm** (dus na een individuele
   e-mail/wachtwoord-login), niet vanuit Bar-modus zelf — zie "Definitieve
   keuzes" punt 3 voor waarom dat laatste technisch niet kan werken
   (`set_own_pin` herleidt de aanroeper via `auth.uid()`, en de gedeelde
   PIN-stafkeuze draait op de device-sessie, niet op een individuele
   sessie). Opent een minimaal scherm/sheet met:
   - Een statusregel: "Je hebt nu wel/geen pincode ingesteld" (afgeleid van
     `pin_hash is not null` voor de ingelogde `auth.uid()`-rij — een nieuwe,
     kleine leeshook of hergebruik van een bestaand `members`-select met
     `auth_user_id = auth.uid()`-filter, exacte implementatie aan de
     Developer).
   - **PIN uitstaand**: een 4-cijferig invoerveld + bevestiging (zelfde
     "voer nogmaals in"-patroon als `designs/Lid App.dc.html` regel 714,
     visuele stijl aan de Developer/design system) → `set_own_pin(pin)` bij
     gelijke invoer.
   - **PIN aanstaand**: een "PIN uitzetten"-actie → `set_own_pin(null)`,
     directe bevestiging, geen aparte confirm-stap nodig (uitzetten kan
     nooit een lid buitensluiten, zie RPC's → `set_own_pin`).
   - Dit scherm is **niet** rolafhankelijk zichtbaar — elk lid dat via deze
     sessie het modus-keuzescherm bereikt (dus al bardienst of beheerder)
     mag de eigen PIN beheren.
   - **Definitief besloten, geen voorstel meer** (zie "Definitieve keuzes"
     punt 3) — de plaatsing op het modus-keuzescherm is niet alleen de
     UX-voorkeur van de Architect maar de enige plek die functioneel werkt
     gegeven `set_own_pin`'s `auth.uid()`-herleiding. De exacte visuele
     vorm (tekstlink vs. knop, sheet vs. inline) blijft aan de
     Developer/design system, de locatie niet.
7. **`LidBeherenOverlay.tsx` — nieuwe, alleen-lezen "Inloggegevens"-sectie**
   (vervangt de vorige versie se bewerkbare "Inlogmethode"-sectie, zie
   "Besloten door de Architect" punt 3), alleen zichtbaar wanneer
   `member.role` (laatst **opgeslagen** rol) `'bardienst'` of `'beheerder'`
   is:
   - Twee statusregels, zelfde visuele vorm als de bestaande
     Saldo-regel in dezelfde overlay (`flex items-center justify-between`,
     geen invoerveld): "Wachtwoordaccount" → "gekoppeld"/"niet gekoppeld"
     (`hasAccount`), "Pincode" → "ingesteld"/"niet ingesteld" (`hasPin`).
   - **Geen "Opslaan"-knop, geen schrijfactie** — puur signalerend. Een
     beheerder die hier "niet gekoppeld" ziet, weet dat dit lid de
     handmatige provisioning-stap (Supabase Studio, zie Randgevallen) nog
     moet krijgen — maar voert die stap niet via deze overlay uit (blijft
     buiten de app, zie Expliciet buiten scope).

## Rolzichtbaarheid

Ongewijzigd t.o.v. de vorige versie — ADR 0005 raakt Beslissing 2/3/4 van
ADR 0003 niet, en dit hele hoofdstuk van de vorige versie (sessieniveau,
RPC-niveau, bar-modus) volgde daaruit, niet uit Beslissing 1. Eén
toevoeging: **de nieuwe "Mijn account"-ingang (Schermflow stap 6) is
zichtbaar voor zowel `bardienst` als `beheerder`** — geen rolcheck nodig,
`set_own_pin` schrijft alleen bij de aanroeper zelf en de rolcheck zit al in
de RPC (`no_bar_role`).

## Randgevallen

- **Bardienst/beheerder-lid met `pin_hash is not null` maar
  `auth_user_id is null`** — vandaag **alleen aanwezig als lokale/CI-
  seedfixture** (Tom Willems in `supabase/seed.sql`; Sanne Bakker kreeg
  sinds #19 zelf een e-mail/wachtwoord-account, zie boven), niet bij
  enig echt Aurora-lid (bevestigd door Bram, zie "Definitieve keuzes" punt
  1) — geen actief migratiescenario, wel gedocumenteerd gedrag voor het
  geval dit ooit alsnog voorkomt: zo'n lid kan gewoon met PIN blijven
  werken — geen gedragswijziging. Zo'n lid kan **niet** zelf een
  wachtwoordaccount koppelen (dat blijft, net als in de vorige versie van
  deze spec, buiten scope — handmatige provisioning) en kan dus ook geen
  gebruik maken van de e-mail/wachtwoord-route totdat dat gebeurt is. Dit
  voldoet niet aan ADR 0005's eindmodel ("wachtwoord verplicht"), maar is
  geen bouwverplichting van dit ticket — zie "Definitieve keuzes" punt 1.
- **Bardienst/beheerder-lid met `auth_user_id is not null` maar
  `pin_hash is null`** (het nieuwe, gewenste eindmodel voor wie geen PIN
  wil): logt in via `/beheer`, kiest een modus. Verschijnt niet in de
  PIN-stafkeuze (`useBarStaff()`-wijziging). Geen probleem, geen foutpad —
  dit is een volwaardig, verwacht eindresultaat, geen randgeval in de zin
  van "iets dat mis kan gaan".
- **`set_own_pin`-formaatfout** (`p_pin` niet 4 cijfers, niet `null`) →
  `invalid_pin_format`, Nederlandse boodschap in het "Mijn account"-scherm
  (bv. "een pincode is 4 cijfers", exacte tekst aan Developer), geen
  wijziging aan `pin_hash`.
- **Race-conditie bij gelijktijdige `set_own_pin`-aanroepen** (zelfde lid,
  twee tabbladen) — zelfde buiten-scope-afweging als elders in deze
  codebase (#29 en navolgende specs); laatste schrijfactie wint, geen
  optimistic-locking.
- **A11y**: `e2e/a11y.spec.ts` uitbreiden met (a) de modus-keuzestaat op
  `/beheer` (ongewijzigd t.o.v. vorige versie se plan), (b) het nieuwe "Mijn
  account"-scherm/sheet (nieuw, stateful — eigen testcase nodig, zie
  `bezetting-beheren.md`/`ledenbeheer.md`'s precedent), en (c) de
  uitgebreide (nu alleen-lezen) Lid-beheren-overlay (bestaande scan
  uitbreiden, geen nieuw scenario nodig).
- **`db:test`**: nieuwe negatieve tests voor `set_own_pin`
  (`invalid_pin_format`, `actor_not_found`, `no_bar_role` voor een
  `lid`-rol account met een gekoppeld `auth_user_id`). **Geen** tests meer
  voor `start_shift` se eerder geplande `auth_method`-check (die wijziging
  vervalt volledig) en **geen** tests voor `set_member_auth_method` (die RPC
  wordt niet gebouwd).

## Expliciet buiten scope

- **Self-service e-mailaccount-koppeling/-uitnodiging voor bardienst/
  beheerder-leden zonder `auth_user_id`** — blijft #24's territorium
  (ledenbeheer's bestaande, nog niet gebouwde uitnodigingsflow). Handmatige
  provisioning (Supabase Studio, zelfde patroon als Femke Bos in
  `seed.sql`) blijft de enige weg — vandaag is er, per "Definitieve keuzes"
  punt 1, geen bestaand geval dat deze weg zou moeten bewandelen; mocht dat
  ooit ontstaan, dan geldt nog steeds handmatige provisioning totdat #24
  gebouwd is, geen impliciete scope-uitbreiding van dit ticket.
- **Een geforceerde migratie/deadline voor bestaande PIN-only leden** — niet
  nodig om hier te beslissen: "Definitieve keuzes" punt 1 bevestigt dat er
  vandaag geen bestaand geval is om te migreren. ADR 0005 → Beslissing 5's
  handhavingstiming voor een eventueel toekomstig geval blijft een
  onbeantwoorde beleidsvraag, hier bewust niet beslist.
- **Beheerder-gestuurde PIN-reset voor een ander lid** — zie "Besloten door
  de Architect" punt 2: niet nodig onder het nieuwe model, geen RPC/scherm
  hiervoor.
- **Wachtwoord wijzigen/"wachtwoord vergeten"-flow** — Supabase Auth's eigen
  wachtwoord-herstel (buiten deze app om) blijft de enige weg, ongewijzigd
  t.o.v. de vorige versie.
- **Rolgebaseerde filtering van de modus-keuzetegels** — ongewijzigd buiten
  scope, zelfde motivatie als de vorige versie (RPC handhaaft, scherm
  filtert niet vooraf).
- **Issue #22** ("Alternatieve inlogmethoden bar-shell naast PIN") — deze
  spec blijft, zoals ADR 0003 aankondigde, de volledige voortzetting van
  #22's scope; ADR 0005 verandert daar niets aan. **Aanbeveling aan Bram**:
  #22 sluiten zodra deze (herziene) spec gebouwd is.

## `useShell()`-contract

Ongewijzigd t.o.v. de vorige versie voor het modus-keuzescherm (volledig
scherm, geen overlay, geen `useShell().overlay`-gebruik). Het nieuwe "Mijn
account"-scherm (Schermflow stap 6) is klein genoeg om als sheet/overlay te
bouwen (`useShell().overlay`, zelfde patroon als andere overlays in
`shells/bar`) — geen vaste-layout-argument zoals bij het modus-keuzescherm.
De locatie (modus-keuzescherm) staat vast (zie "Definitieve keuzes" punt 3);
de concrete visuele vorm (sheet vs. inline, exacte copy) blijft aan de
Developer/design system.

## Beveiligingsfix na Reviewer-bevinding (Architect, 2026-09-19)

**Blokkerende bevinding van de Reviewer op de Developer-implementatie
(commit `fc07c62`, branch `claude/next-ticket-8gwda6`):** `pin_hash` (de
bcrypt-hash van een 4-cijferige PIN) komt bij de client terecht, terwijl
alleen een boolean nodig is. Een 4-cijferige PIN heeft een zoekruimte van
10.000 — zodra de hash op het netwerk/in React-state ligt, is offline
brute-forcen triviaal; dat maakt bcrypt voor dit doel praktisch zinloos. Dit
is een implementatiefix op wat hierboven al gespecificeerd staat (`hasPin`
als alleen-lezen boolean, Datamodel/RPC's/Schermflow stap 6/7) — **geen**
heroverweging van ADR 0005 (wachtwoord verplicht, PIN optionele
snelkoppeling via `pin_hash is not null`): die betekenis van de kolom blijft
ongewijzigd, alleen hoe die betekenis de client bereikt verandert.

### Wat er precies lekt — breder dan de twee gerapporteerde regels

De Reviewer wees op twee directe `select`s
(`useAlleLeden.ts:53`/`useBeheerSession.ts:74`) die `pin_hash` expliciet
opvragen om alleen `!== null` te toetsen. Bij uitzoeken blijkt de kolom via
een **tweede, ouder mechanisme** al langer op de kabel te staan, van vóór
dit ticket:

- `create_member`, `update_member_name`, `set_member_archived`,
  `set_member_role` (alle vier `supabase/migrations/0007_ledenbeheer.sql`,
  dus **vóór** #42) zijn `returns members` — PostgREST serialiseert bij een
  RPC-aanroep de volledige teruggegeven rij, kolom voor kolom, inclusief
  `pin_hash`. Dat gebeurt al sinds 0007, ongeacht wat de TypeScript-kant met
  het antwoord doet. #42 zelf voegde geen nieuwe blootstelling op dit punt
  toe — het voegde alleen de client-code toe die dat al aanwezige veld
  (`useCreateMember.ts`/`useSetMemberRole.ts`/`useSetMemberArchived.ts`/
  `useUpdateMemberName.ts`, elk `data.pin_hash !== null`) voor het eerst
  daadwerkelijk *las*. De hash stond al in elke Network-tab sinds
  ledenbeheer werd gebouwd, alleen ongebruikt.
- `set_own_pin` (`supabase/migrations/0014_pin_zelfbediening.sql`, wél #42)
  is dezelfde vorm: `returns members`, dus retourneert ook de eigen
  zojuist-gezette hash aan de aanroeper zelf. Minder ernstig (de aanroeper
  kent de PIN al, die heeft 'm net getypt) maar dezelfde onnodige
  blootstelling, met dezelfde technische oorzaak.
- `useBarStaff.ts` filtert met `.not("pin_hash", "is", null)` — dit selecteert
  de kolom niet in de payload, maar PostgREST/Postgres vereist wel
  kolomniveau-`SELECT`-recht op `pin_hash` om er in een filter naar te
  verwijzen. Relevant omdat de hieronder gekozen fix (kolom-`REVOKE`) deze
  aanroep anders stuk zou maken — geen lek op zichzelf, wel een
  noodzakelijke meeverhuizing.

**Conclusie van het "is dit een pre-existing patroon"-onderzoek:** ja, ten
dele. Er bestaat geen eerder, wél-goed-afgeschermd `has_pin`-precedent om te
kopiëren (`grep` naar `REVOKE`/`create view`/`generated always` in
`supabase/migrations/` levert alleen insert/update/delete-REVOKEs op, zie
0001/0004/0005 — nooit een kolomniveau-`SELECT`-REVOKE of view). Het
onderliggende probleem (`returns members` lekt élke kolom) bestaat al sinds
0007, dus dit ticket dicht een gat dat groter is dan de twee door de
Reviewer aangewezen regels — anders zou de fix theater zijn: de exacte hash
blijft dan alsnog via vier andere RPC's op de kabel staan.

### Gekozen vorm: generated column `has_pin` + kolom-`REVOKE` + scrub in elke RPC die een volledige rij teruggeeft

Overwogen opties (zie opdracht):

1. **View die alleen een boolean exposeert, `pin_hash` zelf column-level
   `REVOKE`d.** Deze codebase heeft nergens een `create view` (geverifieerd,
   zie hierboven) — een nieuw schema-object introduceren voor iets dat een
   kolom net zo goed oplost, is meer machinerie dan nodig. Belangrijker: een
   view lost het `returns members`-lek helemaal niet op — een
   `security definer`-functie serialiseert een al-berekende rijwaarde, dat
   loopt nooit via een view of via `SELECT`-rechten van de aanroeper. Optie 1
   alleen zou dus **onvoldoende** zijn, met of zonder view.
2. **Boolean via een RPC in plaats van een rechtstreekse `select`.** Past
   niet bij het bestaande leespatroon: `members` wordt vandaag overal
   (`useAlleLeden`, `useMembers`, `useBarStaff`) via een gewone `select` +
   RLS gelezen — RPC's zijn in deze codebase gereserveerd voor
   actor-gecontroleerde *schrijf*acties (ADR 0002-vorm), niet voor lezen. Een
   RPC alleen voor deze ene boolean zou een tweede leespatroon naast het
   bestaande introduceren, voor iets dat een kolom net zo goed dekt.
3. **Gekozen: een `generated`-kolom `has_pin` op `members`, kolomniveau-
   `REVOKE` op `pin_hash` voor `authenticated`, én elke RPC die vandaag een
   volledige `members`-rij teruggeeft (`create_member`, `update_member_name`,
   `set_member_archived`, `set_member_role`, `set_own_pin`) wist `pin_hash`
   uit de teruggegeven rij vóór de `return`.** Dit is de enige optie die
   *beide* lekpaden met één mechanisme dicht (rechtstreekse `select` én
   RPC-return), blijft binnen het bestaande "REVOKE als extra slot naast RLS"
   -idioom (`CLAUDE.md` → Verificatie, `0001_init.sql` regel 135-137,
   `0004_revoke_app_settings_writes.sql`, `0005_assortimentbeheer.sql`), en
   voegt geen nieuw schema-objecttype toe.

### Migratie: nieuwe `supabase/migrations/0010_pin_hash_kolombeveiliging.sql`

Nieuwe migratie, niet een wijziging van `0014_pin_zelfbediening.sql` —
zelfde append-only-conventie als de rest van `supabase/migrations/` (zie
bv. `0002_fix_start_shift_pgcrypto_search_path.sql`, dat ook een fix op
`0001_init.sql` is via een nieuwe migratie, niet door 0001 te bewerken).

**Correctie na het mergen van `main` (2026-09-20) — de kale kolom-REVOKE
hieronder werkt niet, en is vervangen.** Dit bestand heette bij het
schrijven ervan nog `0009_pin_hash_kolombeveiliging.sql`; het is hernummerd
naar `0010` omdat `main` intussen zelf `0009` claimde
(`0009_ledenbeheer_email_rpc_gated_read.sql`, issue #57/PR #59). Die
merge bracht iets belangrijkers aan het licht dan alleen een
bestandsnummerbotsing: PR #59's **eerste** fixpoging voor `members.email`
deed precies dezelfde soort kale `revoke select (<kolom>) on members from
authenticated` als stap 2 hieronder oorspronkelijk beschreef — en die bleek
in een echte `db:test`-run tegen een live Postgres **geen effect te hebben**
(`caught: no exception, wanted: 42501`). Oorzaak, vastgelegd in
[ADR 0004](../adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md) → "Correctie
(Bram, na een echte `db:test`-run in CI, PR #59)": `authenticated` heeft via
Supabase's platform-brede default-privileges al een **tabel-niveau**
`SELECT`-grant op `members` — een column-level `REVOKE` kan alleen intrekken
wat ooit expliciet op column-niveau gegeven is, nooit iets dat via een
bredere tabel-grant al toegankelijk is. Onze eigen `revoke select (pin_hash)
on members from authenticated` (stap 2 hieronder, in de originele
`0009_pin_hash_kolombeveiliging.sql`) is nooit tegen een echte database
geverifieerd (`db:test` kon in deze sandbox niet draaien, zie de
commit-boodschap van `3c4b307`) en heeft vermoedelijk exact hetzelfde,
nooit-bewezen probleem.

**Deze keer wel geverifieerd, niet aangenomen.** `npm run db:test` (het echte
pgTAP/CI-pad) kon ook tijdens deze merge niet draaien (geen Docker, uitgaand
verkeer naar `*.supabase.co` geblokkeerd — bekende sandboxbeperking, zie de
opdracht voor deze merge). Wél beschikbaar in deze sandbox: een kale, lokale
Postgres 16-server (`pg_ctlcluster`/`psql`, geen Supabase/pgTAP). Daarmee is,
vóórdat deze migratie werd vastgesteld, eerst een geïsoleerd
GRANT/REVOKE-experiment gedraaid dat exact `main`'s eerdere fout reproduceert
(kale column-REVOKE tegen een tabel-brede GRANT heeft geen effect — bevestigd)
én aantoont dat een latere `grant select (<lijst zonder pin_hash>)` een
eerder gegeven, expliciete column-level `pin_hash`-grant niét intrekt (GRANT
stapelt, het vervangt geen kolomlijst) — dat laatste was een aanname in een
eerdere versie van deze aantekening die empirisch **onjuist** bleek, vandaar
de expliciete `revoke select (pin_hash) ...` die nu wél in stap 2 hieronder
staat. Daarna is de **volledige migratieketen** (`0001` t/m `0010`, inclusief
beide `0008`-bestanden en `main`'s `0009`) tegen een verse database
toegepast — geen enkele migratie faalt, er bestaat maar één `create_member`-
functie (drie parameters, geen achtergebleven tweeparameterversie), en
`create_member`/`update_member_name`/`set_member_archived`/`set_member_role`/
`set_own_pin`/`update_member_email` geven stuk voor stuk `pin_hash: null`
terug terwijl `email` gewoon meekomt; een rechtstreekse `select pin_hash`/
`select email from members` als `authenticated` faalt met "permission
denied". Dit is geen vervanging van een echte `db:test`-run (geen RLS-
policy-evaluatie via PostgREST, geen pgTAP-assertions, geen Supabase-eigen
rolopzet) maar wel een aanzienlijk sterker bewijs dan "leest logisch klopt",
en dekt precies het mechanisme (Postgres' eigen privilegemodel) waar de
vorige, ongeverifieerde poging op vastliep.

De echte fix, nu toegepast in `0010_pin_hash_kolombeveiliging.sql`: bouw
voort op `main`'s `0009_ledenbeheer_email_rpc_gated_read.sql`, dat al
`revoke select on members from authenticated;` (de hele tabel) deed, gevolgd
door een `grant select (<kolommen zonder email>) on members to
authenticated;`. Onze migratie voegt daar geen nieuwe tabel-brede `REVOKE`
aan toe (die staat al) — alleen een nieuwe `grant select (...)` met dezelfde
kolomlijst, min `pin_hash`, plus de nieuwe `has_pin`-kolom:

```sql
grant select (
  id, name, role, balance_cents, archived, created_at, auth_user_id, has_pin
) on members to authenticated;
```

Een latere column-level `GRANT`/`REVOKE` op dezelfde tabel stapelt met een
eerdere (het is geen "laatste wint"-vervanging van de hele
kolomtoegangslijst) — een kolom die niet in déze `grant`-lijst staat, blijft
dus alsnog ontoegankelijk zolang geen enkele actieve `grant` hem noemt. Omdat
de tabel-brede `SELECT` al ingetrokken is door `main`'s migratie, is precies
zeggen welke kolommen wél mogen de enige manier om iets zichtbaar te maken —
`pin_hash` simpelweg weglaten uit deze tweede `grant` is voldoende om hem
dicht te houden, er hoeft geen aparte `revoke select (pin_hash) on members
from authenticated` naast.

De vijf RPC-scrubs (stap 3 hieronder, en `update_member_email` uit `main`'s
`0008_ledenbeheer_email.sql` die er ongepland bij kwam, zie verderop) blijven
onveranderd nodig — dat is verdediging in de diepte tegen een heel ander
lekpad (een `security definer`-RPC die de volledige rij teruggeeft is nooit
onderhevig aan een `authenticated`-kolom-`REVOKE`, ongeacht of die zelf werkt)
en heeft niets te maken met de vraag of de `REVOKE`/`GRANT` op de tabel zelf
klopt.

1. **Nieuwe kolom, geen aparte view:**
   ```sql
   alter table members
     add column has_pin boolean generated always as (pin_hash is not null) stored;
   ```
   Eén plek die "heeft PIN" definieert — zelfde uitdrukking
   (`pin_hash is not null`) als de rest van deze spec al gebruikt, nu als
   kolom in plaats van als losse client-side afleiding op zes plekken.
2. **Kolomniveau-afscherming, het technische slot — hieronder de
   oorspronkelijke, inmiddels achterhaalde beschrijving; zie de
   "Correctie na het mergen van `main`"-alinea hierboven voor wat er
   werkelijk in `0010_pin_hash_kolombeveiliging.sql` staat.** Oorspronkelijk
   opgeschreven als:
   ```sql
   revoke select (pin_hash) on members from authenticated;
   ```
   Dat is **niet** wat de uiteindelijke migratie doet — een kale
   column-level `REVOKE` heeft geen effect zolang `authenticated` de kolom
   al via een tabel-brede `GRANT` kan lezen (zie de correctie hierboven). De
   werkelijke implementatie is een hernieuwde `grant select (...)` die
   `pin_hash` weglaat, bovenop `main`'s tabel-brede `revoke select on
   members from authenticated;` (uit `0009_ledenbeheer_email_rpc_gated_read.sql`).
   Werkt naast de bestaande tabelbrede `members_select ... using (true)`-RLS-
   policy (`0001_init.sql` regel 124) — RLS bepaalt welke *rijen* zichtbaar
   zijn, dit bepaalt welke *kolom* onzichtbaar blijft, ongeacht welke rijen
   een policy toelaat. Raakt `start_shift`/andere `security definer`-RPC's se
   **interne** gebruik van `pin_hash` niet (die lezen de tabel als
   functie-eigenaar, niet als `authenticated`) — alleen rechtstreekse
   client-`select`s en client-side filters op de kolom lopen hierop vast.
3. **Scrub vóór elke `return` die een volledige `members`-rij teruggeeft** —
   vijf functies, telkens dezelfde ene regel toegevoegd vlak vóór de
   bestaande `return v_member;`, verder ongewijzigd (`create or replace
   function` met identieke signatuur/returntype — geen `drop function`
   nodig, dus ook geen her-`grant execute`):
   ```sql
   v_member.pin_hash := null;
   return v_member;
   ```
   Toe te passen in (`create or replace function` van elk, met de rest van
   het functielichaam ongewijzigd overgenomen uit de aangehaalde migratie):
   - `create_member` (`0007_ledenbeheer.sql`, vlak vóór de bestaande
     `return v_member;` na de `insert ... returning * into v_member;`).
   - `update_member_name` (`0007_ledenbeheer.sql`, idem, na de `update ...
     returning * into v_member;`).
   - `set_member_archived` (`0007_ledenbeheer.sql`, idem).
   - `set_member_role` (`0007_ledenbeheer.sql`, idem).
   - `set_own_pin` (`0014_pin_zelfbediening.sql`) — **op allebei de
     `return`-punten**: zowel de `p_pin is null`-tak (PIN uitzetten) als de
     tak die `pin_hash = crypt(p_pin, gen_salt('bf'))` zet (PIN aan/wijzigen).
     `has_pin` (de generated column) reflecteert in beide gevallen automatisch
     de nieuwe staat, omdat de `update ... returning *` na de schrijfactie
     plaatsvindt.

   **Twee aanpassingen t.o.v. de oorspronkelijke lijst, noodzakelijk gemaakt
   door het mergen van `main`:**
   - `create_member`'s handtekening is op `main`
     (`0008_ledenbeheer_email.sql`) gewijzigd naar drie parameters
     (`p_name, p_starting_balance_cents, p_email default null`) — Postgres
     behandelt dat als een ander functie-object dan de oorspronkelijke
     tweeparameterversie. `0010_pin_hash_kolombeveiliging.sql` redefinieert
     daarom de **drie**-parameterversie (met de `p_email`-verwerking uit
     `main` ongewijzigd overgenomen), niet de oude tweeparameterversie —
     anders zou de daadwerkelijk aangeroepen functie (drie parameters) de
     scrub missen en zou een dode, nooit-aangeroepen tweeparameterversie
     overblijven.
   - `update_member_email` (nieuw op `main`, `0008_ledenbeheer_email.sql`)
     heeft dezelfde vorm als de vijf hierboven (`returns members`,
     beheerder-actorcheck, `returning * into v_member; return v_member;`
     zonder scrub) en lekt dus `pin_hash` op dezelfde manier. Niet in de
     oorspronkelijke vijf genoemd omdat de RPC nog niet bestond toen dit
     ticket geschreven werd. `0010_pin_hash_kolombeveiliging.sql` past
     dezelfde scrub hierop toe, om dezelfde reden als de andere vijf —
     dit is een expliciete uitbreiding tijdens het mergen, geen
     stilzwijgende aanname; zie de PR-omschrijving voor de motivatie.

   De teruggegeven `members`-rij bevat na deze wijziging altijd
   `pin_hash: null` (ongeacht de werkelijke staat) en het correcte `has_pin`
   ernaast — precies zoals een rechtstreekse `select` op `members` dat na
   stap 1/2 ook doet.

### Wat de Developer aan de clientkant aanpast

Zes bestaande hooks, geen nieuwe hook, geen nieuw type-veld (`hasPin` bestaat
al op `LedenbeheerLid`/`BeheerSessionState` — alleen de **bron** verandert):

- **`src/hooks/queries/useAlleLeden.ts`** — `.select("id, name, role,
  balance_cents, archived, auth_user_id, has_pin")` (was: `..., pin_hash`);
  `hasPin: row.has_pin as boolean` (was: `row.pin_hash !== null`).
- **`src/hooks/queries/useBeheerSession.ts`** — `.select("name, role,
  has_pin")` (was: `..., pin_hash`); `hasPin: data.has_pin as boolean` (was:
  `data.pin_hash !== null`).
- **`src/hooks/queries/useBarStaff.ts`** — `.eq("has_pin", true)` (was:
  `.not("pin_hash", "is", null)`) — noodzakelijke meeverhuizing door de
  kolom-REVOKE in stap 2 hierboven, geen gedragswijziging (zelfde leden
  verschijnen/verdwijnen uit de PIN-stafkeuze).
- **`src/hooks/queries/useCreateMember.ts`**,
  **`useSetMemberRole.ts`**, **`useSetMemberArchived.ts`**,
  **`useUpdateMemberName.ts`** — elk `hasPin: data.pin_hash !== null` wordt
  `hasPin: data.has_pin as boolean`. Geen `.select(...)`-wijziging nodig (dit
  zijn RPC-aanroepen, geen `select`s) — de RPC's eigen teruggegeven rij bevat
  na de migratie gewoon `has_pin` naast (het altijd-`null`) `pin_hash`.
- **`useSetOwnPin.ts`** — geen wijziging: deze hook leest vandaag alleen
  `error` uit de RPC-respons, nooit `data`/`pin_hash` — de scrub in
  `set_own_pin` (migratiestap 3) raakt hem dus niet.
- **Code-commentaar dat `pin_hash is not null` als de leeswijze noemt**
  (`useAlleLeden.ts` regel 26, `useBeheerSession.ts` regel 33-34,
  `useCreateMember/useSetMemberRole/useSetMemberArchived/
  useUpdateMemberName.ts`'s `pin_hash`-commentaarregels) — bijwerken naar
  `has_pin`, anders wijst het commentaar na deze fix naar een kolom die de
  client niet meer mag lezen.

### `db:test`/`check:rls`

Nieuwe negatieve test nodig (`check:rls` → "elke policy een negatieve test"
dekt dit niet letterlijk, dit is kolomniveau in plaats van rijniveau, maar
verdient dezelfde soort dekking): bevestig dat een `authenticated`-sessie een
`permission denied for column pin_hash`-fout krijgt bij een rechtstreekse
`select pin_hash from members`, en dat `select has_pin from members` wél
slaagt. **Niet mijn scope om dit testbestand te schrijven of de al gestagede
Tester-bestanden (`e2e/a11y.spec.ts`,
`supabase/tests/set_own_pin.test.sql`, `supabase/tests/start_shift.test.sql`)
aan te raken** — dit is voor de Tester, na de Developer's implementatie.
Bestaande SQL-tests die vandaag rechtstreeks op `pin_hash`'s waarde
controleren (`set_own_pin.test.sql`, `ledenbeheer.test.sql`,
`start_shift.test.sql`, `negatieve_saldolimiet.test.sql`, `place_order.test.sql`,
`end_shift.test.sql`, `assortimentbeheer.test.sql`, `shift_members.test.sql`,
`top_up.test.sql`) blijven werken: die draaien serverside tegen een echte
database, niet als de `authenticated`-rol via PostgREST, dus de kolom-REVOKE
(die alleen `authenticated` raakt) heeft daar geen effect op.

### Niet gewijzigd door deze fix

- ADR 0005 zelf, en de betekenis van `pin_hash is not null` als "heeft PIN
  aan" — ongewijzigd, nu alleen via `has_pin` gelezen in plaats van via de
  ruwe kolom.
- `start_shift`'s interne PIN-verificatie (`0001_init.sql`/
  `0002_fix_start_shift_pgcrypto_search_path.sql`) — leest `pin_hash` als
  functie-eigenaar, nooit als `authenticated`, dus ongeraakt door de
  kolom-REVOKE.
- Alle overige RPC's/Schermflow-stappen/Randgevallen hierboven in deze spec —
  ongewijzigd, dit is uitsluitend een transportlaag-fix.
- `list_members_admin()` (`main`'s eigen RPC,
  `0009_ledenbeheer_email_rpc_gated_read.sql`) — **opgelost, niet langer een
  restbeperking.** Deze RPC deed zelf `return query select * from members
  order by name asc;` zonder scrub, en had dus, om precies dezelfde reden
  als de zes RPC's hierboven, de ruwe `pin_hash` gewoon in de RPC-respons
  staan — de kolom-`REVOKE`/`GRANT` op de tabel raakt een
  `security definer`-functie se eigen `select *` niet. Oorspronkelijk hier
  bewust ongewijzigd gelaten (instructie: "main's functie, niet dubbel
  definiëren") en gemeld als openstaande vraag aan Bram/Architect. Bram
  heeft alsnog expliciet akkoord gegeven om dit te fixen; opgelost in
  `0011_list_members_admin_pin_hash_scrub.sql` (nieuw ticket, zelfde issue
  #42).

  Andere vorm dan de zes scrubs hierboven: die muteren een losse
  `v_member`-variabele (`v_member.pin_hash := null;`) na een enkele
  insert/update `returning * into`. `list_members_admin()` heeft geen
  rij-variabele — het is `return query select * from members ...` die
  meteen een hele `setof members` teruggeeft. `returns setof members`
  vereist dat elke rij van de `return query`-select positioneel matcht met
  de kolommen van `members` (aantal en type, niet per se de namen) — de
  kolom simpelweg weglaten uit de select zou dus een kolomaantal-mismatch
  geven en is geen optie. De oplossing: de `select *` vervangen door een
  expliciete kolommenlijst met `null::text as pin_hash` op precies de plek
  waar `pin_hash` in `members` staat, zodat elke rij nog aan het
  `setof members`-contract voldoet maar de kolom zelf nooit de echte hash
  bevat. Identieke signatuur/returntype -> `create or replace function`,
  geen `drop function`, dus ook geen her-`grant execute` nodig (0009's grant
  blijft staan).

  **Empirisch bevestigd, niet alleen afgeleid**: de volledige migratieketen
  (`0001` t/m `0011`) is tegen een echte, verse lokale Postgres 16 toegepast
  (geen Supabase/pgTAP-stack, wel echte GRANT/REVOKE/RLS-semantiek), met
  gestubde `auth.uid()`/`auth.users`. Vóór `0011`: `select * from
  list_members_admin()` als `authenticated`, met een geldige
  beheerder-JWT-sub, gaf de bcrypt-hash nog gewoon terug in de `pin_hash`-
  kolom (reproductie van de restbeperking). Ná `0011`: hetzelfde aanroep
  geeft `pin_hash: null` terug, met `has_pin` en alle overige kolommen
  (inclusief `email`) ongewijzigd correct meekomend; een rechtstreekse
  `select pin_hash from members` in dezelfde sessie blijft, ongewijzigd
  door `0011`, falen met "permission denied".

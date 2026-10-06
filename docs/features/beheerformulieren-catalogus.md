# Beheerformulieren en catalogus duidelijker

**Status: gebouwd** (PR #169, merge `5610f7c`). Goedgekeurd door Bram ("Pak
aanbevelingen": alle aanbevelingen van de vragen 1 t/m 6 overgenomen, zie
"Besluiten van Bram" onderaan). Waar de bouw van de spec hieronder afwijkt,
staat de waarheid in "Zoals gebouwd" direct hierna.

Spec voor [issue #131](https://github.com/BramLambertJansen/ABAS/issues/131)
(frontend T11 · P2/P3, epic #121, findings F23, F24, F25, F26; productbesluit
D5). Gevalideerd tegen `main` op `2116633` (2026-10-05, na T05 #125, T06 #126,
T07 #127, T09 #129, T10 #130 en #115). Alleen frontend: geen RPC, migratie,
schema, RLS of auth-beleid.

## Zoals gebouwd

Gebouwd in PR #169 (issue #131, T11, epic #121), merge `5610f7c`. Alleen
frontend, geen RPC, migratie, RLS of auth-beleid. Wat hieronder staat gaat
voor op de spec-tekst verderop waar die afwijkt.

### Afwijkingen van de spec

- **Naam niet in `meta`.** `LidBeherenOverlay` zet de naam niet in het
  `meta`-slot, maar in de bestaande beschrijving "Wijzigingen aan {naam}.".
  `meta` bevat de rolbadge (BAR/BEHEER), "GEARCHIVEERD" indien van
  toepassing en "Saldo € x,xx" (`formatCents`).
- **Groepen en sectienamen.** De `h3`-groepen zijn Profiel, Toegang,
  Bestellingen en Archief, zoals gespecificeerd. De `OpslaanSectie`-groepen
  daarbinnen heten (via de nieuwe `label`-prop, `role="group"`): "Naam
  wijzigen", "Contactadres wijzigen", "Rechten wijzigen", "Inloggegevens" en
  "Archiveren".
- **`Overlay variant="detail"` in sheet-vorm.** De spec zei dat `detail` in de
  portal-sheet niets doet. Gebouwd: in sheet-vorm toont `detail` wel de
  detail-kop (titel, beschrijving, `meta`, Sluiten-knop), maar die is daar
  **niet vast**: kop, lichaam en onderkant zitten in de ene scrollende
  container van de sheet en scrollen mee; de modal-vorm (`max-w-[640px]`, vaste kop, scrollend
  lichaam, onderkant met weggooien-vraag en statusregel) is alleen voor
  `detailModal`. Niet bereikbaar zolang alleen de bar-shell "Lid beheren"
  gebruikt; er is geen portalconsument.
- **Sectiestatus.** `sectieStatus` (`src/lib/opslaan.ts`) is de pure helper
  (`onopgeslagen` wint van `opgeslagen`; een fout geeft `null`).
  `OpslaanSectie` kreeg `label`, `kop`, `status` en `statusTekst`. De
  statusregel (`role="status"`) is altijd gemount met gereserveerde hoogte.
  De losse toast in "Lid beheren" is vervallen. Contactadres gebruikt
  `statusTekst` "Contactadres opgeslagen." resp. "Contactadres opgeslagen.
  Het inlogadres is niet gewijzigd." (bij account); archiveren toont
  "Gearchiveerd"/"Teruggezet".
- **Contactadresteksten** staan in
  `src/features/ledenbeheer/contactadresTeksten.ts`, gedeeld door
  `LidBeherenOverlay` en `NieuwLidOverlay` (label, uitleg altijd, extra bij
  account, extra bij openstaande uitnodiging, extra zonder adres, opgeslagen-
  teksten).
- **Herstelroutetekst.** Productoverlay: "Het product verdwijnt van het
  verkoopscherm. Verkoophistorie blijft bestaan. Terugzetten kan onder
  ‘Uit assortiment’." Lidoverlay (sectie Archief): "Het lid verdwijnt uit de
  verkoopzoeker. Saldo en bestellingen blijven bewaard. Terugzetten kan onder
  ‘Archief’ in de ledenlijst." Voor een al gearchiveerd lid blijft de bestaande
  tekst "lid kan weer tikken en opwaarderen".
- **`ZoekVeld` en `StatusFilter`** zijn uit `LedenLijst` getild en staan in
  `src/components/`; beide lijsten gebruiken ze. Filterlogica staat in
  `src/features/assortimentbeheer/beheerProductFilter.ts` (zonder imports,
  feature-eigen, onafhankelijk van `features/verkoop`),
  `isLaatsteActieveType` in `laatsteActieveType.ts` (los bestand, niet in
  `ActiviteitstypesInstellingen`).

### Fixes na Codex-review

- **Invite-succesvlag.** `saveEmail` neemt `email`, `invitedAt` en `hasAccount`
  uit de RPC-return over en wist de succesvlag "Uitnodiging verstuurd" als
  `invitedAt` leeg is (de uitnodiging is dan vervallen).
- **`leegReden` kijkt over alle statussen.** Matcht de zoekterm alleen in de
  andere status, dan geeft `leegReden` `leeg-filter` (verwijzing naar de
  andere chip) in plaats van `geen-treffers`. De bestaande tekst is gebruikt:
  "Geen actieve producten. Bekijk Uit assortiment." resp. "Geen producten uit
  assortiment." Een preciezere formulering (bijvoorbeeld met de zoekterm of
  het aantal treffers in de andere chip) is een **open vraag aan Bram**.
- **Focusherstel activiteitstype.** Na archiveren/herstellen unmount de rij
  tijdens het verversen; de focus wordt pas hersteld als de lijst weer `ready`
  is (ref `focusNaVerversen` + `useHerstelFocus`). Bij een mislukte
  archivering en bij "Annuleren" gaat de focus direct terug naar de knop van
  de rij.

### Wat niet is gedaan

- Echte tablet (768 en 1024) met schermtoetsenbord open in "Lid beheren".
- Schermlezer (VoiceOver/TalkBack): of de sectiestatus wordt aangekondigd.
- Echte uitnodigingsmail (de fixture bewijst geen bezorging).
- Live `check:a11y` en `db:test` door CI zijn niet door de Docs-stap
  gecontroleerd (geen backend gewijzigd, dus `db:test` verwacht ongewijzigd).
- De catalogusgrootte is onbekend (vraag 4/B4); er is geen categoriefilter of
  sorteerkeuze gebouwd.

### Bekende beperkingen en follow-ups (Tester, zonder fix)

- Na een mislukte opslag heeft `sectieStatus` geen "Niet opgeslagen"-label
  (`fout` geeft `null`): de foutregel van de sectie vervangt de status, zoals de
  spec zei, maar de gebruiker ziet bij de fout niet dat de invoer niet is
  opgeslagen.
- De `timedOut`-alert ("onbekende uitkomst") in "Lid beheren" staat in het
  scrollende lichaam en kan bij een lang profiel buiten beeld staan.
- Een nieuw product dat buiten het actieve zoekfilter of de gekozen chip valt
  is na toevoegen niet zichtbaar (zelfde gedrag als `LedenLijst`).
- De "laatste type"-waarschuwing blijft gezet (`bevestig`-staat) als een
  andere beheerder intussen een type toevoegt. Het blok is afgeleid van de
  geladen lijst en verdwijnt dus pas na een verversing; tot dan kan "Toch
  archiveren" nog getoond worden, en de staat kan terugkomen als het type
  later weer het enige actieve is.
- Geen hard verbod op archiveren van het laatste actieve type: een apart
  server-guard-ticket als dat gewenst is (B6).

Epic #121: #131 sluit via PR #169; #121 blijft open (T12, #132, resteert).

## Doel

Beheer blijft overzichtelijk naarmate leden, producten en acties groeien, en
de betekenis van het e-mailveld bij een lid is helder. Concreet:

1. Een beheerder weet bij het e-mailadres van een lid wat het wel en niet
   doet (F23).
2. "Lid beheren" is een rustig, gegroepeerd detailvenster waarvan naam en
   Sluiten altijd zichtbaar zijn, met per sectie zichtbaar of iets is
   opgeslagen (F24).
3. De productenlijst in beheer is zoekbaar en maakt onderscheid tussen actief
   en uit assortiment (F25).
4. Wie het laatste actieve activiteitstype archiveert, ziet vooraf het gevolg
   en een weg terug (F26).

## Gelezen bronnen

- **Ticket #131** en epic #121 (D5: "Waarschuwen met hersteloptie; hard
  verbod vraagt productbesluit"; "agents mogen besluiten niet ongemerkt
  invullen").
- **Wireframe** `designs/Bar App.dc.html`: Ledenbeheer, Assortiment en
  Instellingen kennen geen detailvariant, geen sectiestatus en geen
  laatste-type-waarschuwing. Per CLAUDE.md → Designbestanden is het in-app
  design system daarna de waarheid; afwijken is normale evolutie.
- **Code**: `src/components/{Overlay,OpslaanSectie,TekstVeld,ZijPaneel,Select,LeesFout}.tsx`,
  `src/features/ledenbeheer/{LidBeherenOverlay,NieuwLidOverlay,LedenLijst}.tsx`,
  `src/features/assortimentbeheer/{ProductenLijst,ProductBeherenOverlay,NieuwProductOverlay,ActiviteitstypesInstellingen,categories}.ts(x)`,
  `src/features/dienst-starten/ActiviteitKeuze.tsx`,
  `src/features/portal-profiel/AccountTab.tsx`,
  `src/hooks/queries/{useUpdateMemberEmail,useAlleLeden,useAlleProducten,useAlleActiviteitTypes}.ts`,
  `src/lib/{opslaan,veldFouten,email}.ts`, `e2e/` (zoeken waar "Lid beheren"
  wordt aangesproken).
- **Kaders**: `CLAUDE.md`, `ledenbeheer.md`, `ledenbeheer-email.md` (incl. de
  kop over ADR 0020), `lid-account-invite.md`, `assortimentbeheer.md`,
  `activiteittypes.md` (§ Schermflow 1 en "Expliciet buiten scope"),
  `dialogen-tabs-landmarks.md` (T05: "een variant mag de layout wijzigen,
  niet de focus-, inert-, scrolllock- of sluitregels"),
  `opslaan-sluiten-pending.md` (T06, Vraag E: T06 eerst, T11 daarna),
  `invoerfeedback-zoeken-filters.md`, ADR 0004 (PII-kolommen via RPC), ADR
  0014 (nooit gestapelde overlays), ADR 0020 (koppelen eist bewijs van
  mailbezit).

## Validatie van de bevindingen op actuele main

### F23: e-mail zonder uitleg. Bevestigd, plus een bijkomende bug

- `LidBeherenOverlay` toont "E-mailadres" met alleen een input en
  Opslaan, vlak boven "Inloggegevens". Nergens staat waarvoor het adres dient.
- De RPC wijzigt `members.email`, niet het Auth-adres. Koppeling loopt via
  `members.auth_user_id` (ADR 0020), dus een gekoppeld lid blijft gewoon
  inloggen met het adres van het Auth-account; het contactadres is alleen
  doel van de uitnodiging.
- **Er bestaat nergens een flow om een loginadres te wijzigen.** Geen
  `updateUser({ email })`, geen admin-RPC (alleen `updateUser` voor wachtwoord).
  De portal toont het sessie-adres wel (`AccountTab`, "Mijn account"). Het
  ticket zegt: bouw een vervolgstap alleen als hij echt bestaat. Er is dus
  geen knop of link voor wijzigen; de uitleg noemt alleen wat wél bestaat
  (zie besluit 2 en vraag 3).
- **Bijkomend (niet in het ticket):** sinds ADR 0020 / migratie `0040` wist
  `update_member_email` een openstaande uitnodiging als het adres
  (na `lower(trim())`) verandert. `saveEmail` in de overlay zet na een
  succesvolle opslag alleen `email` in de lokale lidstaat, terwijl de RPC-return
  `invitedAt` al meelevert (`useUpdateMemberEmail`). De overlay blijft daardoor
  "uitgenodigd op [datum], nog geen account" en "Invite opnieuw versturen"
  tonen voor een uitnodiging die niet meer bestaat. Dit is een
  presentatiefout die in dit ticket past (zelfde sectie), geen
  backendwijziging.

### F24: groot formulier in kleine dialoog. Bevestigd

`Overlay` (modal): `max-h-[88vh] w-full max-w-[460px] overflow-auto`, titel en
beschrijving staan in de scrollende inhoud. "Lid beheren" heeft zeven blokken
(saldo, naam, e-mail, rechten, inloggegevens, terugdraaien, archiveren) en een
Sluiten-knop helemaal onderaan; titel en Sluiten verdwijnen bij scrollen. De
succesmelding is een toast bovenaan de inhoud en valt bij een lage sectie
buiten beeld. T06 heeft het pending- en foutmodel per sectie al gebouwd
(`OpslaanSectie`, `isBezig`, `useOpslaanBlokkade`); T05 de focus-/inertregels.
Wat ontbreekt is layout en een zichtbare "opgeslagen/niet opgeslagen"-status
per sectie. Het ticket noemt "ruimer zijpaneel of eigen detailpagina" als
optie; zie vraag 1.

### F25: assortimentbeheer. Bevestigd, gedeeltelijk uitgesteld

`ProductenLijst` toont alle producten (server-sortering categorie, naam),
zonder zoek-, status- of categoriefilter. Alleen "N producten" in de kop;
gearchiveerd is herkenbaar aan een label ("Uit assortiment") en gedempte
naam. Naam en categorie zijn na aanmaken niet te wijzigen (`update_product_price`
en `set_product_archived` zijn de enige RPC's). Naam-/categoriebeheer vraagt
een nieuwe RPC en valt dus buiten dit frontendticket (zie "Expliciet buiten
scope"). De catalogusgrootte is niet uit de repo af te leiden (vraag 4).
`LedenLijst` heeft al precies het gewenste patroon (zoekveld, statuschips met
tellers, "geen leden gevonden"); dat is de maat.

### F26: laatste activiteit archiveren. Bevestigd

`ActiviteitstypesInstellingen.toggleArchived` archiveert direct, ook het laatste
actieve type. `ActiviteitKeuze` (dienst starten) toont wel "Geen actieve
activiteittypes — vraag een beheerder er een toe te voegen." De kaart zelf
zegt niets. `activiteittypes.md` heeft dit als bewust randgeval en zet "geen
actief type meer"-waarschuwing expliciet buiten scope; dit ticket draait dat om
voor de waarschuwing (niet voor een hard verbod, zie vraag 6).

### Al gebouwd of achterhaald

- **Pending-/foutmodel per sectie, focusherstel, `closeBlocked`, weggooien-vraag
  bij Escape/backdrop** (T05/T06): bestaat; blijft ongewijzigd en wordt
  hergebruikt. Het ticket verwijst hier zelf naar (#125/#126).
- **Zoek- en statusfilter voor leden** (`LedenLijst`): bestaat, is het
  voorbeeld voor producten.
- **Veldfouten voor e-mail** (`emailFout`, `VeldFout`, `useVeldMoment`, T07):
  bestaat, blijft.
- **Archiveren behoudt historie**: server-gedrag, al zo (`set_*_archived`,
  `unit_cents` bevroren). Het ticket vraagt alleen "begrijpelijke herstelroute";
  dat is een tekstzaak (zie besluit 8). Geen nieuw gedrag.
- **Een aparte "loskoppeling" of automatische accountmigratie**: expliciet geen
  deel van dit ticket.
- **Het ticket noemt T05/T06 als afhankelijkheid**: beide zijn gemerged,
  de afhankelijkheid is dus opgelost.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC**: niet geraakt. Het saldo in "Lid beheren" blijft een
  alleen-lezen weergave van server-waarde; "Bestelling terugdraaien" blijft een
  doorverwijzing naar `LidBestellingenOverlay` (ongewijzigd). Geen bedrag wordt
  door de client berekend.
- **`served_by` uit bezetting**: niet geraakt.
- **Auth**: geen wijziging in beleid. De e-mailuitleg beschrijft bestaand
  gedrag (ADR 0020, `ledenbeheer-email.md`). Geen nieuwe login- of
  koppelflow, geen PIN-wijziging.

## Betrokken shell

`shells/bar` (beheer). De detailvariant van `Overlay` is een gedeeld component
met een extra prop; in de portal-sheet (`overlay: "sheet"`) heeft hij geen
effect. Features blijven shell-onwetend (`check:arch`).

## Besluiten (conventioneel of door het ticket vastgelegd)

1. **`Overlay` krijgt een additieve prop `variant?: "standaard" | "detail"`**
   (default `standaard`, ongewijzigd gedrag voor alle bestaande overlays).
   `detail` doet in de modal-vorm: breder (`max-w-[640px]`, `w-full`, op 768px
   portret nog ruimte aan weerszijden door de bestaande `p-4` van de
   wrapper), een **vaste kop** (titel, beschrijving, een `meta`-slot en een
   Sluiten-knop) en een **scrollend lichaam** (`min-h-0 flex-1 overflow-auto`).
   De weggooien-vraag en de `role="status"`-regel blijven buiten het
   scrollgebied zichtbaar. Alle regels uit T05 (focus-trap, inert,
   scrolllock, `closeBlocked`, `onopgeslagen`, focus terug) lopen via dezelfde
   code; alleen markup/klassen verschillen. In `sheet`-vorm doet `detail`
   niets. Nieuwe props: `variant`, `meta?: ReactNode`.
2. **E-mailuitleg is statische tekst, geen claim over het Auth-adres.** Het
   veld heet "Contactadres". Altijd zichtbaar onder het veld: waarvoor het dient
   en dat het niet automatisch het inlogadres is. Extra regel als
   `member.hasAccount`: dat een afwijkend adres hier het inlogadres niet
   verandert en dat het lid blijft inloggen met het adres van zijn account.
   Extra regel als een uitnodiging openstaat (`invitedAt !== null`, geen account):
   dat een ander adres de openstaande uitnodiging laat vervallen. Het
   Auth-adres wordt in "Lid beheren" en "Nieuw lid" nergens getoond (zou een nieuwe RPC vragen: PII,
   ADR 0004; zie vraag 3). Geen link of knop voor "inlogadres wijzigen"
   omdat die flow niet bestaat.
3. **Presentatiefix `invitedAt`/`hasAccount` na opslaan e-mail**: `saveEmail`
   neemt `email`, `invitedAt` en `hasAccount` uit de RPC-return over (de rest
   van de lokale lidstaat blijft). De status in "Inloggegevens" is daarmee
   altijd gelijk aan de server.
4. **Secties in "Lid beheren"** (volgorde en kopjes, elk een `OpslaanSectie`
   binnen een gegroepeerd blok met een `h3`):
   - **Profiel**: naam, contactadres.
   - **Toegang**: rechten (rol), inloggegevens (account/pincode-status,
     uitnodiging).
   - **Bestellingen**: "Bestelling terugdraaien" (doorverwijzing).
   - **Archief**: lid archiveren/terugzetten (laatste blok, danger-stijl).
   Saldo en rolbadge staan niet meer als eigen blok in het scrollgebied maar
   in de vaste kop (`meta`): naam, rol-badge (BAR/BEHEER, zoals in
   `LedenLijst`), "Gearchiveerd" indien van toepassing en "Saldo € x,xx" met
   `formatCents`. Daardoor is context altijd zichtbaar.
5. **Sectiestatus.** `OpslaanSectie` krijgt een optioneel, additief
   `status`-veld: `"onopgeslagen" | "opgeslagen" | null`, getoond als een
   kleine statusregel in de sectiekop ("Niet opgeslagen" in de muted
   stijl met een tekstlabel, nooit alleen kleur; "Opgeslagen" met een vinkje
   als decoratief icoon). Regels:
   - `onopgeslagen` volgt `isTekstOnopgeslagen`/`isKeuzeOnopgeslagen`
     (T06), dus dezelfde definitie als `Overlay.onopgeslagen`; de ruimte voor
     de regel is altijd gereserveerd (geen layoutsprong).
   - `opgeslagen` verschijnt na een geslaagde actie van die sectie en blijft
     staan tot de invoer van die sectie weer wijzigt of de dialoog sluit. Een
     fout (`role="alert"` van T06) vervangt hem. De regel is `aria-live="polite"`
     (`role="status"`), per sectie.
   - Acties zonder invoer (uitnodigen, archiveren) tonen "Uitnodiging
     verstuurd" resp. "Gearchiveerd"/"Teruggezet" in hun eigen sectie.
   - De losse toast bovenaan "Lid beheren" **vervalt**: die staat buiten
     beeld bij lage secties en is precies de F24-klacht. Zelfde pending-/
     foutmodel, alleen de plek van de succesmelding verandert. `ProductBeherenOverlay`
     gebruikt `status` niet in deze ticket (geen groot formulier); de prop
     is optioneel zodat die overlay ongewijzigd blijft.
6. **Sluiten.** In de detailvariant staat Sluiten in de vaste kop; de Sluiten-
   knop onderaan vervalt (anders twee knoppen met dezelfde naam). Gedrag
   ongewijzigd t.o.v. T05/T06: de knop sluit direct (zoals de eigen
   Sluiten-knoppen nu al doen, T06 besluit B), is `disabled` zolang
   `closeBlocked`, Escape/backdrop vragen bij onopgeslagen invoer om
   bevestiging. Doordat elke sectie nu zijn "Niet opgeslagen"-status toont,
   is het weggooien zichtbaar voorspelbaar. Bestaande e2e-tests die op de
   knop "Sluiten" zoeken blijven werken (zelfde naam, andere plek).
7. **Producten: zoeken en status, naar het patroon van `LedenLijst`.** Nieuw
   zoekveld (naam en categorie, hoofdletterongevoelige substring met trim, zoals de
   verkoopzoeker en `LedenLijst`; geen accentnormalisatie, dat doet geen enkele
   zoeker nu) en statuschips **Actief | Uit assortiment** met
   tellers die meebewegen met de zoekterm (zoals "Actief/Saldo laag/Archief"
   in Leden). Standaardfilter **Actief** (vraag 5). Kop "N van M producten".
   Zoekterm en filter zijn lokale staat van `ProductenLijst` (geen
   persistentie). Een lege uitkomst onderscheidt drie gevallen:
   - geen producten bestaan: "Nog geen producten — voeg het eerste toe." (zoals nu);
   - zoekterm zonder treffers: "Geen producten gevonden voor “{zoekterm}”." met
     een knop "Zoekopdracht wissen";
   - filter zonder producten (bijv. niets uit assortiment): "Geen producten uit
     assortiment." / "Geen actieve producten. Bekijk Uit assortiment."
   Het filter en de tellers houden de volgorde van de server (categorie, naam).
   Een product dat via de overlay wordt gearchiveerd blijft in de open overlay
   staan (de overlay houdt zijn eigen momentopname) en verdwijnt na sluiten uit
   het Actief-filter; de overlay-melding zegt waar het te vinden is (besluit 8).
8. **Herstelroute bij archiveren (tekst).** Productoverlay: "Het product
   verdwijnt van het verkoopscherm. Verkoophistorie blijft bestaan. Terugzetten
   kan onder ‘Uit assortiment’." Lidoverlay (detail, sectie Archief): "Het lid
   verdwijnt uit de verkoopzoeker. Saldo en bestellingen blijven bewaard.
   Terugzetten kan onder ‘Archief’ in de ledenlijst." Na archiveren/terugzetten
   toont de sectiestatus het resultaat. Zie vraag 2 voor de definitieve
   teksten.
9. **Laatste actieve activiteitstype: inline waarschuwing, geen hard verbod,
   geen dialoog.** (Bevestigd door Bram, besluit B6.)
   - Klik op "archiveren" bij het type dat het enige actieve is (afgeleid van
     de geladen lijst: `actief = !archived`, precies één) opent in de rij een
     inline blok (`role="group"`, gelabeld) met: "Dit is het laatste actieve
     activiteitstype. Zonder actief type kan niemand een dienst starten."
     en twee knoppen: **"Eerst een type toevoegen"** (zet de focus op het veld
     "Nieuw activiteittype", sluit het blok, archiveert niet) en **"Toch
     archiveren"**; plus "Annuleren". Het archiveert pas na "Toch archiveren".
   - Voor alle andere types (en voor herstellen) verandert er niets: geen
     extra bevestigingen voor omkeerbare archiveringen (ticket).
   - Focus: bij openen naar "Annuleren" (veilige keuze); na afronden of
     annuleren terug naar de archiveerknop van die rij (`useHerstelFocus`).
   - **Staat zonder actief type** (na "Toch archiveren", of als het zo is
     binnengekomen): een vaste melding bovenin de kaart (`role="status"`, niet
     `alert`: het is een toestand): "Er is geen actief activiteitstype. Er kan
     geen dienst worden gestart. Herstel een type hieronder of voeg een nieuw
     type toe." Verdwijnt zodra er weer een actief type is. Wordt niet getoond
     tijdens laden of bij een leesfout, en niet bij een lege lijst (daar staat
     al "Nog geen activiteittypes — voeg het eerste toe.").
   - `ActiviteitKeuze` (dienst starten) blijft ongewijzigd.
10. **Eén gedeeld zoekveld.** `LedenLijst` heeft het zoekveld (loep-icoon,
    sr-only label, `type="search"`) inline; `ProductenLijst` zou het een
    derde en vierde kopie geven (Logboek, Transactielijst, Assortiment verkoop,
    LidZoeker en BezettingOverlay hebben eigen varianten). CLAUDE.md noemt
    duplicatie een reviewfout. Daarom wordt het zoekveld en de statuschips-groep
    uit `LedenLijst` verplaatst naar `src/components/ZoekVeld.tsx` en
    `src/components/StatusFilter.tsx` (props: `id`, `label`, `waarde`,
    `onChange`, `placeholder`; chips: `opties` met `id`, `label`, `aantal`,
    `actief`, `onKies`, `ariaLabel`). `LedenLijst` en `ProductenLijst` gebruiken
    ze. De andere zoekvelden hebben een andere maat/tekst en worden niet
    herschreven in deze ticket (geen scope-uitbreiding); een eventuele
    opruiming is een vervolg. Het uiterlijk van Leden verandert niet.
11. **Filterlogica is puur en unit-getest.** Nieuwe module
    `src/features/assortimentbeheer/beheerProductFilter.ts` met
    `filterBeheerProducten(products, { query, status })`, `telPerStatus(products,
    query)` en `leegReden(...)`; en in `ActiviteitstypesInstellingen` een kleine
    pure helper `isLaatsteActieveType(types, id)`. `features/verkoop/productFilter.ts`
    (`filterProducten`: alleen naam, plus categorie) past niet (ook status en
    categorie-zoek nodig) en is feature-eigen; niet importeren of aanpassen, wel
    dezelfde normalisatie (trim, lowercase, substring).
12. **Contactadres in `NieuwLidOverlay`**: dezelfde korte uitleg bij het veld
    (label "Contactadres (optioneel)" en de uitlegregel zonder
    account-/uitnodigingsvarianten), zodat de term op beide plekken gelijk is.
    Geen andere wijziging aan die overlay.

## Teksten (voorstel, zie vraag 2)

| Plek | Tekst |
|---|---|
| Label | "Contactadres" |
| Uitleg altijd | "Hierheen stuurt ABAS de uitnodiging. Dit is niet automatisch het adres waarmee het lid inlogt." |
| Extra bij account | "Dit lid heeft al een account. Een ander adres hier verandert het inlogadres niet; het lid blijft inloggen met het adres van het account (zichtbaar onder Mijn account in de portal)." |
| Extra bij open uitnodiging | "Een ander adres laat de openstaande uitnodiging vervallen; stuur daarna opnieuw een uitnodiging." |
| Opgeslagen (bij account) | "Contactadres opgeslagen. Het inlogadres is niet gewijzigd." |
| Opgeslagen (overig) | "Contactadres opgeslagen." |
| Sectiestatus | "Niet opgeslagen" / "Opgeslagen" |
| Zoekveld producten | "Zoek product op naam of categorie" |
| Chips | "Actief" / "Uit assortiment" |
| Zoeken zonder treffers | "Geen producten gevonden voor “{term}”." + "Zoekopdracht wissen" |
| Laatste type | zie besluit 9 |

Alle teksten Nederlands, `je`-vorm vermijden waar het over het lid gaat (derde
persoon), foutstijl `role="alert"` zoals bestaand.

## Randgevallen

- **Lang lid-profiel op 768px portret** (bar-ondergrens, D1): kop vast,
  lichaam scrolt, Sluiten blijft zichtbaar; de weggooien-vraag blijft onder
  de scroll zichtbaar. Toetsenbord in beeld op tablet verkleint het venster:
  `max-h` blijft `88vh`; het lichaam scrolt.
- **Lid zonder e-mail**: geen uitnodigingsknop (ongewijzigd), de contactadres-uitleg
  blijft staan; extra regel "Zonder contactadres kan er geen uitnodiging worden
  gestuurd."
- **Rol `lid`**: geen Pincode-regel (ongewijzigd).
- **E-mail alleen in hoofdletters gewijzigd**: de server wist de uitnodiging dan
  niet; de teruggegeven `invitedAt` is gelijk en de UI volgt de server
  (besluit 3), dus geen onjuiste melding.
- **E-mail wissen bij gekoppeld lid**: toegestaan (ongewijzigd). De opgeslagen-
  melding zegt dat het inlogadres niet is gewijzigd.
- **Sectie met fout én eerdere "Opgeslagen"**: de fout wint, `opgeslagen` wordt
  gewist bij een nieuwe poging.
- **Serialisatie (T06)**: tijdens een lopende actie tonen andere secties de
  bestaande "wacht tot de lopende wijziging klaar is". De `status`-regel
  verandert dat niet.
- **`member_not_found` (race)**: ongewijzigd (lijst ververst, melding in de
  sectie).
- **Productenlijst**: zoekterm met alleen spaties telt als leeg; zoeken in
  Actief vindt geen uit-assortiment-producten, dus de chip "Uit assortiment"
  toont het aantal treffers zodat een gearchiveerd treffer niet onzichtbaar
  blijft; lege `Actief`-tab met wél archiefproducten verwijst naar de andere chip.
- **Laatste type**: het blok tijdens een lopende archiveeractie van een ander
  type is niet bereikbaar (knoppen `disabled` zolang `archiving`, zoals nu).
  Twee beheerders tegelijk kunnen ertoe leiden dat de lijst na refetch
  anders is dan bij het openen van het blok; de server beslist, de melding
  volgt de verse lijst.
- **Gearchiveerd lid/product**: detailvariant en lijstfilter tonen het label;
  herstel via dezelfde sectie/chip.

## Datamodel, RPC's, ADR

Geen. Geen migratie, geen nieuwe of gewijzigde RPC, geen RLS. Geen ADR: de
`variant`-prop is een additieve uitbreiding van een bestaand component binnen
de T05-regels; het beslist niets wat een volgende feature kan tegenspreken.
Docs-stap na de bouw: `activiteittypes.md` (waarschuwing niet langer
"buiten scope"), `ledenbeheer.md`/`ledenbeheer-email.md` (label, uitleg,
status in plaats van toast), `assortimentbeheer.md` (zoek en filter),
`src/components/README.md` (`ZoekVeld`, `StatusFilter`, `variant`).

## Afstemming met andere tickets

- **T05/T06 (#125, #126)**: gemerged. Deze ticket bouwt op `Overlay`,
  `OpslaanSectie`, `useOpslaanBlokkade`, `useHerstelFocus`, `lib/opslaan.ts`.
  Wijzigingen aan `Overlay` en `OpslaanSectie` uitsluitend additief (nieuwe
  optionele props); bestaande aanroepers en e2e blijven ongewijzigd.
- **T07 (#127)**: `emailFout`/`VeldFout` blijven; de zoekregel van de
  verkoopzoeker wordt hergebruikt, niet aangepast.
- **T10 (#130)**: `date.ts`-helpers zijn hier niet nodig; `formatDate` voor
  "uitgenodigd op" blijft.
- **T12 (#132)**: contrast en controls. De nieuwe statusregels gebruiken
  bestaande tokens (`text-muted`, `text-danger`) die al AA halen op wit; geen
  eigen kleuren.
- **#140, #43**: niet geraakt.

## Teststrategie

**Unit (`npm run test`)**
- `beheerProductFilter`: trim/hoofdletters, zoeken op categorie, status
  actief/uit assortiment, tellers volgen zoekterm, `leegReden` onderscheidt
  "geen producten", "geen treffers" en "leeg filter".
- `isLaatsteActieveType`: één actief (waar), twee actief, nul actief, het
  gekozen type zelf gearchiveerd (niet waar), onbekend id.
- Sectiestatus: pure helper voor `onopgeslagen`/`opgeslagen` overgangen
  (invoer wijzigt, actie slaagt, fout) indien als aparte functie gebouwd.

**E2E gemockt (Playwright, bestaande `supabaseMock`-patroon)**
- Lid beheren, lang profiel op 768x1024 en 1024x768: titel en Sluiten
  blijven zichtbaar na scrollen naar Archief; Tab/Shift+Tab blijft in de
  dialoog; Escape met onopgeslagen invoer toont de weggooien-vraag onder de
  scrollgrens; achtergrond blijft inert (hergebruik hulpfuncties uit
  `dialogen-tabs-landmarks.spec.ts`).
- Sectiestatus: naam typen toont "Niet opgeslagen" alleen bij die sectie;
  opslaan toont "Opgeslagen"; typen wist hem; mislukte opslag toont de fout
  en geen "Opgeslagen"; er is geen toast meer.
- Contactadres: gekoppeld lid met afwijkend adres toont de account-uitleg; na
  opslaan de tekst "Het inlogadres is niet gewijzigd"; nergens staat een claim
  dat het loginadres is gewijzigd. Lid met open uitnodiging: na wijziging
  geeft de gemockte RPC `invited_at: null` terug en de status wordt "nog
  niet uitgenodigd" (regressie op de `invitedAt`-bug).
- Producten: zoeken op naam en categorie; chips met tellers; lege uitkomst
  voor elk van de drie gevallen; "Zoekopdracht wissen"; een archiveren in de
  overlay laat het product na sluiten uit Actief verdwijnen en in Uit
  assortiment verschijnen; veel producten (bijv. 120 in de mock) blijven
  bruikbaar.
- Activiteitstypes: laatste actieve archiveren toont het inline blok en doet
  geen RPC-aanroep tot "Toch archiveren" (aanroeptelling in de mock);
  "Eerst een type toevoegen" zet de focus op het invoerveld; "Annuleren"
  herstelt de focus; bij twee actieve types archiveert één klik direct (geen
  extra bevestiging); bij nul actieve types staat de vaste melding; herstellen
  haalt hem weg.
- A11y: `e2e/a11y.spec.ts` uitbreiden met de detailvariant en de nieuwe
  zoek-/chipschermen (axe, geen nieuwe schendingen).

**Handmatig (niet te bewijzen met de fixture)**
- Echte tablet 768 en 1024: scrollen met schermtoetsenbord open in "Lid
  beheren".
- Schermlezer (VoiceOver/TalkBack): sectiestatus wordt aangekondigd, kop
  blijft het dialooglabel, focusvolgorde door de vaste kop.
- Uitnodiging met echte mail: alleen in een daarvoor geschikte testomgeving;
  de fixture bewijst geen bezorging.
- Controleer bij Bram of de feitelijke catalogus past bij vraag 4.

**Gates**: `check:fast` (hook) en volledige CI. Geen `db:test`-wijziging
verwacht (geen backend).

## Expliciet buiten scope

- Het Auth-loginadres tonen of wijzigen, loskoppelen, automatische
  accountmigratie, en alles wat een nieuwe RPC/auth-flow vraagt (vraag 3).
- Naam- en categoriebeheer van bestaande producten, categoriebeheersysteem
  (nieuwe RPC en uitbreidingsbesluit; vraag 4).
- Categoriefilter en sorteerkeuze in de productenlijst (vraag 4).
- Een hard verbod op archiveren van het laatste actieve type (D5, vraag 6),
  een server-guard, en een waarschuwing elders dan de kaart.
- Algemene extra bevestigingen voor andere omkeerbare archiveringen.
- Een eigen detailpagina of zijpaneel voor leden (vraag 1).
- Detailvariant voor `ProductBeherenOverlay`, `NieuwLidOverlay`,
  `LidBestellingenOverlay` of geldoverlays (afrekenen, opwaarderen, afsluiten):
  die houden het standaardformaat.
- Herschrijven van de andere zoekvelden (Logboek, Transactielijst,
  verkoopzoeker, LidZoeker, Bezetting) naar `ZoekVeld`.
- Bevestiging of herstel van e-mailbezorging, offline/PWA, wijzigingen aan
  geld- of attributielogica.

## Bestanden (indicatie, geen code)

| Bestand | Wijziging |
|---|---|
| `src/components/Overlay.tsx` | additief: `variant`, `meta`, vaste kop + scrollend lichaam, Sluiten in de kop |
| `src/components/OpslaanSectie.tsx` | additief: optionele `status`, titel/`h3`-kop-slot |
| `src/components/ZoekVeld.tsx` (nieuw) | uit `LedenLijst` getild |
| `src/components/StatusFilter.tsx` (nieuw) | chips met tellers uit `LedenLijst` getild |
| `src/components/README.md` | nieuwe componenten en props |
| `src/features/ledenbeheer/LidBeherenOverlay.tsx` | detailvariant, secties, contactadres-uitleg, `invitedAt`/`hasAccount` uit return, status in plaats van toast |
| `src/features/ledenbeheer/NieuwLidOverlay.tsx` | label en uitlegregel |
| `src/features/ledenbeheer/LedenLijst.tsx` | gebruikt `ZoekVeld`/`StatusFilter` |
| `src/features/assortimentbeheer/ProductenLijst.tsx` | zoeken, status, lege-uitkomstonderscheid |
| `src/features/assortimentbeheer/beheerProductFilter.ts` (nieuw) | pure filterlogica |
| `src/features/assortimentbeheer/ProductBeherenOverlay.tsx` | alleen herstelroutetekst |
| `src/features/assortimentbeheer/ActiviteitstypesInstellingen.tsx` | inline waarschuwing, vaste melding bij nul actief |
| `test/beheerProductFilter.test.ts`, `test/` (laatste type) | unit |
| `e2e/beheerformulieren-catalogus.spec.ts` (nieuw), `e2e/a11y.spec.ts` | e2e en axe |

## Besluiten van Bram

Alle zes: aanbeveling overgenomen ("Pak aanbevelingen").

- **B1. Vorm ledendetail:** modal met `Overlay variant="detail"` (aanbeveling overgenomen).
- **B2. Teksten:** de voorgestelde teksten (tabel "Teksten", besluit 8 en 9) zijn akkoord (aanbeveling overgenomen).
- **B3. Loginadres:** alleen uitleg, geen Auth-adres tonen of wijzigen; een
  eventuele backend-/authflow is een apart ticket (aanbeveling overgenomen).
- **B4. Catalogus:** nu alleen zoeken (naam + categorie) en statuschips;
  categoriefilter, sorteerkeuze en naam-/categoriebeheer pas later of als apart
  backendticket. De catalogusgrootte is onbekend: geen extra's bouwen
  (aanbeveling overgenomen).
- **B5. Standaardfilter producten:** Actief (aanbeveling overgenomen).
- **B6. Laatste actieve type:** waarschuwen met hersteloptie, niet blokkeren; een
  hard verbod is een apart server-guard-ticket (aanbeveling overgenomen).

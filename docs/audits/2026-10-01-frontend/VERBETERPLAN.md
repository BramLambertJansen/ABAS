# Verbeterplan en ticketvoorstellen

Dit is het oorspronkelijke voorstel voor **één epic met twaalf uitvoerbare tickets**. Inmiddels is het op vervolginstructie omgezet in GitHub-issues: zie [ticketlinks en actualisaties](GITHUB-TICKETS.md). De gepubliceerde tickets houden rekening met de actuele dienst-per-sessie-spec en lopende PR #120; die richting vervangt de oudere auth-/D2-aanpak hieronder. De [audit](README.md) onderbouwt iedere finding F01–F28; de [schermreview](SCHERMREVIEW.md) bevat het visuele bewijs. Eén groot ticket kan dezelfde structuur gebruiken als checklist, maar verdient kleine PR's per onderwerp. Eén PR die alle twaalf onderwerpen tegelijk wijzigt is moeilijk te beoordelen.

## Epic — ABAS betrouwbaar en voorspelbaar bedienen

**Probleem:** medewerkers zonder PIN kunnen niet alle barflows bereiken, tabnavigatie wist bestellingen en gedeelde interactiepatronen gedragen zich verschillend. Financiële schermen geven onvoldoende consistente uitleg. **Resultaat:** elke bevoegde medewerker kan een dienst starten, een ronde blijft intact tijdens navigatie, dialogen zijn goed bedienbaar, financiële statussen zijn eenduidig en fouten bieden herstel.

**Randvoorwaarden voor alle tickets:** volg CLAUDE.md en toepasselijke AGENTS.md op het moment van uitvoering. Geld schrijft uitsluitend via bestaande of expliciet gewijzigde RPC's; bedragen/saldo worden door de server bepaald. `served_by` komt uit de actieve bezetting. Wachtwoord verplicht, PIN optioneel; gewone leden krijgen geen barrechten. Portal- en barsessies blijven gescheiden. Geen offlineboekingen of nieuwe PWA-scope. Bestaande geslaagde flows en archiefhistorie behouden. Gebruik echte server-/databasecontrole voor wijzigingen aan auth of financiële leescontracten.

## Ticketoverzicht

| Ticket | Titel | Prio | Omvang* | Findings | Afhankelijkheden |
| --- | --- | --- | --- | --- | --- |
| T01 | Maak e-mailstart en sessiemodus volledig | P1 | L | F01, F08, F09 | D2; auth/RPC-contract |
| T02 | Scheid PIN-stafkeuze van bezettingsgeschiktheid | P1 | S/M | F02 | Afstemmen met T01 over hooks |
| T03 | Bewaar verkoopdraft binnen de open dienst | P1 | M | F03 | Afstemmen met T05 over tabs |
| T04 | Maak bar en beheer bruikbaar op ondersteunde tablets | P1 | M/L | F04 | D1 |
| T05 | Herstel dialogen, tabs en landmarks | P1 | M | F05, F17, F28 | Gedeelde contracten voor T06/T11 |
| T06 | Maak opslaan, sluiten en gelijktijdige acties voorspelbaar | P2 | M | F10, F11 | T05 dialoog-API |
| T07 | Verbeter invoerfeedback, ledenzoeker en productfilters | P2 | M | F12, F15, F16 | D3; T05/T06 waar nodig |
| T08 | Geef herstelbare leesfouten en actuele portaldata | P2 | M | F13, F14 | T01 sessiestatus; T03 draftbehoud |
| T09 | Maak portaltransacties inhoudelijk consistent | P1/P2 | S/M | F07, F18 | Kan vroeg zelfstandig |
| T10 | Maak logboek chronologisch en eerlijk over de reikwijdte | P2 | M/L | F19, F20, F21, F22 | D4; aangepast leescontract |
| T11 | Maak beheerformulieren en catalogus duidelijker | P2/P3 | M | F23, F24, F25, F26 | T05/T06; D5 voor laatste activiteit |
| T12 | Harmoniseer contrast, controls, taal en portalbreedte | P1/P3 | S/M | F06, F27 | Contrast kan direct; overige styling na T04/T11 |

\* S/M/L zijn relatieve complexiteitsschattingen, geen urenplanning. T01 kan migratie-/authwerk vragen; T10 kan extra queries, RLS-controle en datavolumetests vragen. Die delen mogen niet als uitsluitend frontend worden ingepland.

## T01 — Maak e-mailstart en sessiemodus volledig

**Doel:** een actieve bardienst/beheerder zonder PIN kan na persoonlijke e-maillogin een dienst starten en later zijn persoonlijke sessie bewust beëindigen. Een nieuwe gebruiker erft geen eerdere moduskeuze.

**Scope:** ModusKeuze, Assortimentbeheer, DienstStarten, useBeheerSession/useStartShift, relevante auth/device-navigatie en de serverstartfunctie. Onderzoek eerst hoe persoonlijke en gedeelde sessie elkaar vervangen volgens de bestaande ADR's. Leg dat contract vast vóór implementatie. De huidige start-RPC accepteert alleen PIN-validatie; voeg een gecontroleerd pad voor de geauthenticeerde medewerker toe, zonder clientgekozen identiteit te vertrouwen.

**Acceptatiecriteria:**

- Zonder open dienst: e-maillogin zonder PIN → Bar → activiteit → succesvolle start op eigen identiteit, zonder andere naam/PIN te kiezen.
- PIN-login blijft werken voor PIN-starters; geen tweede open dienst bij gelijktijdige start.
- Gewoon lid, gearchiveerde medewerker en verkeerde rol blijven server-side geweigerd.
- Logout en gebruikerswissel wissen modusstate; herladen en terugnavigeren hebben gedocumenteerd gedrag.
- Persoonlijke e-mailsessie kan vanuit Bar beëindigd worden. Uitloggen en dienst afsluiten zijn afzonderlijke acties met heldere gevolgen.
- ‘Terug naar bardienst’ volgt het gekozen sessiebeleid. Voorlopig ADR 0003 behouden; een wijziging alleen na D2.
- Portalcookie blijft geïsoleerd; persoonlijke beheertoegang wordt niet ongemerkt op een gedeelde tablet achtergelaten.

**Verificatie:** echte Supabase-/database-authchecks, plus E2E voor medewerker met/zonder PIN, eigen PIN uitgezet, logout → andere gebruiker en refresh. Geen mockauth als enige bewijs. Start gelijktijdig vanaf twee clients om het bestaande één-open-dienst-contract te behouden.

**Buiten scope:** wachtwoordbeleid herontwerpen, barrechten voor gewone leden, PIN per bestelling, stilzwijgende moduswissel.

## T02 — Scheid PIN-stafkeuze van bezettingsgeschiktheid

**Doel:** PIN hebben bepaalt wie via het PIN-pad kan starten; barrol en actieve status bepalen wie aan de bezetting kan deelnemen.

**Scope:** useBarStaff en BezettingOverlay; aparte query/hook voor bevoegde bezetting. Gebruik de echte `shift_members` ook als bron voor reeds toegevoegde personen, zodat uitsluiting uit de kandidatenlijst geen onmogelijke verwijdering veroorzaakt.

**Acceptatiecriteria:**

- PIN-stafkeuze toont uitsluitend geschikte medewerkers met PIN.
- Bezetting toont geschikte actieve bardienst/beheerder-leden ongeacht PIN, inclusief zoek-/lege toestand indien nodig.
- Lid zonder PIN kan toevoegen/verwijderen en vervolgens als `served_by` geselecteerd worden zolang het in de actieve crew zit.
- Al aanwezige crew blijft zichtbaar/verwijderbaar als PIN of geschiktheid later verandert; beperkingen worden uitgelegd.
- Gewone leden/gearchiveerde kandidaten worden niet aangeboden voor toevoegen; bestaande serverchecks blijven gelden.

**Verificatie:** fixture met met-PIN, zonder-PIN, archief en gewoon lid; echte RPC-check voor toevoeging en `served_by`. Test PIN uitzetten tijdens een open dienst. Controleer één en meerdere uitvoerders bij afrekenen/opwaarderen.

**Afstemming:** T01 bezit de startweg; dit ticket bezit de crewquery. Deel geen `has_pin`-filter voor beide doeleinden.

## T03 — Bewaar verkoopdraft binnen de open dienst

**Doel:** een normale tabwissel vernietigt een lopende ronde niet.

**Scope:** DienstTabs en verkoopdraftstate. Kies een beperkte oplossing: draftstate boven de tabpanels of bewust gemount houden met expliciete refresh. Geen algemene statebibliotheek of browseropslag verplicht. De draft geldt alleen voor de betreffende dienst.

**Acceptatiecriteria:**

- Lid, productregels en aantallen blijven gelijk na Verkoop → Dienst → Verkoop.
- Bewuste draftreset en succesvolle boeking wissen de juiste gegevens; nieuwe/afgesloten dienst krijgt geen oude draft.
- Productinformatie blijft herkenbaar als een product intussen wordt gearchiveerd; afrekenen volgt de actuele servervalidatie.
- Bij veranderde prijs/saldo/crew wordt de bevestiging bijgewerkt en relevante blokkering uitgelegd; een bewaarde draft maakt gelddata niet betrouwbaar.
- Lidwissel volgt de bestaande veiligheidsregel of het expliciet bijgewerkte T07-contract.
- Zoeken/weergavestand blijven waar nuttig behouden; refresh is niet afhankelijk van unmounten.

**Verificatie:** E2E met gevulde draft en twee tabwissels; verander tussendoor productstatus/prijs, lidstatus en crew. Test geslaagde afrekening en dienst afsluiten. Bewaren na volledige browserreload alleen toevoegen als er een productwens voor is.

## T04 — Maak bar en beheer bruikbaar op ondersteunde tablets

**Doel:** de medewerker herkent producten en financiële regels en kan alle primaire acties bereiken op de afgesproken tabletmaten.

**Scope:** vaste rail-/paneelmaten, gridkolommen, aantallenbadge, dienstregels, beheerheader en lange namen. D1 eerst vastleggen. Voorgestelde matrix: 768×1024, 1024×768 en 1280×800; bartelefoon valt buiten scope.

**Acceptatiecriteria:**

- Normale namen zoals Rode wijn en Spa rood zijn herkenbaar op 1024px; aantallen bedekken geen naam/prijs.
- Lange namen hebben bruikbare zichtbare context en een bereikbare volledige tekst, zonder afhankelijkheid van hover op touch.
- Mandje/totaal/afrekenen en dienstbedragen blijven in beeld of via duidelijke scroll bereikbaar; geen overlappende controls.
- Adminheader met alle vier tabs en Uitloggen past op de ondersteunde maat, zonder verborgen actie of paginabrede horizontale overflow.
- Bij portretondersteuning herschikken panelen/controls. Indien portret expliciet wordt uitgesloten: duidelijke minimale/toestelafspraak, en geen foutief afgekorte gewone namen op ondersteund landschap.
- Fontvergroting/zoom maakt primaire acties bereikbaar; stylesheet lost de werkelijke inhoudsbreedte op, niet alleen globale viewportbreakpoints.

**Verificatie:** screenshots én interactietests op de matrix, met lange product-/lid-/medewerkernamen, grote bedragen, drie crewleden en volle bestelling. Test uiteindelijk ook een fysiek tablet.

## T05 — Herstel dialogen, tabs en landmarks

**Doel:** alle bestaande shells en overlays bieden dezelfde voorspelbare toetsenbordbediening.

**Scope:** gedeelde Overlay, de drie tabimplementaties en main/navigatie-landmarks. Onderzoek een klein correct primitive of de bestaande implementatie verbeteren; geen componentlibrarymigratie nodig. Scheid gedrag van shellstyling. Voeg een expliciet sluit-/pendingcontract toe waar T06 op kan voortbouwen.

**Acceptatiecriteria:**

- Vanaf beginfocus, eerste/laatste control en tijdelijk disabled controls blijven Tab en Shift+Tab binnen de actieve dialoog.
- Achtergrond is niet interactief voor toetsenbord/assistive technologie zolang de dialoog actief is.
- Escape, backdrop en sluitknop volgen hetzelfde sluitcontract; scrolllock wordt na sluiten opgeruimd.
- Focus keert terug naar de trigger; als deze verdwenen is, naar een logische opvolger. Overgang detail → orders → terugdraaien houdt focus in de juiste actieve view.
- Horizontale tabs reageren op links/rechts; verticale rail op omhoog/omlaag en correcte `aria-orientation`. Eén tabstop, juiste labels/panelrelaties, afgesproken activatiegedrag.
- De actieve barweergave heeft één main-landmark; navigatie blijft herkenbaar. Portal en beheer behouden hun bestaande structuur.

**Verificatie:** handmatige toetsenbordreeks én E2E-asserties op actieve focus/achtergrond, dus geen uitsluitend axe-scan. Axe voor semantiek/contrast. Geef bijzondere aandacht aan lange dialogen en een geblokkeerde sluitpoging tijdens een geldmutatie.

**Referentie:** [W3C-dialogen](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) en [tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Dit ticket levert geen verklaring van volledige WCAG-conformiteit.

## T06 — Maak opslaan, sluiten en gelijktijdige acties voorspelbaar

**Doel:** gebruikers weten of hun opdracht nog loopt, geslaagd is of herstel nodig heeft; een tweede actie verdringt die status niet.

**Scope:** create-/edit-/account-/crew-overlays en bijbehorende mutatiestatus. Geldbevestigingen gebruiken al sluitguards: trek het beleid gelijk zonder hun extra bescherming te verwijderen. Per detailobject samenhangende acties serialiseren of responses aantoonbaar correct combineren.

**Acceptatiecriteria:**

- Vertraagd opslaan geeft zichtbare en toegankelijke pendingstatus; Escape, backdrop, Sluiten en Annuleren volgen één contract.
- Kies voor blokkeren tijdens opslaan óf een zichtbare taak buiten de dialoog; geen stil doorlopende mutatie na een verdwenen venster.
- Geen nieuwe dubbele opdracht tijdens pending. Verstuurde waarden en zichtbare opdracht blijven gelijk; geblokkeerde velden/keuzes zijn verklaarbaar.
- Naam/e-mail/rol/prijs/archiveren verbergen elkaars fouten niet en tonen na afronding de nieuwste detailstate.
- Bij sluiting met onopgeslagen invoer volgt een bewuste keuze; geen bevestigingsspam bij ongewijzigde of al opgeslagen forms.
- Bij een geldrequest met onbekende uitkomst wordt status eerst gecontroleerd; geen automatische blinde retry. Indien het backendcontract geen veilige controle biedt, dat als apart vereiste benoemen.

**Verificatie:** gecontroleerde vertraging, fout, snelle dubbele actie en responses in omgekeerde volgorde. Controleer ook Nieuw lid met startsaldo: dat is meer dan cosmetische invoer. Bewijs van echte geld-idempotentie vraagt een backendtest en hoort niet in een UI-aanname.

## T07 — Verbeter invoerfeedback, ledenzoeker en productfilters

**Doel:** de gebruiker begrijpt waarom iets niet kan en kan snel een correcte persoon/product kiezen.

**Scope:** bedrag-/e-mail-/PIN-invoer, ledenzoeker, lidwissel en zoek-/categoriecontract. Geldparser en maximumbedragen behouden. D3 vastleggen; voorgesteld gedrag: categorieklik wist productzoekterm.

**Acceptatiecriteria:**

- Leeg, ongeldige tekst, nul/negatief, teveel decimalen, te hoog bedrag, ongeldig e-mailadres en PIN-mismatch geven passende veldfeedback op het juiste moment.
- Meldingen hangen programmatisch aan het juiste veld; focus/ingevoerde waarden blijven bij herstel behouden.
- Ledenzoeker: resultaten met volledige bereikbare namen, pijltoetsen/Enter, Escape, buitenklik, duidelijke nulresultaten en status voor laden/fout.
- Lidwissel met gevulde bestelling maakt de reset vooraf duidelijk; bescherming tegen afrekenen voor een verkeerde persoon blijft aanwezig.
- Categorieklik tijdens zoeken heeft direct begrijpelijk effect. Actieve filters en reset komen overeen met de werkelijke resultaten.
- Bestaande geldlimiet/extra bevestiging en wachtwoordchecklist blijven intact.

**Verificatie:** interactietests met ongeldige invoer en herstel, toetsenbord en touch; twee gelijkende lange namen. Werk expliciete gedragstests in `test/transacties.test.ts`/verkooptests alleen bij als het betreffende productcontract verandert, niet om afwijkingen weg te testen.

## T08 — Geef herstelbare leesfouten en actuele portaldata

**Doel:** een tijdelijke storing verandert niet in een onjuiste accountmelding; de gebruiker kan herstellen en weet hoe actueel zijn gegevens zijn.

**Scope:** sessielookups, readhooks en schermstates; retry voor starten, bezetting, leden/producten, dienst/logboek en portal. Portalrefresh voor saldo en historie gezamenlijk. Geen offline-/Realtime-project.

**Acceptatiecriteria:**

- Server-/netwerkfout bij een geldig portalaccount wordt als laadfout getoond; ontbrekend lid/onjuiste rol en verlopen sessie blijven aparte states.
- Opnieuw proberen herstelt zonder onnodige login of invoerverlies. E-mailingang blijft op het barstartscherm bereikbaar als shift-/stafquery faalt.
- Elke belangrijke leesfout biedt een passende herstelactie; geen eindeloze loader zonder uitleg/herstelstrategie.
- Bestaande data blijft waar veilig zichtbaar met duidelijke verouderingsstatus; schrijven is geblokkeerd als verplichte crew/saldo/settings ontbreken.
- Portal biedt verversing en haalt bij terugkeer/verbindingherstel saldo én relevante historie opnieuw op, zonder onnodige dubbele requests.
- Een late response voor een oude identiteit/dienst vervangt geen gegevens van een nieuwe identiteit/dienst; cancel-/volgordeafhandeling is getest.

**Verificatie:** fout → herstel, verbindingverlies, logout tijdens query en trage responses. Echte barboeking op client A gevolgd door portalrefresh op B. Behoud het onderscheid tussen dataversheid en autorisatie.

## T09 — Maak portaltransacties inhoudelijk consistent

**Doel:** dezelfde boeking betekent hetzelfde op Saldo en Transacties.

**Scope:** SaldoTab, TransactieRij, TransactiesTab en ondersteunende tekstfuncties. Kies de eenvoudige kop ‘Recente transacties’ in plaats van een onjuiste maandclaim. Voeg een duidelijke actie naar volledige historie toe.

**Acceptatiecriteria:**

- Teruggedraaide bestelling toont in beide weergaven expliciet dezelfde status en betekenis, inclusief toegankelijke tekst; niet alleen kleur/doorstrepen.
- Reden is beschikbaar; op 320px is de essentiële status niet uitsluitend een afgekorte subtitle.
- Recente transacties mogen over maand-/jaargrenzen heen staan; titel beschrijft die selectie correct.
- Lege historie en een maand zonder transacties leiden tot kloppende tekst; geen frontendcompensatieboeking of eigen saldoberekening.
- ‘Alle transacties’ opent de juiste tab met logische focus.

**Verificatie:** normale bestelling, reversal, opwaardering, geen historie, september → oktober en december → januari, op 320/390px. Bestaande tests verwachten bewust `showReversal=false` op bepaalde paden: pas het contract gericht aan, niet alleen CSS.

## T10 — Maak logboek chronologisch en eerlijk over de reikwijdte

**Doel:** beheerders kunnen zien wanneer iets gebeurde, wie het deed en welke historie werkelijk is doorzocht.

**Scope:** LogboekLijst, logboek.ts, useLogboek en capcommunicatie in LidBestellingenOverlay. D4 vastleggen: voorgesteld een gebeurtenissentijdlijn waarin order, opwaardering en reversal eigen tijd/actor hebben. Bestaande zichtbare Assortiment-/Ledenfilters behouden met eerlijke uitleg.

**Acceptatiecriteria:**

- Datumgroepering plus lokale tijd, met correct jaar en daggrenzen.
- Reversal draagt eigen `created_at`/actor en verwijzing naar oorspronkelijke bestelling; geen verwarring met oorspronkelijke served-by.
- Nieuwe reversal van een oudere order verschijnt op de juiste plek, ook als die order buiten de recente ordercap valt. Leesbron/caps ondersteunen dit aantoonbaar.
- ‘Meest recente 200’ en ‘laatste 50 orders’ en de reikwijdte van zoeken zijn zichtbaar waar van toepassing.
- Filters zonder bron zeggen dat die categorie nog niet wordt geregistreerd; algemene tekst belooft niet alle apphandelingen.
- Nederlandse betaalmethode en consistente statuslabels; geen dubbeltelling alsof een reversal nieuwe omzet is.

**Verificatie:** orders van verschillende dagen/jaren, veel records, recente reversal van zeer oude order, andere reverser dan verkoper, filter + zoekterm. Echte query/RLS-check met beheerder; bardienst ziet nog steeds geen Logboektab. Paginering en algemene auditlogging alleen als aparte behoefte, niet automatisch toevoegen.

## T11 — Maak beheerformulieren en catalogus duidelijker

**Doel:** beheer blijft overzichtelijk naarmate leden/producten en acties groeien, en de betekenis van accountvelden is helder.

**Scope:** grotere leden-detailvariant, sectiefeedback, uitleg contact-/inlogadres, zoeken/actief-archief in producten en waarschuwing laatste activiteit. Basisherstel van pending/focus komt uit T05/T06.

**Acceptatiecriteria:**

- Naam/context en Sluiten blijven bereikbaar in een lange detailview; secties zijn logisch gegroepeerd en opgeslagen/onopgeslagen status is duidelijk.
- E-mailbewerking vertelt exact wat wijzigt en wat niet; geen onjuiste claim dat het Auth-loginadres is gewijzigd. Vervolgactie alleen aanbieden als die daadwerkelijk bestaat.
- Producten zijn zoekbaar en actief/gearchiveerd herkenbaar; lege gefilterde lijst onderscheidt geen producten van geen matches.
- Archiveren behoudt historie en toont een begrijpelijke herstelroute.
- Laatste activiteit: vóór archiveren duidelijk gevolg en hersteloptie. Hard blokkeren alleen na D5.
- Naam-/categoriebeheer van bestaande producten alleen uitvoeren als dit uitbreidingbesluit is genomen; anders als expliciete vervolgscope vermelden.

**Verificatie:** lang lidprofiel, gekoppeld account met afwijkend contactadres, gearchiveerd lid/product, veel producten, laatste activiteit. Uitnodigingen met echte mail alleen in een daarvoor geschikte testomgeving; de auditfixture bewijst geen e-mailbezorging.

## T12 — Harmoniseer contrast, controls, taal en portalbreedte

**Doel:** dezelfde handeling ziet er hetzelfde uit en blijft leesbaar in elke interactieve toestand.

**Scope:** correcte witte accentknopvariant, tokens/kleine controls, zichtbare focus, betaal-/actieterminologie, expliciete fontkeuze en desktopcontainer in portal. Begin met het kleine contrastdeel; overige uniformering kan later.

**Acceptatiecriteria:**

- Witte primaire knoppen halen minimaal 4,5:1 voor kleine tekst in rust, hover en actieve toestand; dark-text-varianten blijven eveneens correct.
- Een test controleert de werkelijk gebruikte combinatie, niet slechts los geldige tokens. Axe met stabiele hover vangt het huidige geval af.
- Betaalmethode `cash` wordt overal ‘contant’; uitnodigings-/sluit-/annuleerlabels volgen een korte Nederlandse woordenlijst.
- Controls delen een beperkt aantal hoogtes/radii/focusvarianten. Vergroot belangrijke kleine touchacties waar nodig; 44px is het comfortdoel, geen absolute WCAG-AA-regel.
- Manrope wordt bewust geladen óf de systeemfontstack wordt expliciet gekozen; screenshots en layouttest gebruiken dezelfde keuze.
- Portaldesktop heeft een leesbare begrensde inhoudsbreedte; 320px blijft zonder horizontale overflow bruikbaar. Essentiële reversalinformatie blijft bereikbaar.

**Verificatie:** stable hover/focus/active-screenshots, werkelijke contrastparen, tablet en portaldesktop/320px. Test eventuele mobiele inputzoom op iOS; niet als bewezen Chromeprobleem behandelen.

## Volgorde en uitvoering door agents

1. **Eerste ronde:** T01, T02, T03, T05, T09 en contrastdeel T12. T04 zodra D1 vaststaat. Dit pakt geblokkeerde toegang, invoerverlies, informatiebetrouwbaarheid en toegankelijkheid aan.
2. **Tweede ronde:** T06, T07 en T08. Eerst dialoog-/pending-/sessiestatuscontracten stabiliseren; dan consumers aanpassen.
3. **Derde ronde:** T10 en T11, plus resterende T12-verfijning. D4/D5 vastleggen vóór behaviorwijzigingen.

Als meerdere agents tegelijk werken, verdeel eigenaarschap vóór wijzigingen: T01 bezit sessie/startlogica, T02 crewquery, T03 verkoopdraft, T05 gedeelde primitives. T04 en T03/T07 raken dezelfde verkoopschermen; merge daar achtereenvolgens of gebruik duidelijke fileownership. T11 wacht op het dialoog-/mutatiecontract. Portalweergave T09 en logboek T10 kunnen doorgaans afzonderlijk, maar stem transactie-/tijdlabelhelpers af. Geen twee agents tegelijk een grote refactor van Overlay of DienstTabs laten doen.

## Gereed wanneer

- F01–F28 hebben ieder een aantoonbaar opgelost resultaat of expliciet gedocumenteerd productbesluit/deferred onderdeel; alleen een gesloten ticket is geen bewijs.
- De twaalf flows uit de audit zijn opnieuw doorlopen op ondersteunde apparaten, met voor/na-bewijs voor de belangrijkste fixes.
- Goede scenario's én betekenisvolle randgevallen zijn geverifieerd: geen PIN, volle draft/tabwissel, focusval, verschillende maanden, late reversal, pending/sluiten en fout/herstel.
- Toepasselijke repositorychecks slagen. Auth-/databasewijzigingen hebben echte backendtests; UI-/a11y-tests bevatten gedrag en relevante interactieve toestanden. Geen claim van volledige conformiteit op basis van alleen axe.
- Specs/ADR's die bewust gedrag beschrijven zijn bijgewerkt waar een geaccepteerd besluit het gedrag verandert.

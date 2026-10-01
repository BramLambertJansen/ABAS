# Frontendreview ABAS — 1 oktober 2026

De frontend heeft een herkenbare stijl en duidelijk afgebakende taken. De dagelijkse barflow bevat echter problemen die werk laten verdwijnen of medewerkers uitsluiten. Financiële overzichten presenteren dezelfde gegevens verschillend. De grootste winst zit daarom in voorspelbaar gedrag, correcte informatie en bereikbaarheid; daarna in visuele verfijning.

Dit rapport bevat **28 bevindingen: 7 P1, 18 P2 en 3 P3**. Het [verbeterplan](VERBETERPLAN.md) groepeert ze in één epic met twaalf ticketvoorstellen. De [schermreview](SCHERMREVIEW.md) bevat alle 41 geïnspecteerde screenshots met notities per stap. Er zijn geen applicatiecodewijzigingen gemaakt. Op vervolginstructie zijn de tickets in GitHub vastgelegd: zie [GitHub-overzicht en actualisaties](GITHUB-TICKETS.md).

## Onderzoek en grenzen

- Bronstand: `ebca0543443bac61fe3a20c9fdf0a82ac6fcf368`. De vooraf aanwezige `.vscode/` is ongemoeid gelaten.
- Werkelijke frontend lokaal gestart in Next.js, bekeken met headless Chrome en bediend via agent-browser. Geen screenshots van prototypes gebruikt als bewijs.
- Geen lokale Supabase-configuratie of bestaande backend beschikbaar. Daarom een **synthetische lokale API** gebruikt; de pagina's, hooks, CSS en interacties zijn de echte applicatie. Zie [reproduceren](tools/README.md).
- Getest op tablet/desktop, waaronder 1024×768 en 768×1024; portal op 390×844, 320×740 en 1280×800. Enkele login-/foutschermen zijn ook op telefoonbreedte vastgelegd. Dat maakt telefoonondersteuning voor de bar geen auditvereiste.
- Gecontroleerd: PIN-stappen, e-maillogin en moduskeuze, verkoop, mandje, afrekenbevestiging, opwaarderen, bezetting, dienstoverzicht, terugdraaien, afsluiten, beheer per rol, assortiment, leden, instellingen, logboek, persoonlijke PIN-instellingen, portal en gecontroleerde lees-/vertragingsfouten.
- Broncontrole van query-/mutatiehooks, gedeelde componenten, tokens, relevante migraties, productafspraken en bestaande tests.
- `npm test`: **99 geslaagd, 0 mislukt**. Aanvullende axe-scan op het verkoopscherm met actieve hover: één contrastprobleem en twee problemen met landmarks; [ruw resultaat](axe-verkoop-hover.json). Handmatige toetsenbordcontrole toont daarnaast een focuslek. De volledige Playwright-suite, build en database-tests zijn hier niet uitgevoerd.
- Niet bewezen: echte RLS/autorisatie, geldboekingen, productieaccounts, bezorging/afhandeling van e-mail en recoverylinks, racecondities tussen echte apparaten, productiedatavolumes, Safari/iOS, virtueel toetsenbord, schermlezers en fysiek touchgebruik. De fixture accepteert fictieve authenticatie en voert slechts enkele mutaties na; zij is geen backendtest.
- De Next.js-devindicator linksonder hoort bij deze lokale omgeving en is geen productbevinding. De fictieve barhistorie bevat boekingen uit verschillende dagen binnen één open dienst; daarop is geen conclusie over normale dienstgroepering gebaseerd.

**Bewijslabels:** **B** = in de browser gereproduceerd én door broncode verklaard; **S** = broncontrole/zichtbare structuur, nog gerichte praktijktest nodig; **V** = verbetervoorstel of heroverweging van een expliciete productkeuze. Een screenshot bewijst de zichtbare toestand; veranderend gedrag wordt ondersteund door de beschreven handelingen en broncode.

**Prioriteit:** P1 = eerst oplossen vanwege geblokkeerde kernflow, verlies van invoer, financieel misleidende weergave of duidelijke toegankelijkheidsfout. P2 = vervolgens voor voorspelbaar dagelijks gebruik. P3 = verfijning of productuitbreiding. Dit zijn auditprioriteiten, geen bewijs van productie-incidenten.

## Wat behouden moet blijven

De aparte bar- en portalshell passen bij hun verschillende apparaten. Grote PIN-toetsen en hoeveelheidknoppen werken goed. Afrekenen toont lid, saldo, bestelling en uitvoerder voordat er wordt geboekt. Opwaarderen heeft een maximumbedrag en extra bevestiging waar nodig. Archiveren behoudt historie. De volledige portalhistorie groepeert correct op maand en markeert teruggedraaide bestellingen. Wachtwoordvelden geven een bruikbare checklist. Deze patronen moeten bij herstel behouden blijven.

Geld blijft server-authoritatief en loopt via RPC's. `served_by` blijft uit de actieve bezetting komen. Wachtwoord blijft verplicht en PIN optioneel volgens ADR 0005. Geen PIN per ronde. De portalcookie blijft gescheiden. Offline/PWA-functionaliteit is geen onderdeel van dit plan. Een wijziging van de afspraak over vaste modi vraagt een expliciet productbesluit; een handige wisselknop wordt niet stilzwijgend toegevoegd.

## Doorlopen stappen

| Stap | Flow | Gezondheid | Belangrijkste bewijs |
| --- | --- | --- | --- |
| 1 | Bar openen met PIN en activiteit | Aandacht: PIN-pad duidelijk, fouten bieden onvoldoende uitweg | 17–18, 37 |
| 2 | E-maillogin, moduskeuze, eigen account | Kritiek: zonder PIN geen nieuwe dienst; sessienavigatie inconsistent | 14–16, 41 |
| 3 | Assortiment zoeken en bestelling opbouwen | Kritiek: draft verdwijnt; namen onvoldoende herkenbaar | 01–02, 06–07 |
| 4 | Afrekenen en dialogen met toetsenbord | Kritiek: focus ontsnapt; hovercontrast faalt | 03–04, 38 |
| 5 | Opwaarderen | Aandacht: bevestiging goed, ongeldige invoer onverklaard | 09–10 |
| 6 | Bezetting wijzigen | Kritiek: bevoegde medewerkers zonder PIN ontbreken | 08 |
| 7 | Dienst bekijken, terugdraaien, afsluiten | Aandacht: tabletportret verliest overzicht | 05, 11–13 |
| 8 | Producten beheren en aanmaken | Aandacht: sluiten tijdens opslaan; beperkt terugvinden | 19–22, 39–40 |
| 9 | Leden beheren, aanmaken, orders bekijken | Aandacht: lang formulier, losse acties en e-mailbetekenis | 23–26 |
| 10 | Instellingen en beheernavigatie | Aandacht: adminheader past niet op tabletportret | 27, 29 |
| 11 | Logboek zoeken en filteren | Aandacht: datum, tijdlijn en registratiebelofte onduidelijk | 28, 30 |
| 12 | Portal inloggen, saldo en historie | Kritiek: reversalstatus en periode verschillen; leesfout verkeerd uitgelegd | 31–36 |

## Bevindingen

### F01 — E-maillogin kan zonder PIN geen nieuwe dienst starten

**P1 · B · ticket T01.** Log in als actieve bardienstmedewerker zonder PIN, kies Bar terwijl geen dienst openstaat. Je belandt bij de stafkeuze, waar jouw naam ontbreekt. De beschikbare route eindigt opnieuw bij PIN-invoer. Dit botst met de belofte dat een wachtwoord altijd werkt en een PIN optioneel is. [Moduskeuze](screenshots/15-moduskeuze-zonder-pin.png), [vastgelopen barroute](screenshots/16-email-bar-loopt-vast-op-pin.png).

[ModusKeuze](../../../src/features/assortimentbeheer/ModusKeuze.tsx) linkt alleen naar `/`; [DienstStarten](../../../src/features/dienst-starten/DienstStarten.tsx) heeft geen aparte startweg voor de ingelogde persoon; [useStartShift](../../../src/hooks/queries/useStartShift.ts) stuurt steeds een PIN. Ook [de actuele start-RPC](../../../supabase/migrations/0021_start_shift_een_open_dienst.sql) controleert uitsluitend een PIN.

**Verbetering:** na persoonlijke login de ingelogde medewerker en activiteit gebruiken voor een geautoriseerde dienststart zonder nieuwe PIN. Hiervoor moet het servercontract mee veranderen; alleen het formulier overslaan is onvoldoende. Test beide authenticatiepaden en een medewerker die zijn PIN zojuist heeft uitgezet.

### F02 — Bezetting verwart bevoegdheid met een ingestelde PIN

**P1 · B · T02.** Open Bezetting met een actieve bardienstmedewerker zonder PIN in de vereniging. Die ontbreekt, hoewel toevoegen volgens de RPC is toegestaan. Dezelfde lijst kan iemand die zijn PIN heeft uitgezet ook onbereikbaar maken voor verwijderen uit een bestaande bezetting. [Screenshot 08](screenshots/08-bezetting-zonder-pin-ontbreekt.png).

[BezettingOverlay](../../../src/features/bezetting-beheren/BezettingOverlay.tsx) gebruikt [useBarStaff](../../../src/hooks/queries/useBarStaff.ts#L43), dat `has_pin=true` filtert voor PIN-starters. [add_shift_member](../../../supabase/migrations/0023_bar_rpcs_weigeren_lid.sql#L271) eist een actieve barrol, geen PIN.

**Verbetering:** afzonderlijke lijsten voor PIN-login en bezettingsbeheer. Toon alle bevoegde actieve medewerkers, en houd bestaande crew zichtbaar als hun geschiktheid later verandert. Geen uitbreiding naar gewone leden of verzwakking van serverchecks.

### F03 — Tabwissel wist de bestelling en het gekozen lid

**P1 · B · T03.** Selecteer Anna, voeg Pils toe, ga naar Dienst en terug naar Verkoop. Bestelling en lid zijn verdwenen zonder waarschuwing. [Voor](screenshots/02-bestelling-voor-tabwissel.png), [na](screenshots/06-bestelling-na-tabwissel.png).

[DienstTabs](../../../src/features/verkoop/DienstTabs.tsx#L91) unmount het verkoopscherm; de draft leeft lokaal in [VerkoopScherm](../../../src/features/verkoop/VerkoopScherm.tsx). Navigatie naar het dienstoverzicht is een normale handeling tijdens een ronde.

**Verbetering:** draft aan de open dienst koppelen en bij tabwissel bewaren. Lid, aantallen en productcontext behouden; saldo, prijzen, beschikbaarheid en crew opnieuw valideren. Wél wissen na geslaagde boeking of afsluiten/nieuwe dienst. Draft bewaren betekent niet dat oude financiële data mag worden vertrouwd.

### F04 — De vaste tabletindeling maakt namen en acties onleesbaar

**P1 · B/V · T04 · besluit D1.** Op 1024px verdwijnen al normale productnamen achter afkortingen; een aantallenbadge bedekt de naam van geselecteerde Pils. Op 768px blijft naast rail en zijpaneel ongeveer 252px inhoud over vóór overige layoutbeperkingen. Dienstregels verliezen context. In de beheerheader met vier admintabs valt Uitloggen buiten beeld; gemeten paginabreedte 840px bij viewport 768px. [02](screenshots/02-bestelling-voor-tabwissel.png), [13](screenshots/13-dienst-tablet-portret.png), [29](screenshots/29-beheer-admin-tablet-portret.png).

Oorzaak: rail 92px in [DienstTabs](../../../src/features/verkoop/DienstTabs.tsx#L40), zijpaneel 372px in [Mandje](../../../src/features/verkoop/Mandje.tsx#L86) en [DienstActief](../../../src/features/bezetting-beheren/DienstActief.tsx#L143), vier vaste kolommen in [Assortiment](../../../src/features/verkoop/Assortiment.tsx#L157).

**Verbetering:** laat kolommen reageren op beschikbare inhoudsbreedte, houd namen/prijs/aantal naast elkaar leesbaar en laat het zijpaneel en header herverdelen. Tabletportret is nergens expliciet uitgesloten; bevestig ondersteuning of maak een heldere minimum-/landschapsafspraak. Telefoonondersteuning voor de bar is niet gevraagd.

### F05 — De focusval van alle dialogen lekt bij Shift+Tab

**P1 · B · T05.** Open afrekenen en druk direct Shift+Tab. Focus belandt op de onderliggende afrekenknop terwijl de dialoog open blijft. [Screenshot 04](screenshots/04-focus-buiten-dialoog.png) toont die achtergrondfocus; de actieve DOM-node is tijdens de controle ook uitgelezen.

[Overlay](../../../src/components/Overlay.tsx#L78) vangt alleen eerste/laatste interactieve elementen af, terwijl de beginfocus op de container staat. De achtergrond is niet `inert`; lange dialogen hebben ook geen gedeeld scroll-/focusbeleid.

**Verbetering:** robuuste focusinsluiting vanuit elke beginpositie, afscherming van de achtergrond, zichtbare focus en herstel naar de trigger of een logische opvolger als die is verdwenen. Dit volgt het [W3C-dialoogpatroon](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Test ook de overgang ledenbeheer → orders → terugdraaien en geldmutaties die een sluitpoging blokkeren.

### F06 — Hover maakt primaire knoppen onvoldoende contrastrijk

**P1 · B · T12.** De actieve afrekenknop verandert bij hover van `accent-active` naar `accent`, maar de tekst blijft wit. Stabiel gemeten: wit op `#ee5a24`, 15,5px vet, contrast **3,42:1**. Axe bevestigt dit. [Screenshot 38](screenshots/38-afrekenen-hover.png), [scan](axe-verkoop-hover.json).

Hetzelfde patroon staat in [Mandje](../../../src/features/verkoop/Mandje.tsx#L329), AfrekenenOverlay, OpwaarderenOverlay, BezettingOverlay en DienstAfsluitenOverlay. [De tokentoelichting](../../../tailwind.config.ts#L12) kent dit probleem, maar [accentContrast.test](../../../test/accentContrast.test.ts) controleert niet het feitelijk gebruikte witte hoverpaar.

**Verbetering:** één correcte knopvariant voor witte tekst, inclusief hover/active/focus; controleer werkelijk gebruikte paren. Voor gewone tekst geldt minimaal 4,5:1 volgens [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### F07 — Teruggedraaide bestelling oogt in saldo als normale uitgave

**P1 · B · T09.** Dezelfde bestelling is op Saldo een gewone negatieve boeking en in Transacties doorgestreept met terugdraaireden. [Saldo](screenshots/32-portal-saldo.png), [historie](screenshots/33-portal-transacties.png). Dat ondermijnt begrip van het persoonlijke geldsaldo.

[SaldoTab](../../../src/features/portal-dashboard/SaldoTab.tsx#L114) zet `showReversal=false`, terwijl [TransactiesTab](../../../src/features/portal-dashboard/TransactiesTab.tsx#L88) de status wel toont. Dit is presentatielogica, geen bewijs van een fout saldo in de database.

**Verbetering:** op beide plekken dezelfde expliciete reversalstatus, toegankelijke tekst en reden. Maak duidelijk dat de oorspronkelijke uitgave is teruggedraaid. Boek of bereken geen extra compensatie in de frontend.

### F08 — Moduskeuze blijft na logout aan een volgende gebruiker hangen

**P2 · B · T01.** Kies Beheer, log uit en log op dezelfde gemounte pagina opnieuw in als een andere gebruiker. De nieuwe gebruiker komt meteen in Beheer terecht. Een volledige herlaadactie brengt de keuze juist terug. [Assortimentbeheer](../../../src/features/assortimentbeheer/Assortimentbeheer.tsx#L39) bewaart `mode` los van de identiteit en reset dit niet bij logout. Geen afzonderlijk overgangsscreenshot bewaard; de login-/keuzeschermen staan in 14–15.

**Verbetering:** modus expliciet aan sessie/identiteit koppelen en wissen bij logout of gebruikerswissel. Herladen en terugnavigeren moeten een afgesproken, consistent resultaat hebben. Dit is een navigatiefout; geen aangetoond autorisatielek.

### F09 — Terug naar bardienst en persoonlijke sessie beëindigen zijn onduidelijk

**P2 · S/V · T01 · D2.** [BeheerTabs](../../../src/features/assortimentbeheer/BeheerTabs.tsx#L65) linkt rechtstreeks naar de bar. Dat strookt niet met ADR 0003's afspraak dat een andere modus opnieuw inloggen vereist. Na de e-mailroute naar Bar bieden DienstTabs en DienstStarten geen persoonlijke logout. [19](screenshots/19-beheer-als-bardienst.png), [16](screenshots/16-email-bar-loopt-vast-op-pin.png).

**Verbetering:** een expliciete sessie-uitgang en voorspelbare bestemming. Onderscheid persoonlijke logout, gedeelde apparaatsessie en dienst afsluiten: logout mag niet stilzwijgend de dienst sluiten. Behoud voorlopig vaste modi; herziening van dat principe is een apart besluit. Effect op echte cookies/apparaatlogin moet met Supabase worden getest.

### F10 — Beheerformulieren verdwijnen terwijl opslaan nog loopt

**P2 · B/S · T06.** Met een vertraagde prijs-RPC: vul 2.75 in, sla op en druk Escape voordat de server antwoordt. Het venster sluit terwijl de bewerking doorgaat; er is geen zichtbare lopende actie of bevestiging. [39: verzoek loopt](screenshots/39-product-opslaan-bezig.png), [40: dialoog verdwenen](screenshots/40-product-gesloten-tijdens-opslaan.png).

[ProductBeherenOverlay](../../../src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L111), nieuwe producten/leden, LidBeherenOverlay, MijnAccountOverlay en BezettingOverlay geven direct `onClose` door. Geldbevestigingen hebben juist een sluitguard. Diverse velden/keuzes blijven tijdens hun verzoek wijzigbaar.

**Verbetering:** één gedeeld beleid voor pending, sluiten en onverwerkte invoer. Tijdens opslaan sluiting blokkeren met duidelijke status, of bewerking zichtbaar laten doorlopen buiten de dialoog. Getoonde waarden mogen niet afwijken van de verstuurde opdracht. Dubbele boekingen zijn hier niet aangetoond, maar blind opnieuw proberen bij onbekende geldstatus hoort niet bij herstel.

### F11 — Losse mutaties kunnen foutstatus en actuele detailgegevens verdringen

**P2 · S · T06.** Naam, e-mail, rol en archiveren hebben afzonderlijke pendingvlaggen en delen `lastAction`. Succesresponses vervangen het volledige lokale lidobject. Een snelle tweede actie kan een nog relevante fout verbergen of een oudere response de nieuwere UI-state laten vervangen. [LidBeherenOverlay](../../../src/features/ledenbeheer/LidBeherenOverlay.tsx#L203), [ProductBeherenOverlay](../../../src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L72); scherm 24 toont meerdere zelfstandige acties.

**Verbetering:** per detailobject samenhangende writes serialiseren, acties afzonderlijk bevestigen en na succes de actuele gegevens consistent ophalen/toepassen. Reproduceer met gecontroleerd omgekeerde responsevolgorde. Geen aangetoonde databasecorruptie: dit is een risico in lokale UI-state.

### F12 — Ongeldige invoer verklaart niet waarom een actie uitstaat

**P2 · B/S · T07.** Typ `abc` in een opwaardeerbedrag. Boeken blijft uit, zonder veldmelding. [10](screenshots/10-opwaarderen-ongeldige-invoer.png). [OpwaarderenOverlay](../../../src/features/opwaarderen/OpwaarderenOverlay.tsx#L68) geeft wel feedback boven de maximale grens, maar niet bij ongeldige tekst of nul/negatieve invoer. Nieuwe leden/producten en PIN-bevestiging hebben vergelijkbare stille voorwaarden.

**Verbetering:** na blur of poging duidelijke, specifieke veldfouten met label en `aria-describedby`/`aria-invalid`. Onderscheid leeg, ongeldig, buiten bereik en niet overeenkomend. Laat een ongewijzigd formulier rustig. Hergebruik de duidelijke wachtwoordchecklist als uitgangspunt, niet de losse disabledknop als uitleg.

### F13 — Leesfouten worden verkeerd uitgelegd en zijn moeilijk te herstellen

**P2 · B/S · T08.** Een geforceerde `members`-leesfout na geldige portal-login wordt ‘Dit account is niet gekoppeld aan een lid’. Een `shifts`-leesfout op het barstartscherm verbergt de e-mailingang; opnieuw proberen ontbreekt. [36](screenshots/36-portal-leesfout-als-accountfout.png), [37](screenshots/37-bar-leesfout-zonder-uitweg.png).

[usePortalSession](../../../src/hooks/queries/usePortalSession.ts#L65) zet queryfouten om in denied. Meerdere readhooks bieden `refetch`, maar schermen tonen alleen de fouttekst. [DienstStarten](../../../src/features/dienst-starten/DienstStarten.tsx#L243) maakt de alternatieve ingang afhankelijk van succesvolle shift-/staflezing.

**Verbetering:** onderscheid netwerk/serverfout, ontbrekende koppeling en verlopen sessie. Bied opnieuw proberen zonder invoerverlies en houd alternatieve login bereikbaar. Bekende data mag zichtbaar blijven met stale-status waar veilig; schrijfknoppen blijven geblokkeerd als hun vereiste data niet betrouwbaar is. Geen offlineboekingen toevoegen.

### F14 — Portalgegevens verouderen zonder duidelijke verversmogelijkheid

**P2 · S · T08.** Saldo/historie laden op mount. Een portal die open blijft tijdens een barboeking krijgt geen focus-/reconnect-refresh en biedt geen handmatige verversing. [usePortalBalance](../../../src/hooks/queries/usePortalBalance.ts#L80), [usePortalTransactions](../../../src/hooks/queries/usePortalTransactions.ts), SaldoTab. Scherm 32 toont geen verversactie of actualiteitsinformatie.

**Verbetering:** zichtbare verversing en refresh na terugkeer/verbindingherstel, samenhangend voor saldo en historie. Geen permanente polling of Realtime-verplichting zonder behoefte. Verifieer met een andere client die het saldo wijzigt; dat echte scenario is hier niet uitgevoerd.

### F15 — Categoriefilters lijken niets te doen tijdens zoeken

**P2 · B/V · T07 · D3.** Zoek Pils en tik Fris. Pils blijft staan; de categorie wordt intern veranderd, maar heeft geen zichtbare werking zolang er een zoekterm is. [07](screenshots/07-categorieklik-tijdens-zoeken.png), [Assortiment](../../../src/features/verkoop/Assortiment.tsx#L54).

Dit gedrag is expliciet beschreven in [verkoop.md](../../../docs/features/verkoop.md#L109), dus een productkeuze met een UX-nadeel. **Voorstel:** een categorieklik wist de zoekterm en toont die categorie. Alternatief: zoekterm en categorie combineren met zichtbare actieve filters en een reset. Kies één contract en pas spec/tests daarop aan; verander dit niet onder het mom van een bugfix.

### F16 — Ledenzoeker en lidwissel vragen onnodig veel aandacht

**P2 · S/V · T07.** De zoeker bestaat uit een input met een lijst knoppen; pijltoetsselectie, Escape en expliciete open/dicht-state ontbreken. Lange namen worden afgekapt. Bij kiezen van een ander lid wordt de bestelling stil gewist. [Mandje](../../../src/features/verkoop/Mandje.tsx#L148), [VerkoopScherm](../../../src/features/verkoop/VerkoopScherm.tsx#L195), schermen 01–02.

Dat wissen is een bewuste bescherming tegen de verkeerde betaler. **Verbetering:** toetsenbordbediening en duidelijke resultaatstatus, volledige naam bereikbaar, sluiten bij Escape/buitenklik. Kondig het wissen vóór de wissel duidelijk aan of vraag alleen bij een gevulde bestelling om bevestiging. Bewaar het veiligheidsdoel. Voeg geen ongeautoriseerde extra persoonsgegevens toe om namen te onderscheiden.

### F17 — Tabs hebben ARIA-rollen maar missen bijbehorende toetsenbordbediening

**P2 · B/S · T05.** Op de portal verplaatst ArrowLeft vanaf Transacties de focus niet. De drie tabimplementaties hebben geen pijltjesafhandeling/roving tabindex; alle tabs zitten in de Tab-volgorde. `aria-controls` kan bovendien naar een ongemount paneel wijzen. [PortalDashboard](../../../src/features/portal-dashboard/PortalDashboard.tsx#L66), [BeheerTabs](../../../src/features/assortimentbeheer/BeheerTabs.tsx), [DienstTabs](../../../src/features/verkoop/DienstTabs.tsx).

**Verbetering:** één geteste gedragsbasis met passende horizontale/verticale bediening, bestaande panels en één tabstop. Gebruik handmatige activatie als laden merkbare vertraging geeft. Het [W3C-tabpatroon](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) beschrijft dit gedrag. De visuele shells mogen verschillen.

### F18 — ‘Deze maand’ is feitelijk ‘laatste vijf transacties’

**P2 · B · T09.** Op 1 oktober toont het saldoscherm septembertransacties onder DEZE MAAND. [32](screenshots/32-portal-saldo.png). [SaldoTab](../../../src/features/portal-dashboard/SaldoTab.tsx#L38) neemt uitsluitend `slice(0,5)`; er is geen maandfilter.

**Verbetering:** ‘Recente transacties’ gebruiken, passend bij de huidige data, en een actie naar alle transacties toevoegen. Alleen als er een echte behoefte aan een maandblok is: filteren op maand én jaar en lege maand correct benoemen. De voorgestelde eenvoudige variant vraagt geen nieuwe query.

### F19 — Het organisatiebrede logboek toont tijd zonder datum

**P2 · B · T10.** Historie uit verschillende dagen heeft alleen HH:mm. Daardoor zijn volgorde en leeftijd moeilijk te begrijpen. [28](screenshots/28-logboek.png). [clockLabel](../../../src/features/logboek/logboek.ts#L41) toont slechts het tijdstip.

**Verbetering:** daggroepering met datum, jaar waar relevant en tijd per rij. Gebruik dezelfde lokale tijdzone-afspraak als portal en beheerdershistorie. Controleer dag-/jaargrenzen en zomertijd; de fixturedata is geschikt voor verschillende dagen, niet voor een echte shiftanalyse.

### F20 — Logboek presenteert terugdraaien op het tijdstip van de oorspronkelijke verkoop

**P2 · S · T10 · D4.** Het logboek noemt de actie ‘Bestelling teruggedraaid’, maar sorteert en toont `orders.created_at` en het oorspronkelijke served-by-profiel. De reden noemt wel de reverser. [useLogboek](../../../src/hooks/queries/useLogboek.ts#L113) leest het reversal-tijdstip niet, terwijl [order_reversals](../../../supabase/migrations/0020_bestelling_terugdraaien.sql#L35) een eigen `created_at` heeft.

**Verbetering:** bepaal of het scherm een statuslijst van boekingen of een gebeurtenissentijdlijn is. Voor de huidige actietekst is een aparte reversalgebeurtenis met juiste datum, actor en verwijzing naar de order het duidelijkst. Een nieuwe reversal van een oude order mag niet verdwijnen doordat alleen recente orders worden gelezen. Dit vereist aangepaste leeslogica; een echte late reversal is hier niet uitgevoerd.

### F21 — Historielimieten zijn onzichtbaar

**P2 · S · T10.** Logboek haalt maximaal 200 boekingen op; terugdraaien in beheer maximaal 50 orders per lid. Tellingen/zoekresultaten vertellen niet duidelijk dat oudere gegevens ontbreken. [useLogboek](../../../src/hooks/queries/useLogboek.ts#L7), [useMemberOrders](../../../src/hooks/queries/useMemberOrders.ts#L29), schermen 25 en 28.

**Verbetering:** benoem ‘meest recente 200’/‘laatste 50’ en de reikwijdte van zoeken. Paginering of periodekeuze is een vervolgbesluit als oudere historie functioneel nodig is. Laat een zoekresultaat niet stil suggereren dat de hele administratie is doorzocht.

### F22 — Lege logboekfilters beloven registratie die niet bestaat

**P2 · B/V · T10.** Assortiment en Leden blijven altijd leeg, maar tonen ‘elke handeling in de app komt hier te staan’. [30](screenshots/30-logboek-filter-zonder-bron.png), [logboekEmptyState](../../../src/features/logboek/logboek.ts#L144).

Dat deze filters zichtbaar blijven is expliciet door Bram besloten; Alles en Geld zijn momenteel bewust identiek. **Verbetering binnen die afspraak:** leg eerlijk uit dat deze categorie nog niet wordt geregistreerd. Maak ook de algemene logboekomschrijving passend bij de werkelijk beschikbare boekingen. Filters verwijderen of echte auditlogging bouwen is een apart productbesluit.

### F23 — E-mailadres bewerken maakt de relatie met inloggen niet duidelijk

**P2 · S · T11.** Ledenbeheer toont een bewerkbaar e-mailadres naast inloggegevens. [update_member_email](../../../supabase/migrations/0008_ledenbeheer_email.sql) verandert `members.email`, niet het gekoppelde Auth-loginadres. [24](screenshots/24-lid-beheren.png).

**Verbetering:** benoem waarvoor dit adres wordt gebruikt en dat een gekoppeld loginadres niet automatisch wijzigt. Geef een concrete vervolgstap voor het wijzigen van inloggegevens; bouw die alleen als hij echt beschikbaar is. Doe geen automatische accountmigratie in een frontendticket. De bestaande loskoppeling is een product-/datamodelafspraak, geen aangetoonde backendfout.

### F24 — Een groot ledenformulier zit in dezelfde kleine dialoog als afrekenen

**P2 · B/V · T11.** Naam, saldo, e-mail, rol, account, uitnodiging, terugdraaien en archiveren staan in een venster van maximaal 460px breed en 88vh hoog. Sluiten en latere acties liggen onder de zichtbare fold. Scrollen werkt; ze zijn niet onbereikbaar. [24](screenshots/24-lid-beheren.png), [Overlay](../../../src/components/Overlay.tsx#L131).

**Verbetering:** detailvariant met vaste titel/sluitactie en rustig gegroepeerde secties; eventueel ruimer zijpaneel of eigen detailpagina. Maak per sectie duidelijk wat is opgeslagen en wat nog gewijzigd is. Gebruik niet blind één formaat voor financiële bevestiging en uitgebreid beheer.

### F25 — Assortimentbeheer groeit slecht mee met meer producten

**P3 · S/V · T11.** De beheerlijst heeft geen zoekfunctie, categorie-/archieffilter of sorteerkeuze; verkoop heeft die hulpmiddelen deels wel. Naam en categorie zijn na aanmaken niet bewerkbaar in dit scherm. Nieuwe producten gebruiken vaste categorieopties. [19–22](SCHERMREVIEW.md), [ProductenLijst](../../../src/features/assortimentbeheer/ProductenLijst.tsx), NieuwProductOverlay.

**Verbetering:** eerst zoeken en onderscheid actief/gearchiveerd; daarna pas naam-/categoriebeheer als productwens. Dit is uitbreiding van de minimale huidige scope, geen reden om direct een categoriebeheersysteem te bouwen. Verifieer de daadwerkelijke catalogusgrootte voordat extra beheercomplexiteit wordt toegevoegd.

### F26 — De laatste activiteit archiveren heeft geen waarschuwing over dienststart

**P3 · S/V · T11 · D5.** Instellingen laten ook het laatste actieve type archiveren; zonder actief type kan geen nieuwe dienst starten. De startflow geeft daar wel uitleg over, en een beheerder kan een nieuw type maken. [27](screenshots/27-instellingen.png), ActiviteitstypesInstellingen, [expliciet randgeval in de spec](../../../docs/features/activiteittypes.md#L627).

**Verbetering:** vooraf zichtbaar maken dat geen startoptie overblijft, met een alternatief toevoegen/herstellen. De laatste optie hard blokkeren verandert de afspraak en vraagt een besluit. Geen algemene extra bevestigingen toevoegen voor alle omkeerbare archiveringen.

### F27 — Kleine visuele en taalkundige verschillen maken het systeem minder samenhangend

**P3 · S/V · T12.** Voorbeelden: `cash` in bar/logboek tegenover ‘contant’ in portal; ‘Invite’ tegenover Nederlandse labels; uiteenlopende Sluiten/Klaar/annuleren-vormen; veel losse controlhoogtes/radii; kleine verwijder-/wijzigacties tegenover ruime primaire knoppen. Manrope wordt als eerste font genoemd in Tailwind, maar wordt niet via een fontbestand of `next/font` geladen. Portaldesktop strekt kleine gegevens over de volledige breedte. [28](screenshots/28-logboek.png), [34–35](SCHERMREVIEW.md), [tokens](../../../tailwind.config.ts#L89), rootlayout en globals.

**Verbetering:** vaste woordenlijst, gedeelde controlvarianten en expliciete fontkeuze; beperk portalinhoud op desktop. Vergroot kleine belangrijke touchacties waar nuttig. **44px is een comfortdoel, geen universele WCAG-AA-eis**; [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) kent 24px en uitzonderingen voor onder meer afstand. iOS-inputzoom bij kleine fonts is een hypothese die op een echt toestel moet worden getest.

### F28 — Het actieve verkoopscherm mist een main-landmark

**P2 · B · T05.** Axe meldt `landmark-one-main` en `region` op de actieve verkoopweergave. [DienstTabs](../../../src/features/verkoop/DienstTabs.tsx#L37) gebruikt een omhullende div en paneldivs; het startscherm heeft wel een main. [Scan](axe-verkoop-hover.json).

**Verbetering:** één duidelijke main-landmark met herkenbare navigatie en panelnamen, plus logische volgorde. Dit zijn twee axe-best-practicebevindingen, niet twee afzonderlijke bewezen WCAG-overtredingen. Controleer de Dienst-variant en dialoogachtergrond mee.

## Besluiten vóór uitvoering

| Besluit | Aanbevolen richting | Consequentie |
| --- | --- | --- |
| D1 Ondersteunde bar-tablets | 768px portret en 1024px landschap bruikbaar maken | Indien landschap verplicht is: leg minimummaat en duidelijke toestelmelding vast; los afgekorte normale namen op 1024px alsnog op |
| D2 Vaste modi en persoonlijke logout | ADR behouden, expliciet beëindigen/herinloggen | Een echte moduswissel alleen na wijziging van ADR/productafspraak |
| D3 Zoeken + categorie | Categorieklik wist de zoekterm | Alternatief samen filteren; huidige overschrijfregel in spec bijwerken |
| D4 Logboekbetekenis | Tijdlijn van boekingen én terugdraaiingen | Anders hernoemen naar boekingen/status en tijdlabels daarop aanpassen |
| D5 Laatste activiteit | Waarschuwen met hersteloptie | Hard verbod vraagt productbesluit |

Deze besluiten blokkeren niet het hele plan. Bugs zoals draftverlies, focuslek en hovercontrast kunnen onafhankelijk worden opgepakt. Neem bij omzetting naar echte tickets de besluiten expliciet over; agents mogen ze niet ongemerkt invullen.

## Aanbevolen uitvoering

Begin met T01–T05, de financiële portalweergave uit T09 en het contrastdeel van T12. Werk daarna fout-/verversgedrag, mutaties en formulieren af. Logboek en beheer volgen; overige visuele verfijning komt als laatste. Het [verbeterplan](VERBETERPLAN.md) bevat voor ieder ticket scope, acceptatiecriteria, relevante bestanden, afhankelijkheden en controles. De [schermreview](SCHERMREVIEW.md) is het visuele bewijsregister.

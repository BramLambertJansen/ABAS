# Schermreview en bewijsregister

Alle onderstaande afbeeldingen zijn tijdens deze review van de daadwerkelijke lokale frontend vastgelegd en geopend/geïnspecteerd. De 41 nummers zijn captures en varianten; de twaalf gebruikersflows staan in de [audit](README.md#doorlopen-stappen). Nummering volgt grotendeels de onderzoeksvolgorde, met het eigen account als aanvullende capture. Voor/na-timing en keyboardfocus zijn tevens via DOM/broncode gecontroleerd.

**Scope:** echte frontend met fictieve lokale API; geen bewijs van echte geldboekingen, RLS, e-mail/recovery, Safari, fysiek touch of schermlezergebruik. De algemene beperkingen in de [audit](README.md#onderzoek-en-grenzen) gelden voor iedere capture. Goed ogende schermen betekenen geen volledige toegankelijkheidsconformiteit. De devindicator is geen productie-UI.

## 01 — Verkoop: beginscherm

**Gezondheid: Aandacht.** Grote primaire actie en duidelijk mandje. Vier kolommen korten gewone productnamen af; F04.

![01 — Verkoop: beginscherm](screenshots/01-verkoop-tablet.png)

## 02 — Verkoop: lid en bestelling gekozen

**Gezondheid: Kritiek.** Lid, saldo, aantallen en totaal zijn zichtbaar. Productbadge bedekt naam; dit is de uitgangstoestand voor F03/F04.

![02 — Verkoop: lid en bestelling gekozen](screenshots/02-bestelling-voor-tabwissel.png)

## 03 — Afrekenbevestiging

**Gezondheid: Aandacht.** Lid en uitvoerder zijn expliciet, met een duidelijke laatste bevestiging. Werkelijke geldboeking niet gevalideerd; gedeeld dialooggedrag F05.

![03 — Afrekenbevestiging](screenshots/03-afrekenen.png)

## 04 — Afrekenen: direct Shift+Tab

**Gezondheid: Kritiek.** Dialoog blijft zichtbaar, maar focusring staat op de onderliggende afrekenknop. Actieve DOM-node bevestigde focus buiten de dialoog; F05.

![04 — Afrekenen: direct Shift+Tab](screenshots/04-focus-buiten-dialoog.png)

## 05 — Dienstoverzicht

**Gezondheid: Aandacht.** Samenvatting en actieve bezetting geven houvast. Tabletportret moet dezelfde financiële context behouden; F04. Historiedatums zijn synthetisch.

![05 — Dienstoverzicht](screenshots/05-dienst.png)

## 06 — Verkoop na Dienst → Verkoop

**Gezondheid: Kritiek.** Het lege mandje is duidelijk vormgegeven, maar hier onverwacht: lid en draft uit scherm 02 zijn verdwenen; F03.

![06 — Verkoop na Dienst → Verkoop](screenshots/06-bestelling-na-tabwissel.png)

## 07 — Product zoeken en categorie kiezen

**Gezondheid: Aandacht.** Zoekveld en categoriechips zijn herkenbaar. Fris kiezen tijdens zoekterm Pils heeft geen zichtbaar filtereffect; F15, bewust huidig productcontract.

![07 — Product zoeken en categorie kiezen](screenshots/07-categorieklik-tijdens-zoeken.png)

## 08 — Bezetting wijzigen

**Gezondheid: Kritiek.** Aan-/uitvinken is eenvoudig. Bevoegde Femke zonder PIN ontbreekt; F02. Kandidaatquery is ten onrechte die van PIN-login.

![08 — Bezetting wijzigen](screenshots/08-bezetting-zonder-pin-ontbreekt.png)

## 09 — Saldo opwaarderen

**Gezondheid: Aandacht.** Bedragkeuzes, huidig saldo en uitvoerder zijn duidelijk. Geldmutatie niet uitgevoerd als backendvalidatie; pending en validatie F10/F12.

![09 — Saldo opwaarderen](screenshots/09-opwaarderen.png)

## 10 — Opwaarderen: ongeldige tekst

**Gezondheid: Aandacht.** Boeken is geblokkeerd, maar bij abc ontbreekt de reden bij het veld; F12.

![10 — Opwaarderen: ongeldige tekst](screenshots/10-opwaarderen-ongeldige-invoer.png)

## 11 — Bestelling terugdraaien vanuit bar

**Gezondheid: Aandacht.** Reden en financiële consequentie zijn zichtbaar; deze extra bevestiging behouden. Werkelijke reversal en saldocorrectie niet uitgevoerd.

![11 — Bestelling terugdraaien vanuit bar](screenshots/11-terugdraaien-bar.png)

## 12 — Dienst afsluiten: bevestiging

**Gezondheid: Aandacht.** Duidelijk einde van een dienst. Behoud onderscheid afsluiten/logout; test focus en pending naast de huidige inhoud; F05/F09/F10.

![12 — Dienst afsluiten: bevestiging](screenshots/12-dienst-afsluiten.png)

## 13 — Dienst op tabletportret

**Gezondheid: Kritiek.** De kernstructuur blijft herkenbaar, maar het vaste zijpaneel drukt financiële regels/context weg; F04, afhankelijk van D1.

![13 — Dienst op tabletportret](screenshots/13-dienst-tablet-portret.png)

## 14 — Persoonlijke beheerlogin

**Gezondheid: Aandacht.** Herkenbare aparte ingang en meerdere loginmogelijkheden. Succes met fictieve auth bewijst geen echte accountbeveiliging of e-mail; F13.

![14 — Persoonlijke beheerlogin](screenshots/14-beheer-login.png)

## 15 — Moduskeuze na e-maillogin zonder PIN

**Gezondheid: Kritiek.** Bar, Beheer en Mijn account zijn duidelijk aangeboden. Bar belooft toegang die een gesloten dienst niet kan waarmaken; F01.

![15 — Moduskeuze na e-maillogin zonder PIN](screenshots/15-moduskeuze-zonder-pin.png)

## 16 — Bar gekozen door medewerker zonder PIN

**Gezondheid: Kritiek.** PIN-starters staan netjes in de lijst, maar de ingelogde medewerker ontbreekt en heeft geen eigen startweg; F01/F09.

![16 — Bar gekozen door medewerker zonder PIN](screenshots/16-email-bar-loopt-vast-op-pin.png)

## 17 — PIN-pad: activiteit kiezen

**Gezondheid: Aandacht.** Een afzonderlijke activiteitstap maakt de context expliciet. Houd fout/herstel en de situatie zonder actieve types duidelijk; F13/F26.

![17 — PIN-pad: activiteit kiezen](screenshots/17-activiteitkeuze.png)

## 18 — PIN-pad: pincode invoeren

**Gezondheid: Redelijk.** Grote toetsen passen bij touch en voortgang is herkenbaar. PIN-pad zelf is geen vervanging voor e-mailstart zonder PIN; F01. Echte PIN-validatie niet getest.

![18 — PIN-pad: pincode invoeren](screenshots/18-pin-invoer.png)

## 19 — Beheer als bardienstmedewerker

**Gezondheid: Aandacht.** Rolafhankelijke navigatie is zichtbaar; Logboek ontbreekt zoals bedoeld. Terug naar bar en catalogusbediening vragen aandacht; F09/F25.

![19 — Beheer als bardienstmedewerker](screenshots/19-beheer-als-bardienst.png)

## 20 — Beheer met drie tabs op tabletportret

**Gezondheid: Redelijk.** De drie tabs van bardienst passen beter. Vergelijk met adminvariant 29; dat verschil veroorzaakt F04.

![20 — Beheer met drie tabs op tabletportret](screenshots/20-beheer-tablet-portret.png)

## 21 — Productdetails bewerken

**Gezondheid: Aandacht.** Prijswijziging legt effect op toekomstige verkopen uit; archiveren bewaart historie. Losse saves en sluiten hebben geen samenhangend pendingbeleid; F10/F11.

![21 — Productdetails bewerken](screenshots/21-product-beheren.png)

## 22 — Nieuw product

**Gezondheid: Aandacht.** Een compact formulier met concrete categoriekeuzes. Ongeldige prijs/ontbrekende waarde verklaren disabled acties onvoldoende; F12. Categoriebeheer is voorstel F25.

![22 — Nieuw product](screenshots/22-nieuw-product.png)

## 23 — Ledenlijst

**Gezondheid: Redelijk.** Zoeken en actief/archiefstatus ondersteunen beheer. Lange namen en detailnavigatie meenemen bij responsive- en focusherstel; F04/F24.

![23 — Ledenlijst](screenshots/23-ledenbeheer.png)

## 24 — Uitgebreid lidprofiel

**Gezondheid: Aandacht.** Veel noodzakelijke informatie is samengebracht. De kleine modal maakt secties en sluiten minder overzichtelijk; e-mail/loginbetekenis en losse acties F11/F23/F24.

![24 — Uitgebreid lidprofiel](screenshots/24-lid-beheren.png)

## 25 — Orders van een lid bekijken

**Gezondheid: Aandacht.** Orderselectie scheidt terugdraaien van profielbewerking. De laatste-50-cap moet duidelijk zijn; F21. Test focus tussen opvolgende dialogen; F05.

![25 — Orders van een lid bekijken](screenshots/25-terugdraaien-beheer.png)

## 26 — Nieuw lid met startsaldo

**Gezondheid: Aandacht.** Naam/startsaldo zijn eenvoudig gegroepeerd. Validatie en pending/sluiten moeten uitleg geven, mede omdat startsaldo geld raakt; F10/F12.

![26 — Nieuw lid met startsaldo](screenshots/26-nieuw-lid.png)

## 27 — Saldolimiet en activiteittypes

**Gezondheid: Aandacht.** Instellingen tonen de beschikbare keuzes. Laatste activiteit archiveren vraagt uitleg over latere dienststart; F26. Niet als bestaande deadlock rapporteren.

![27 — Saldolimiet en activiteittypes](screenshots/27-instellingen.png)

## 28 — Organisatiebreed logboek

**Gezondheid: Aandacht.** Filters, zoeken en actorcontext ondersteunen onderzoek. Tijd zonder datum, cash-label, reversalchronologie en verborgen cap F19–F21/F27.

![28 — Organisatiebreed logboek](screenshots/28-logboek.png)

## 29 — Adminnavigatie met vier tabs op tabletportret

**Gezondheid: Kritiek.** Admin krijgt terecht extra Logboektoegang. Header overschrijdt 768px en laat Uitloggen buiten beeld; F04.

![29 — Adminnavigatie met vier tabs op tabletportret](screenshots/29-beheer-admin-tablet-portret.png)

## 30 — Logboek: categorie zonder registratiebron

**Gezondheid: Aandacht.** Lege toestand voorkomt een lege witte lijst. De belofte dat elke handeling hier komt klopt niet bij ontbrekende registratie; F22.

![30 — Logboek: categorie zonder registratiebron](screenshots/30-logboek-filter-zonder-bron.png)

## 31 — Portal: aanmelden

**Gezondheid: Redelijk.** Een rustige eigen ingang voor persoonlijke saldo-informatie. Fictieve login/magic-linkstub bewijst geen bezorging of recovery; echte auth blijft open controle.

![31 — Portal: aanmelden](screenshots/31-portal-login.png)

## 32 — Portal: saldo en recente transacties

**Gezondheid: Kritiek.** Saldo en kleine selectie zijn snel te scannen. September onder Deze maand in oktober en ontbrekende reversalstatus F07/F18; actualiteit F14.

![32 — Portal: saldo en recente transacties](screenshots/32-portal-saldo.png)

## 33 — Portal: volledige transactieweergave

**Gezondheid: Aandacht.** Maandgroepering, filters en reversalmarkering zijn bruikbaar en verdienen behoud. Tabs missen pijltjesbediening; F17.

![33 — Portal: volledige transactieweergave](screenshots/33-portal-transacties.png)

## 34 — Portal op 320px

**Gezondheid: Aandacht.** Basislayout past zonder paginabrede horizontale overflow. Lange reversalcontext wordt afgekapt; maak essentiële status/reden bereikbaar, F07/F27.

![34 — Portal op 320px](screenshots/34-portal-320px.png)

## 35 — Portal op desktop

**Gezondheid: Aandacht.** Zelfde taak blijft beschikbaar op desktop. Grote vollebreedtestroken verdelen korte informatie over veel ruimte; begrens inhoud, F27.

![35 — Portal op desktop](screenshots/35-portal-desktop.png)

## 36 — Portal: gecontroleerde leesfout

**Gezondheid: Kritiek.** Een melding is zichtbaar, maar de oorzaak is onjuist: HTTP 500 bij members wordt account niet gekoppeld. F13; fixturefout, geen echt ongeldige koppeling.

![36 — Portal: gecontroleerde leesfout](screenshots/36-portal-leesfout-als-accountfout.png)

## 37 — Barstart: gecontroleerde shifts-leesfout

**Gezondheid: Aandacht.** Serverfout wordt benoemd. Retry en e-mailingang ontbreken; F13. Smalle capture is alleen fout-statebewijs, geen eis voor bar op telefoon.

![37 — Barstart: gecontroleerde shifts-leesfout](screenshots/37-bar-leesfout-zonder-uitweg.png)

## 38 — Verkoop: stabiele hover op primaire actie

**Gezondheid: Kritiek.** Actie en totaal zijn duidelijk. Witte tekst op accent meet 3,42:1; axe bevestigt F06. De Pilsprijs is hier gewijzigd in de lokale fixture, geen inconsistentie met eerdere captures.

![38 — Verkoop: stabiele hover op primaire actie](screenshots/38-afrekenen-hover.png)

## 39 — Productprijs: vertraagd verzoek loopt

**Gezondheid: Aandacht.** Opslaan is disabled, maar expliciete voortgang ontbreekt en andere acties/Sluiten blijven actief; F10/F11. Serververtraging is gecontroleerd op 5 seconden.

![39 — Productprijs: vertraagd verzoek loopt](screenshots/39-product-opslaan-bezig.png)

## 40 — Productprijs: Escape vóór serverantwoord

**Gezondheid: Aandacht.** Focus keert naar de productrij. Het verzoek loopt verder terwijl de dialoog verdwijnt en de lijst nog de oude prijs toont; F10. Browseractie/bron, niet screenshot alleen, bewijst de timing.

![40 — Productprijs: Escape vóór serverantwoord](screenshots/40-product-gesloten-tijdens-opslaan.png)

## 41 — Mijn account: optionele PIN

**Gezondheid: Aandacht.** Uitleg wachtwoordbasis en optionele PIN is helder. Die belofte botst met de gesloten-barroute F01; pending/dialoogbeleid F05/F10. Uitzetten is niet uitgevoerd op echte accountdata.

![41 — Mijn account: optionele PIN](screenshots/41-mijn-account.png)

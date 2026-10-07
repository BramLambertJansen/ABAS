# Browsercontrole van interactiepatronen reproduceren

Dit hulpmiddel ondersteunt de screenshots in het gezamenlijke [reviewrapport](../REVIEW.md). Het is een interactieve capturehulp met fictieve browserfixtures, geen productcomponent of volledige testsuite. De vastgelegde screenshots zijn gemaakt op 6 oktober 2026 en afzonderlijk bekeken. Selectors zijn tijdens die run gecorrigeerd op basis van het actuele DOM. De kopie hieronder bevat die correcties en een complete `app_settings`-fixture zodat Instellingen geen onbedoelde fixturefout toont.

## Voorwaarden

Gebruik een aparte checkout waarvan `src`, `test`, `e2e` en Tailwind overeenkomen met de main-commit in [baseline.json](../baseline.json). Installeer de projectdependencies volgens de repository-instructies. Het script gebruikt de TypeScript- en Playwright-dependencies van die checkout en `e2e/helpers/supabaseMock.ts`. Een werkende Chromium-installatie is nodig. In deze review is Node 24.21.0 gebruikt.

Start de bestaande productiebuild in die checkout op localhost:

```bash
npm run start -- --hostname 127.0.0.1 --port 3100
```

Een build moet vóór het starten bestaan. Dit hulpmiddel bouwt niets en haalt geen secrets op. De bestaande lokale build is voor deze run gebruikt. Browserrequests naar Auth/REST worden met fictieve antwoorden afgehandeld; andere externe browserrequests worden geblokkeerd. Het script accepteert alleen een lokale app-origin. Dit bewijst niet dat een willekeurige aangepaste app geen server-side netwerkverkeer doet; gebruik de vastgelegde ABAS-bronbaseline.

Start in een tweede terminal de capturehulp, met paden naar jouw aparte checkout, nieuwe outputmap en Chromium-binary:

```bash
ABAS_AUDIT_CHECKOUT=/pad/naar/aparte-checkout \
ABAS_AUDIT_OUTPUT=/tmp/abas-interaction-audit-output \
ABAS_AUDIT_CHROMIUM=/pad/naar/chromium \
node docs/audits/2026-10-06-componenten-tokens/tools/interaction-audit.cjs
```

Voer het script uit vanuit de checkout die de auditdocumenten bevat, of geef zijn absolute pad mee. Dependencies worden uit `ABAS_AUDIT_CHECKOUT` geladen. De standaard app-origin is `http://127.0.0.1:3100`; een andere lokale origin kan via `ABAS_AUDIT_ORIGIN`. Zet nieuwe captures in een andere map: overschrijf de geaccepteerde bewijsscreenshots niet. `LD_LIBRARY_PATH` kan bij een losse Linux-Chromium-installatie nodig zijn; gebruik de systeembibliotheken passend bij die installatie.

## Stappen

Wacht op `READY`. Voer telkens één JSON-regel in, wacht op de output en bekijk de opgeslagen screenshot voordat je verdergaat. Bij pending-stappen houdt het script het fictieve antwoord vast tot de volgende succes-/foutstap. Dat is scenario-invoer, geen app-time-out.

| Screenshot | Invoer | Onderzochte overgang |
|---|---|---|
| 01 | `{"step":"admin"}` | Product openen |
| 02 | `{"step":"dirty"}` | Prijs wijzigen |
| 03 | `{"step":"escape"}` | Escape met wijzigingen |
| 04 | `{"step":"close"}` | Sluiten met dezelfde wijzigingen |
| 05 | `{"step":"pending"}` | Opslaan met vastgehouden antwoord, daarna Escape |
| 06 | `{"step":"saved"}` | Antwoord vrijgeven; validatie na succes |
| 07 | `{"step":"save-error"}` | Geforceerde prijsafwijzing |
| 08 | `{"step":"archive"}` | Laatste actieve type willen archiveren, nog niet bevestigen |
| 09 | `{"step":"portal"}` | Lege naam na verlaten van het veld |
| 10 | `{"step":"portal-pending"}` | Naamopslag met vastgehouden antwoord |
| 11 | `{"step":"portal-saved"}` | Sheet sluiten na succes |
| 12 | `{"step":"read-error"}` | Account-leesfout |
| 13 | `{"step":"read-pending"}` | Retry met vastgehouden antwoord |
| 14 | `{"step":"read-failed"}` | Opnieuw een leesfout |
| 15 | `{"step":"money"}` | Verloren antwoord bij nieuw lid |
| 16 | `{"step":"money-reload"}` | Bewaarde onbekende uitkomst na herladen |
| 17 | `{"step":"member-dirty"}` | Naam gewijzigd in lidbeheer |
| 18 | `{"step":"member-saved"}` | Sectiesucces in lidbeheer |
| 19 | `{"step":"member-validation"}` | Ongeldig contactadres, lokale feedback |

`{"step":"state"}` toont het huidige DOM en focus. `{"step":"done"}` schrijft de JavaScript-pageerrors en sluit de browser. Stop daarna de eigen lokale server. Een herhaling levert nieuwe captures en vereist opnieuw visuele beoordeling; het bestaande rapport wordt niet automatisch herschreven.

## Interpretatie

De fixturelijsten en profielnamen zijn vaste gegevens. Een oude waarde op de achtergrond na een succesvolle mutatie is daarom geen bewijs van een refreshfout. De prijsafwijzing is geforceerd, ook bij een geldige voorbeeldprijs. Het veldfeedbackprobleem na succesvolle opslag is wel in de echte React-component gereproduceerd.

De `calls`-teller in capturemetadata telt alleen de expliciet gemonitorde vertraagde prijs-/naamacties en de verloren `create_member_once`-aanroep. Het is geen totaal van alle HTTP-requests of RPC's. Voor stap 15 en 16 blijft die teller gelijk: herladen verstuurt geen tweede aanmaakactie. De succesvolle lidnaamfixture wordt niet door deze teller gemeten.

Deze capturehulp voert het financiële serverherstel of de definitieve annulering niet uit. De databasewerking, alle overlays, 30-seconden-time-outs, schermlezers en fysieke apparaten zijn niet volledig geverifieerd. Zie de bewijsgrenzen in het rapport.

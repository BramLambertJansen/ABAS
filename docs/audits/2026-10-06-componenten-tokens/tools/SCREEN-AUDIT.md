# Schermcontrole reproduceren

Deze interactieve capturehulp hoort bij punt 3 van [het reviewrapport](../REVIEW.md). De 22 geaccepteerde captures (20–41), viewports, visuele beoordelingen en toetsenbordmetingen staan in [captures.json](../screen-evidence/captures.json) en [keyboard.json](../screen-evidence/keyboard.json). Het is geen volledige automatische testsuite.

Gebruik een aparte checkout met de bronbaseline uit [baseline.json](../baseline.json), geïnstalleerde projectdependencies, Chromium en een lokaal draaiende productiebuild op poort 3100. Het script bouwt niets en haalt geen secrets op. Auth/REST worden met fictieve browserfixtures afgehandeld; overige externe browserrequests worden geblokkeerd. Het script accepteert alleen localhost. Gebruik de vastgelegde appbaseline, omdat de browserblokkade op zichzelf geen serververkeer van een gewijzigde app begrenst.

```bash
ABAS_AUDIT_CHECKOUT=/pad/naar/checkout \
ABAS_AUDIT_OUTPUT=/tmp/abas-screen-audit-new \
ABAS_AUDIT_CHROMIUM=/pad/naar/chromium \
node tools/screen-audit.cjs
```

Geef het absolute scriptpad mee als je niet in deze tools-map staat. Een losse Linux-Chromium-installatie kan passende bibliotheken via `LD_LIBRARY_PATH` vereisen. Gebruik een nieuwe outputmap; overschrijf de geaccepteerde screenshots niet.

Wacht op `READY`. Voer telkens één JSON-regel in. Wacht op het resultaat en bekijk de screenshot vóór de volgende handeling. `init`, `page`, `action`, `snap`, `state`, `metrics` en de fixtures zijn beschikbaar in de interactieve scope. De volledige scenarioselectie en beoordeling staan per stap in het rapport; alleen deze kernscenario's zijn hieronder als commando opgenomen:

```json
{"code":"await init('portal',{width:320,height:844}); await action(page.getByRole('tab',{name:'Transacties',exact:true}),'click'); await snap('portal-320','Transacties bij gewone tekst');"}
{"code":"await page.addStyleTag({content:'html { font-size:32px!important; }'}); await snap('portal-vergroot','Stresstest basisletters; geen echte browserzoom');"}
{"code":"await init('bar',{width:768,height:1024}); await action(page.getByRole('combobox',{name:'Zoek lid'}),'fill','Joris'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); console.log(JSON.stringify(await state())); await snap('lidselectie','Focus na gewone lidselectie');"}
{"code":"await init('bar',{width:512,height:384}); await snap('kassa-zoomlayout','Verkleinde CSS-layoutviewport, geen echte browserzoom');"}
{"done":true}
```

`snap` schrijft standaard een full-page screenshot, DOM-/focus-/viewportmetingen en een axe-scan met WCAG 2.0/2.1/2.2 A/AA-tags. Voor een viewport-only screenshot gebruik je `page.screenshot({path:...,fullPage:false})`; noteer dat onderscheid in de metadata. Dat was relevant bij de geaccepteerde stappen 27, 40 en 41. Het script voegt geen beoordeling of bevinding automatisch toe aan het rapport.

Bewijsgrenzen: vaste fixtures bewijzen geen echte refreshlogica; een kort scherm simuleert geen fysiek schermtoetsenbord. Vergroting van de CSS-basisletter en een verkleinde layoutviewport zijn afzonderlijke stresstests. Axe-incomplete-resultaten vragen handmatige beoordeling; nul automatische overtredingen bewijst geen volledige conformiteit. Sluit met `done` de browser en stop daarna de eigen lokale server.

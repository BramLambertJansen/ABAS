# Verificatie van de geïmplementeerde frontendreview

Logs zijn genormaliseerd voor terminalcodes en trailing whitespace; testinhoud blijft behouden.

Deze map bevat nieuw bewijs; de oorspronkelijke 41 reviewscreenshots en
baseline-inventaris blijven behouden. Zie de uitvoeringssectie in [REVIEW.md](../REVIEW.md).

- [Implementatie en bronhashes](implementation.json).
- [215 geslaagde browsertests](browser-cases.json), [log](browser.log).
- [Snelle gates en 805 unitcontroles](check-fast.log), [productiebuild](build.log).
- [10 visueel bekeken captures](captures.json), elk met DOM, focus, viewport en
  axe-resultaat. Screenshot 08 staat in een gescrolde dialoog: volledige knophoogte
  blijft behouden. Screenshot 07 toont het product na scrollen in 512×384.
- [Browserfouten](browser-errors.json): geen pageerrors.

Fictieve browserfixtures; geen productiegegevens of productieboeking. Nul axe-
overtredingen is geen volledige WCAG-goedkeuring. De database-/live-a11y-gate en
fysieke apparaten blijven apart te controleren. De afgekeurde tussencaptures
(korte header, platgedrukte knoppen, screenshot vóór stabiele paint) zijn vervangen
door het geaccepteerde bewijs en staan niet in deze map.

Reproduceer met Node 24, `npm ci`, Chromium en een lokale build op poort 3100
met fictieve Supabase-configuratie. De volledige specselectie staat in browser.log.
Voor captures: gebruik [de capturehulp](../tools/SCREEN-AUDIT.md) met deze checkout
en een nieuwe outputmap. Deze helper heeft oudere fixturedata; de automatische
regressies in e2e/frontend-review.spec.ts zijn het actuele contract.

De 51 PNG-bestanden blijven vooralsnog in de lokale auditmap; publicatie wordt
door de automatische goedkeuringscontrole geblokkeerd zonder expliciet akkoord.
De `file`-paden in captures en PNG-hashes in sha256.json verwijzen naar dit lokaal
beschikbare beeldbewijs. JSON-captures en testlogs zijn wel gepubliceerd.

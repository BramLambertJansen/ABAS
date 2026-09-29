# 0014 — Overlays melden hun aanwezigheid via een gedeelde context

Status: **geaccordeerd (2026-09-28)**, als onderdeel van de door Bram
goedgekeurde spec
[`docs/features/dienst-te-lang-open.md`](../features/dienst-te-lang-open.md)
(besluit 7). Amendeert geen eerdere ADR. Het vult het bestaande contract van
`src/components/Overlay.tsx` aan (`docs/ARCHITECTURE.md` →
`useShell().overlay`) en past het precedent "nooit twee overlays tegelijk"
toe (`LidBeherenOverlay.tsx`).

## Context

De melding "Dienst staat nog open" komt vanzelf op, op een tijdstip dat
niemand kiest. Alle andere overlays opent de gebruiker zelf. Valt de grens
van 6 uur terwijl er al een overlay openstaat (Afrekenen, Opwaarderen met de
€100-bevestiging, Bezetting, Terugdraaien, Dienst afsluiten), dan gaat
stapelen mis. Elke `Overlay` luistert documentbreed naar Escape en naar
`mousedown` buiten zijn eigen venster. Een tik in de bovenste overlay sluit
dan de onderste, en de twee focus-traps vechten om Tab. Bram koos: **de
melding wacht tot er geen andere overlay open is** (spec → besluit 7).

Daarvoor moet de melding weten of er ergens een overlay openstaat. Die state
zit vandaag lokaal in elke feature (`VerkoopScherm.tsx`: drie overlays,
`DienstActief.tsx`: drie overlays), en er is geen gedeelde query-cache of
store.

## Beslissing

**`Overlay` meldt zich bij mount aan bij een teller in een React-context, en
bij unmount weer af. Wie moet weten of er een overlay openstaat, leest die
teller.**

- `src/components/OverlayPresence.tsx` bevat `OverlayPresenceProvider` en
  `useOpenOverlayCount()`, plus de aanmeldfunctie die `Overlay` intern
  gebruikt. Die functie is stabiel, zodat aanmelden alleen bij mount en
  unmount gebeurt.
- `src/components/Overlay.tsx` krijgt alleen het aanmeld-effect. Markup,
  focusbeheer, Escape en achtergrond veranderen niet.
- **Zonder provider doet aanmelden niets en is de teller 0.** De provider
  wordt alleen gemount waar er een consument van de teller is. Vandaag is
  dat `src/features/verkoop/DienstTabs.tsx`, om de hele bar-modus met een
  open dienst heen.
- De teller telt **`Overlay`-instanties**, niet "dialogen in het algemeen".
  Een eigen `role="dialog"` buiten `Overlay` om wordt niet gezien. Dat was
  al een reviewfout (CLAUDE.md → "Componenten zijn herbruikbaar totdat
  bewezen anders"), en dit ADR maakt het ook functioneel fout.

## Verworpen alternatieven

**1. Props omhoog: elke scherm-feature meldt zijn overlay-state aan
`DienstTabs`.** `VerkoopScherm` en `DienstActief` zouden elk een
`onOverlayOpenChange`-prop krijgen, met een effect per overlay-state (zes
stuks), en `DienstTabs` zou twee booleans bijhouden. Dat raakt drie bestanden
in plaats van één regel in `Overlay`. Erger: het maakt een regel die geen
gate afdwingt ("elke nieuwe overlay in een bar-scherm moet zich ook
omhoog melden"). Vergeet een volgende feature dat, dan keert de
stapelbug stil terug. Met de context telt een nieuwe overlay automatisch
mee.

**2. De DOM bevragen** (`document.querySelector('[role="dialog"]')` op elke
tick). Er verandert geen enkel ander bestand, maar het koppelt de melding
impliciet aan de markup van `Overlay`, werkt buiten React om, en ziet een
overlay die sluit pas bij de volgende tick (tot 30 seconden later).
Een `MutationObserver` lost dat laatste op, voor een probleem dat React-state
direct oplost.

**3. `Overlay` stapelbaar maken** (alleen de bovenste reageert op Escape,
achtergrond en Tab). Dat verwierp Bram al in de spec (besluit 7, optie B): het
onderbreekt een lopende betaling, en het is een grotere wijziging aan een
component met elf consumenten.

## Gevolgen

- Elke `Overlay` binnen een provider telt mee, ook overlays die later
  gebouwd worden. Er is niets om te onthouden.
- Een feature die ook "wacht tot de overlay dicht is" nodig heeft (een
  volgende automatische melding, of een toast die niet over een dialoog heen
  mag), hergebruikt `useOpenOverlayCount()`. Buiten bar-modus met een open
  dienst mount die feature zelf een `OverlayPresenceProvider` op het
  hoogste punt dat hij bestrijkt. Providers nesten is niet nodig en niet
  voorzien. Vraagt een feature daar ooit om, dan is dat een herziening van
  dit ADR.
- Een consument die zelf een `Overlay` rendert, telt zichzelf mee. Het
  patroon is dus "vastklikken": de teller bepaalt alleen of hij mag
  openen, niet of hij open blijft (spec → "Wachten op andere overlays").
- Geen gate. Het risico is een dialoog die buiten `Overlay` om gebouwd
  wordt, en dat is al een reviewfout. Wordt het in de praktijk een
  terugkerende fout, dan is een `check:policy`-regel "geen `role="dialog"`
  buiten `src/components/Overlay.tsx`" de logische volgende stap.

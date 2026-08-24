# Admin interface layout design

_Started 2026-08-03 12:34 UTC_

---

## User

moet de layout van de beheerkant - als je ALLEEN als beheerder bent ingelogd, niet hetzelfde zijn als de 'normale' voorkant van de bar? of moet dat er echt anders uit zien? ik doen dan voornamelijk op de navigatie aan de zijkant. Dit geld natuurlijk alleen voor de 'alleen beheer' situatie, als het een overlay is, dan moet het er natuurlijk anders uit zien - beoordeel dit op UX

## Assistant

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

Goede vraag — en het antwoord hangt af van wat "beheer" in die situatie betekent.

**Kernpunt: het probleem zit niet in "gelijk vs. verschillend", maar in overlay-chrome zonder onderliggende context.**

Nu triggert `beheerOpen` altijd hetzelfde: scrim + zwevend paneel + "×"-sluitknop, ongeacht of er een actieve bardienst achter zit. Dat klopt UX-technisch alleen als er iets is om naar terug te keren.

- **Tijdens een bardienst** (huidige overlay-aanpak): correct zo laten. De donkere 92px rail blijft de anchor, beheer opent als paneel-over-scrim met expliciete sluitknop — dat communiceert "je duikt even weg uit de bar, en komt zo terug."
- **Alleen ingelogd als beheerder, geen dienst actief**: dan is er niets om naar terug te sluiten. De overlay-taal (scrim, zwevend kaartje, "×") is dan misleidend — het paneel doet alsof het bovenop iets ligt, terwijl het de hele sessie is. Dat moet je oplossen door het frame te promoveren, niet door een tweede stijl te verzinnen:
  - de lichte 140px tabbalk (Aandacht/Logboek/Leden/Producten) wordt de **primaire sidebar**, full-height, geen aparte donkere 92px rail ernaast met alleen een Beheer-knop erin — dat is dubbelop.
  - geen scrim, geen shadow/rounded floating panel — gewoon volledig scherm zoals de bar-kant nu ook is.
  - "sluiten" wordt "uitloggen" of "dienst starten" — een actie die ergens naartoe leidt, niet "terug naar wat eronder lag" (want er lag niets onder).

**Visuele stijl (kleuren, typografie, kaarten, tab-styling) kan wél hetzelfde blijven** — dat is juist goed voor herkenbaarheid. Alleen het *frame* (rail+overlay vs. volwaardige sidebar) moet het gebruiksscenario volgen.

Wil je dat ik dit zo doorvoer — dus: bij geen actieve bardienst het beheerscherm full-screen met de tabbalk als primaire nav, in plaats van als overlay?

## User

doe maar

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: show_html]_

De full-screen beheer-modus (geen bardienst) is al geïmplementeerd zoals besproken: geen scrim, geen zwevend paneel/shadow, sluitknop wordt "uitloggen", en de donkere rail toont geen Verkoop/Dienst-items. Niets aan te passen — dit zit al in de code (`beheerOnly` state, `hasBarShift`, `overlayPanelStyle`).

_[tool: ready_for_verification]_

Geen wijzigingen nodig — de full-screen beheermodus (zonder overlay-chrome) was al correct geïmplementeerd.

## User

ga maar weer terug naar de topbbar voor de beheerder.

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Beheer-tabs staan nu horizontaal in een topbar boven de content, i.p.v. verticaal in de linker sidebar.

## User

terug naar de bar en timer mogen naar de topbar

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

"Terug naar de bar" met chevron staat nu links in de topbar (alleen zichtbaar als er een bardienst is), timer/badge en avatar rechts.

_[tool: ready_for_verification]_

Klaar.

## User

de avatar is alleen nodig als je als beheerder bent ingelogd - niet als je vanuit bar komt

## Assistant

_[tool: dc_html_str_replace]_

Avatar in de topbar toont nu alleen bij `beheerOnly` (ingelogd als beheerder), niet als je vanuit de bar naar beheer gaat.

_[tool: ready_for_verification]_

Klaar.


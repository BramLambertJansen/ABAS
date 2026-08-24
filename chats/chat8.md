# Producten beheerpagina aanpassen

_Started 2026-07-31 07:25 UTC_

---

## User

breng de 'producten' beheerpagina in lijn met de leden en de verkoop

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Producten volgt nu dezelfde opbouw als Leden: één toolbarrij (zoekveld 52px + segmented voorraadfilter), categoriechips eronder, en een kaart met uppercase-teller in de header rond de lijst.

## User

de 'toggle' naast zoekbalk mag de active state dichter tegen de rand aan zitten. voelt nu uit balans

## Assistant

_[tool: run_script]_

Padding van 4px naar 2px (en radius 13) op beide toggles naast de zoekbalk — de actieve pil zit nu strakker tegen de rand.

## User

Let op - de prijs beheren van een artikel wordt door een beheerder gedaan

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Now the three edits.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Prijs staat nu read-only in het rechterpaneel met een "product beheren"-knop eronder; die opent een BEHEERDER-popup (zelfde patroon als Lid beheren) waarin de prijs gewijzigd wordt, met sluiting en toast na opslaan.

## User

Maak dit iets mooier

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: ready_for_verification]_

Segmented toggles opgefrist: hogere pil (44px), zachtere radius, dubbele schaduw op de actieve state en een transitie bij wisselen — geldt overal waar de toggle terugkomt.

## User

de gallerij/lijst toggle mag weer naast de zoekbalk op verkoopscherm

## Assistant

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Galerij/lijst-toggle staat weer in de toolbarrij naast de zoekbalk op Verkoop, in dezelfde vorm als de filters op Leden en Producten; de titelrij is nu alleen de titel.

## User

Found issues — fixing…

## Assistant

_[tool: str_replace_edit]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Zoekveld heeft nu `min-width:260px` en de toolbarrijen mogen wrappen (Verkoop, Leden én Producten), zodat de voorraadfilter bij smalle vensters onder de zoekbalk valt in plaats van die samen te drukken.


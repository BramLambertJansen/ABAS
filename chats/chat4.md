# Snelle verbeteringen

_Started 2026-07-31 06:20 UTC_

---

## User

ga hier eens doorheen - kijk welke snelle mooie verbeteringen je zou doen

## Assistant

_[tool: read_file]_

Doorgelopen. Zes snelle winsten, in volgorde van impact:

1. **Dubbele ledenzoeker** — op Verkoop staat het zoekveld zowel in de hoofdkolom als in het rechterpaneel. Eén weghalen (de hoofdkolom) geeft direct rust en ruimte voor de producten.
2. **Dode tweak** — `showQuickPicks` staat in de props maar de quick-picks-rij zit niet in de template (de logica ervoor is er nog wel). Of terugzetten boven de categorieën, of prop schrappen.
3. **Dode nav** — "Transacties" en "Rapporten" doen niets en zien er even actief uit als de rest. Dimmen + label "binnenkort", of eruit.
4. **Subtotaal = Totaal** in het paneel én in de modal, twee identieke regels. Subtotaal weg, of pas laten zien als er echt iets afwijkt.
5. **Onvoldoende saldo is een dead end** — waarschuwing zonder uitweg. Knop "saldo opwaarderen" in die gele balk en in de modal.
6. **Toetsenbord** — Esc sluit modals, Enter rekent af, cijfers op de pincode. Kost weinig, voelt meteen als echte kassa.

Kleiner: modaltitel "Weet je het zeker?" → "Afrekenen bij {naam}"; toast staat op `right:410px` hardcoded (breekt als het paneel wijzigt); ledendropdown sluit niet bij klik buiten.

Zeg welke je wil, dan bouw ik ze — 1, 4, 5 en 6 zijn samen een kwartiertje.

## User

ga je gang

## Assistant

I'll apply 1, 3, 4, 5, 6 plus the smaller fixes, and put the quick-picks row back (2).

_[tool: dc_html_str_replace]_

Now the nav, subtotal rows, insufficient-funds CTAs, modal title and toast.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the logic: keyboard handling, outside-click for the dropdown, shortfall/balance-after values, and quick-row wiring.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

The dropdown outside-click needs the `data-member-search` marker on the remaining (right-panel) search wrapper.

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Doorgevoerd: dubbele ledenzoeker weg (alleen nog rechts, sluit nu op klik buiten of Esc), snel-tikken-rij terug boven de categorieën en gekoppeld aan de bestaande `showQuickPicks`-tweak, dode nav gedimd met "binnenkort", dubbele subtotaalregel vervangen door "saldo na afrekenen", tekort-melding met directe opwaardeerknop (paneel én modal), modaltitel met ledennaam, toast links vastgezet.

Toetsenbord: Esc sluit modals/dropdown, Enter rekent af (en bevestigt in de modal), cijfers en backspace werken op de pincode.

## User

ik vind de scrollarea voor de daadwerkelijke producten nu heel krap. zou je de 'snel tikken' weghalen en dat stuk laten staan onder favorieten? of zie je de toegevoegde waarde hiervan wel en moeten we de 'producten' header vervangen voor de zoekbalk? hoe pakken we dit op?

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: run_script]_

Nu de quick-picks-tweak omzetten naar "start op Favorieten", zodat de snelheidswinst blijft zonder de extra rij.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_set_props]_

_[tool: ready_for_verification]_

Aanpak: beide, want ze losten hetzelfde probleem dubbel op.

- "Snel tikken" is weg — het was een tweede versie van Favorieten. In plaats daarvan opent Verkoop nu standaard op het tabje **Favorieten**, dus dezelfde zes producten staan direct groot in het raster (nieuwe tweak "start op favorieten" vervangt de oude quick-picks-schakelaar).
- De "Producten"-koptekst is vervangen door de zoekbalk op die regel, met galerij/lijst ernaast. Balk iets lager (50px).

Dat geeft samen ongeveer 150px terug aan scrollruimte — het raster begint nu direct onder de categoriechips.


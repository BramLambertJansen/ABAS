# Dropdown design verbetering

_Started 2026-08-10 06:20 UTC_

---

## User

je mag de dropdown wel iets mooier maken!

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

Custom dropdown in plaats van de native select:

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

De native select is vervangen door een eigen dropdown: trigger met roterende chevron en oranje focusring, en een zwevend paneel met afgeronde rijen, hover-tint en een oranje vinkje bij de gekozen activiteit.

## User

beter maar de 'chevron' is nog niet heel mooi

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Chevron is nu een nette CSS-pijl (border-based) die 180° draait bij openen, in plaats van het tekstglyph.


# Contanten nooit gebruikt

_Started 2026-08-07 07:27 UTC_

---

## User

Er wordt nooit wat met contanten gedaan. Alles is OF op saldo OF wordt gepint. Wat moeten we aanpassen?

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

All template edits applied. Now the JS logic edits.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: grep]_

_[tool: read_file]_

Now I have the exact block to remove. Note `cashTopups`/`cashRevenue`/`cashDrawer`/`cashAdjustments` here are stale references (renamed to pinTopups/pinRevenue earlier), which is exactly why this leftover block needs deleting.

_[tool: dc_js_str_replace]_

Now let me verify nothing's left over and check the app renders correctly.

_[tool: grep]_

_[tool: grep]_

Unused in template (dead prop). Fix both remaining refs.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

All cash/contant references are now removed or converted to pin. Let me verify the app loads cleanly.

_[tool: ready_for_verification]_

Contant is overal vervangen door pin: afrekenen zonder lid heet nu "pin afrekenen" (geen wisselgeld/ontvangen-bedrag meer), opwaarderen kan met pin/Tikkie/bank, en de kas-tel/kasla-functionaliteit (startgeld, coupures tellen, kasverschil, kas aanpassen) is helemaal weg — dienst afsluiten toont nu direct de omzet-samenvatting. Wacht nog op de achtergrondcontrole.


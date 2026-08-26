# Activiteitstypes bewerken

_Started 2026-08-07 12:26 UTC_

---

## User

activiteitstypes moeten ook kunnen worden bewerkt.

## Assistant

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now navigate to settings screen and verify.

_[tool: ready_for_verification]_

Activiteitstypes zijn nu ook te bewerken: "bewerken" naast elk type opent een inline invoerveld met opslaan/annuleren.

## User

Je mag er buttons met iconen van maken hoor

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now update the JS row mapping to drop old `statusLabel`/`statusStyle` and add `archived`/`notArchived`.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Bewerken en archiveren/herstellen zijn nu iconknoppen (potlood, archiefdoos, vinkje/kruis bij opslaan).

## User

Check didn’t complete

## Assistant

_[tool: ready_for_verification]_

Retried verification.

## User

Check didn’t complete

## Assistant

_[tool: ready_for_verification]_

Retried again.

## User

'danger' kleur

## Assistant

_[tool: grep]_

Update the archive icon button to the danger palette (#c2410c stroke, #fff2ec background).

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Archiveer-knop staat nu in de bestaande danger-kleur (#c2410c / #fff2ec).


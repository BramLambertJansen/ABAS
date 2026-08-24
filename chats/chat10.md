# Mobiele telefoon weergave LID

_Started 2026-07-31 12:17 UTC_

---

## User

oke we zoeken nu nog naar een telefoon weergave - op de telefoon kan een gebruiker alleen maar het LID gedeelte zien - dus saldo, transacties, en instellingen voor het account (pincode zetten, wachtwoord wijzigen, naam wijzigen). Je kan er alvast een stub inzetten voor het zelf opwaarderen - maar dit gaan we nog doen.

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Telefoonweergave staat in **Lid App - Mobiel.dc.html**: login, saldo (donkere saldokaart + lage-saldo waarschuwing), transacties met filters en maandgroepen, en account (naam wijzigen, wachtwoord wijzigen, pincode instellen via keypad, meldingen, uitloggen). Opwaarderen is een stub-sheet met uitleg. Tweaks: accentkleur, demo-laag-saldo, saldogrens.


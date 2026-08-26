# Bar inlogmethodes wisselen

_Started 2026-08-04 07:36 UTC_

---

## User

voor de bar inlog wil ik ook de optie om inlog methodes te kunnen wisselen

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the logic.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: grep]_

No flow picker there — done.

_[tool: ready_for_verification]_

Bar-inlog heeft nu een methodeschakelaar boven het scherm: **Pincode** (tegels + keypad, ongewijzigd), **Wachtwoord** (voornaam@aurora.nl + `aurora`) en **Maillink** (eenmalige noodingang met verstuurd/openen-staat). De schakelaar verdwijnt zodra iemand een pincode intikt; alle methodes komen op dezelfde manier binnen — bardienst → verkoop, beheerder-zonder-barrechten → beheer.

## User

hmm, ik vind het allemaal een beetje druk, denk eens na over de beste UX hier

## Assistant

Je hebt gelijk — drie gelijkwaardige tabs maken de 99%-route (persoon + pincode) rommeliger voor twee uitzonderingen. Ik zet het om naar progressive disclosure: pincode is het scherm, alternatieven zitten achter één stille link precies op het moment dat je ze nodig hebt.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Tabs eruit. Nu:

- **Standaard blijft één route:** naam aantikken → pincode. Geen keuze vooraf, dus geen extra ruis op het scherm dat je 99% van de tijd ziet.
- **Alternatieven staan waar de behoefte ontstaat:** "Staat je naam er niet bij?" onder de tegels, "pincode vergeten?" naast de keypad (licht oranje na een foute code).
- Beide openen hetzelfde kleine venster met twee expliciet uitgelegde uitzonderingen — wachtwoord of maillink — met "← terug naar pincode" als uitgang.

## User

kunnen we er 3 naast elkaar doen?

## User

kunnen we er drie naast elkaar doen?

## User

kunnen we er drie naast elkaar doen?

## Assistant

The staff tile grid — 2 columns → 3.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Drie tegels per rij; loginkaart naar 500px en tegelpadding iets krapper zodat namen als "Femke Bos" niet klemmen (langere namen wrappen nu netjes op twee regels).


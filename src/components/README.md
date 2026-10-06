# components/

Shared, reusable UI building blocks. Search here before writing a new one —
see CLAUDE.md → "Componenten zijn herbruikbaar totdat bewezen anders."

## Beheerlijsten en -formulieren

- `ZoekVeld`: zoekveld met loep-icoon en sr-only label (`id`, `label`,
  `waarde`, `onChange`, `placeholder`). Gebruikt door `LedenLijst` en
  `ProductenLijst`; de andere zoekvelden (Logboek, Transactielijst,
  verkoopzoeker, LidZoeker, Bezetting) zijn eigen varianten.
- `StatusFilter`: statuschips met tellers (`opties` met `id`, `label`,
  `aantal`, `actief`, `onKies`; `ariaLabel`). De aanroeper houdt waarde en
  tellers bij.
- `Overlay`: prop `variant="detail"` voor een groot formulier (modal: breder,
  vaste kop met titel, beschrijving, `meta` en Sluiten, scrollend lichaam; in
  sheet-vorm alleen de vaste kop). Bij `detail` rendert de aanroeper zelf geen
  Sluiten-knop. `meta` (alleen `detail`) is vaste context onder de titel.
- `OpslaanSectie`: optioneel `label` (maakt de sectie een `role="group"`),
  `kop`, `status` (`SectieStatus` uit `src/lib/opslaan.ts`: `"onopgeslagen"`,
  `"opgeslagen"`, `null`; `undefined` = geen statusregel) en `statusTekst`
  voor een specifiekere tekst bij "opgeslagen".

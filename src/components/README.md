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
  sheet-vorm alleen de detail-kop, die daar niet vast is maar meescrolt). Bij `detail` rendert de aanroeper zelf geen
  Sluiten-knop. `meta` (alleen `detail`) is vaste context onder de titel.
- `OpslaanSectie`: optioneel `label` (maakt de sectie een `role="group"`),
  `kop`, `status` (`SectieStatus` uit `src/lib/opslaan.ts`: `"onopgeslagen"`,
  `"opgeslagen"`, `null`; `undefined` = geen statusregel) en `statusTekst`
  voor een specifiekere tekst bij "opgeslagen".

## Knopstijlen en woordenlijst

`knopStijlen.ts` bevat platte Tailwind-klasseconstanten (geen component):
`KNOP_ACCENT_WIT` (wit op `accent-active`, hover/ingedrukt `accent-pressed`),
`KNOP_ACCENT_DONKER` (`text-rail` op `accent`, hover `accent-hover`),
`KNOP_RAND` (witte knop met rand: Sluiten, Annuleren) en `KNOP_DIALOOG_MAAT`
(`h-[50px] rounded-2xl`, de enige tweede controlmaat naast `h-11
rounded-control`). Maat en schaduw blijven bij de aanroeper. Wit op `accent`
of `accent-hover` is verboden (3,43 en 2,95:1); `test/accentContrast.test.ts`
scant alle klasse-literals en faalt erop.

Woordenlijst voor knop- en dialoogteksten:

- **Sluiten**: een weergave of dialoog sluiten zonder iets af te breken of te
  bevestigen (de Sluiten-knop van `Overlay`).
- **Annuleren**: een lopende handeling of invoer afbreken (niet "Annuleer").
- **Klaar**: alleen een bewerkscherm waarvan de wijzigingen al live zijn
  opgeslagen afronden (nu `BezettingOverlay`).
- **Terug**: alleen navigeren, of de "weggooien?"-vraag verlaten.
- **Contant**: betaalmethode in de UI (`methodLabel`); "cash" nooit op het
  scherm.
- **Uitnodiging**: nooit "Invite" in UI-tekst.

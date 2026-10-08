# TekstVeld op rail: contrast van hint en fout

Status: **goedgekeurd**

Gevonden bij het bouwen van `/design/systeem`: `TekstVeld` met `tone="rail"`
kleurt de hint en de fout niet mee met de tone. De hint staat in `text-muted`,
de fout (via `VeldFout`) in `text-danger`. Op de donkere rail halen die
kleuren WCAG AA (4,5:1) niet. Daarom toont `voorbeelden.tsx` hint en fout nu
alleen op licht (commentaar in `TekstVeldReeks`).

## Doel

Hint, fout en placeholder van een rail-veld halen AA op elke ondergrond
waarop een rail-veld staat. Daarvoor zijn **bestaande** tokens genoeg; er is
geen tokenwijziging nodig. Een test bewaakt de paren per tone, ook de
placeholder (die krijgt op beide tones een vaste klasse). `/design/systeem`
toont hint, fout en placeholder ook op rail, en krijgt een eigen sectie
`veld-fout-rail` voor `VeldFout tone="rail"`.

## Besluiten (Bram, 2026-10-08)

1. **Placeholder vastzetten: ja.** `tekstVeldKlassen` krijgt een rol
   `placeholder`: `placeholder:text-rail-muted` op rail en
   `placeholder:text-muted` op licht, net als `Select` (rail-muted) en
   `ZoekVeld` (`placeholder:text-muted`). De placeholderparen staan in de
   contrasttest en het rust-veld toont een placeholder in zowel het licht-
   als het railvoorbeeld.
2. **Eigen sectie `veld-fout-rail`: ja.** `/design/systeem` toont
   `VeldFout tone="rail"` los, stil en als alert, met één extra baseline.

### Contrast, exact nagerekend

De formule is dezelfde als in `test/accentContrast.test.ts` (`luminance`/`contrast`,
WCAG 2.x). De hint is `text-xs` (12px), de fout is 12px vet en de
placeholder is `text-sm` (14px) halfvet. Alles is kleine tekst, dus de
drempel is 4,5:1.

Een rail-veld staat op `rail` (#16181c: `/design/systeem`, rail-schermen) of
op `surface-rail` (#1e2127: het formulierkaartje in `BeheerLogin`). Het
zwakste paar telt.

| Rol | Klasse nu | op `rail` | op `surface-rail` | Klasse nieuw | op `rail` | op `surface-rail` |
|---|---|---|---|---|---|---|
| hint | `text-muted` (#736d66) | 3,48 ✗ | 3,16 ✗ | `text-rail-muted` (#8c8f96) | **5,49** | **4,98** |
| fout | `text-danger` (#c2410c) | 3,43 ✗ | 3,11 ✗ | `text-rail-error` (#ff7c4a) | **6,97** | **6,32** |
| placeholder | geen klasse (preflight: 50% `currentcolor`, ≈ #8b8c8e, onbewaakt) | ≈5,3 | ≈5,05 | `placeholder:text-rail-muted` (#8c8f96) | **5,49** | **4,98** |
| label (ongewijzigd) | `text-rail-muted` | 5,49 | 4,98 | — | | |
| prefix (ongewijzigd, `aria-hidden`) | `text-rail-muted` | 5,49 | 4,98 | — | | |

Op licht veranderen hint en fout niet; de placeholder krijgt een vaste
klasse. Die waarden komen ook in de test:

| Rol | Klasse | op `surface` (#fff) | op `canvas` (#faf7f3) |
|---|---|---|---|
| hint | `text-muted` | 5,11 | 4,79 |
| fout | `text-danger` | 5,18 | 4,85 |
| placeholder | `placeholder:text-muted` (nieuw; was preflight) | 5,11 | 4,79 |

Nagerekend met dezelfde formule: `rail-muted` op `rail` 5,4882, op
`surface-rail` 4,9802; `muted` op `surface` 5,1116, op `canvas` 4,7863. De
placeholder staat feitelijk op de achtergrond van het invoerveld zelf
(`bg-rail` op rail, `bg-surface` op licht). Die vlakken horen bij de
toegestane ondergronden. De test controleert de placeholder toch op beide
ondergronden per tone, net als de andere rollen. Zo blijft één lus genoeg.

Waarom deze tokens: dezelfde rollen gebruiken op de rail al `rail-muted` en
`rail-error`. Uitleg onder een veld staat in `BeheerLogin` als `text-xs
text-rail-muted`, en meldingen staan in `BarInloggen`, `ActiviteitKeuze`,
`PinToetsenbord` en `LeesFout` als `text-rail-error`. Volgens
`src/app/globals.css` is `rail-muted` bedoeld voor body- en labeltekst van
12–13px.

Grens: `rail-muted` haalt op `rail-hover` 4,68 en op `rail-border` maar 4,14.
Een rail-veld staat niet op die vlakken. De test legt de toegestane
ondergronden vast (`rail`, `surface-rail`). Wil een volgende feature een
rail-veld op een ander vlak zetten, dan moet dat vlak eerst in de test.

## Betrokken shell(s)

Beide via het gedeelde component. In productie gebruikt vandaag **geen**
rail-`TekstVeld` een `hint` of een `fout`. `BeheerLogin` en `BarInloggen`
tonen hun fout in een eigen `<p className="… text-rail-error">`. Er verandert
dus geen productiescherm, alleen `/design/systeem`. De fix voorkomt dat het
eerste rail-veld met hint of fout onder AA zakt.

## Datamodel

n.v.t. — alleen opmaak.

## RPC's

n.v.t. — geen data- of geldpad.

## Rolzichtbaarheid

n.v.t. — opmaak, voor elke rol gelijk.

## Hergebruik & UX-patronen

- **Componenten uit de catalogus:** `TekstVeld` en `VeldFout`
  (`src/components/TekstVeld.tsx`). Er komt geen nieuw component.
- **Klassentabel (nieuw bestand, geen component):**
  `src/components/tekstVeldKlassen.ts`, naar het patroon van `knopKlassen.ts`
  en `toetsKlassen.ts`. Zo kan de test de klassen importeren zonder renderer.
  Het bestand exporteert `tekstVeldKlassen(tone: "rail" | "light")`. Die
  geeft `{ label, input, hint, fout, prefix, placeholder }` terug: de huidige
  `TONES`-tabel uit `TekstVeld.tsx` plus `hint`, `fout`, `prefix` en
  `placeholder`. Klassen per staat:

  | Staat | `rail` | `light` |
  |---|---|---|
  | label | `text-xs font-bold text-rail-muted` (ongewijzigd) | `text-xs font-bold text-muted` (ongewijzigd) |
  | hint | `text-xs font-semibold text-rail-muted` | `text-xs font-semibold text-muted` (ongewijzigd) |
  | fout | `text-xs font-bold text-rail-error` | `text-xs font-bold text-danger` (ongewijzigd) |
  | prefix | `text-sm font-bold text-rail-muted` (ongewijzigd) | `text-sm font-bold text-muted` (ongewijzigd) |
  | placeholder | `placeholder:text-rail-muted` (nieuw) | `placeholder:text-muted` (nieuw) |
  | uitgeschakeld | ongewijzigd: geen eigen klasse. WCAG 1.4.3 zondert uitgeschakelde componenten uit. | ongewijzigd |

  `placeholder` komt op **elk** `<input>` van `TekstVeld`: de standaardtak
  (`input`), de tak met `maat` en de tak met `prefix`. Die laatste twee
  bouwen hun klassen nu inline; ze voegen `tekstVeldKlassen(tone).placeholder`
  toe. `input` zelf blijft zonder placeholderklasse, zodat elke tak het op
  dezelfde manier toevoegt.
- **`VeldFout`** krijgt een optionele prop `tone?: "light" | "rail"`, met
  standaard `"light"`. Alle huidige losse aanroepers (`NieuwLidOverlay`,
  `LidBeherenOverlay`, `NieuwProductOverlay`, `ProductBeherenOverlay`,
  `OpwaarderenOverlay`, `NegatieveLimietInstellingen`) staan op licht en
  blijven dus ongewijzigd. `TekstVeld` geeft zijn eigen `tone` door aan
  `VeldFout`. `role="alert"`, de remount via `key` en het id-patroon blijven
  zoals ze zijn.
- **Staten per scherm:** laden, leeg, pending, succes en verouderd zijn
  n.v.t. (het is een veld zonder data). Hint: altijd zichtbaar als die is
  meegegeven. Fout: zichtbaar zodra de aanroeper `fout` zet. Wanneer dat
  gebeurt, blijft de keuze van de aanroeper
  (docs/features/invoerfeedback-zoeken-filters.md).
- **Copy:** geen nieuwe UI-tekst in de app. In `/design/systeem`
  (`src/app/design/systeem/teksten.ts`, `VOORBEELD_TEKSTEN.TekstVeld`):
  - `uitleg` wordt letterlijk: `tone="light" in rust (met hint en placeholder), gevuld, met fout en uitgeschakeld.`
  - `rail.uitleg` wordt letterlijk: `tone="rail" in rust (met hint en placeholder), gevuld, met fout en uitgeschakeld.`
  - Nieuwe sleutel `placeholder`, letterlijk: `Voor- en achternaam`.
  - De hint (`Zoals op de ledenlijst.`), de foutmelding (`Vul een naam in.`)
    en de placeholder zijn op rail dezelfde teksten als op licht.

  In `VOORBEELD_TEKSTEN.VeldFout` komt één nieuwe sleutel, letterlijk:
  `rail: { titel: "VeldFout op rail", uitleg: "tone=\"rail\": stil en als alert." }`.
  De groepstitels (`stil`, `alert`) en `tekst` (`Vul een naam in.`) worden
  hergebruikt; daar komt geen nieuwe tekst bij.
- **Voorbeelden** (`src/app/design/systeem/voorbeelden.tsx`, sectie
  `tekst-veld-rail`): in `TekstVeldReeks` vervallen de `licht`-conditie en
  het commentaar "Hint en fout zijn alleen op licht getoond … Zie het
  rapport". Op rail tonen we dan dezelfde vier velden als op licht: rust met
  hint, gevuld, met fout, en uitgeschakeld. Het rust-veld krijgt op **beide**
  tones `placeholder={T.placeholder}` (het is leeg, dus de placeholder is
  zichtbaar); de andere velden niet. De ids blijven
  `systeem-tekstveld-<tone>-<staat>`.
- **Sectie `veld-fout-rail`** (`voorbeelden.tsx`, `VeldFoutVoorbeeld`): de
  bestaande lichte sectie blijft. Daaronder komt een tweede
  `<Sectie naam="VeldFout" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>`.
  `Sectie` maakt daar zelf het id `veld-fout-rail` van (`VeldFout` staat niet
  in `RAIL_ALLEEN`). Inhoud, zoals de lichte sectie: één `Rij` met twee
  `Groep`en, `T.stil` met `<VeldFout id="systeem-veldfout-rail-stil" tone="rail" tekst={T.tekst} />`
  en `T.alert` met `<VeldFout id="systeem-veldfout-rail-alert" tone="rail" tekst={T.tekst} alert />`.
  Er is geen nieuwe registratie in `VOORBEELDEN` nodig, net als bij
  `TekstVeldVoorbeeld`, dat ook twee secties teruggeeft.
- **Toon en shell:** de bestaande `tone`-prop. Er wordt geen `useShell()`
  gelezen.
- **Toegankelijkheid:** ongewijzigd. Hint en fout blijven via
  `aria-describedby` gekoppeld, `aria-invalid` volgt `fout`, en `foutAlert`
  geeft `role="alert"`.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `TekstVeld` zonder `tone` (standaard `rail`) met `hint` of `fout` | rail-klassen: `text-rail-muted` en `text-rail-error` |
| Losse `VeldFout` zonder `tone` | `text-danger`, zoals nu |
| Losse `VeldFout tone="rail"` | `text-rail-error` |
| `TekstVeld` met `placeholder` (elke tak: standaard, `maat`, `prefix`) | `placeholder:text-rail-muted` op rail, `placeholder:text-muted` op licht |
| `TekstVeld` zonder `placeholder` | klasse staat er wel, heeft geen effect |
| Rail-veld op een andere ondergrond dan `rail` of `surface-rail` | niet gegarandeerd. Eerst de ondergrond aan de test toevoegen. |

## Tests

**Tester** (nieuwe `test(...)`-blokken in `test/accentContrast.test.ts`). Die
hergebruiken `palette`, `contrast` en `AA` uit dat bestand. Er verandert geen
bestaande test, dus het label `gate-wijziging` is niet nodig.

1. **Contrastpaar per tone.** Voor `tekstVeldKlassen("rail")`: haal per rol
   (`label`, `hint`, `fout`, `prefix`, `placeholder`) het token uit de
   klassenstring: `text-<token>`, voor `placeholder` `placeholder:text-<token>`.
   Elk token haalt ≥ 4,5:1 op `rail` én `surface-rail`. Voor
   `tekstVeldKlassen("light")` geldt hetzelfde op `surface` én `canvas`.
   Verwachte waarden staan in de tabellen onder "Contrast, exact
   nagerekend"; het zwakste paar is `muted` op `canvas` (4,79). Een melding
   noemt rol, token, ondergrond en de waarde op twee decimalen. Een rol
   zonder herkenbaar token is een fout, geen overgeslagen rol.
2. **Negatieve bewaking** (zoals het `#d94d1a`-testje): `muted` en `danger`
   op `rail` blijven onder 4,5:1. Zo vangt de test een terugval naar de oude
   klassen.
3. **Binding aan het component:** `tekstVeldKlassen("rail").hint` bevat
   `text-rail-muted`, `.fout` bevat `text-rail-error` en `.placeholder` is
   `placeholder:text-rail-muted`; op licht is `.placeholder`
   `placeholder:text-muted`. Een bronscan bevestigt dat `TekstVeld.tsx` geen
   kale `text-muted`/`text-danger` meer heeft voor hint of fout, dat
   `VeldFout` `tekstVeldKlassen(tone).fout` gebruikt, en dat
   `tekstVeldKlassen(tone).placeholder` vaker voorkomt dan alleen in de
   standaardtak (de takken `maat` en `prefix` gebruiken het ook).

**Bestaande e2e:** `e2e/systeem.spec.ts` doet een axe-scan van de hele
`/design/systeem`-pagina. Met hint en fout op rail, de placeholders en de
sectie `veld-fout-rail` controleert axe die paren dan ook in de browser. De
screenshot-, focus- en uniciteitstests lopen generiek over alle
`[data-systeem]`-secties en pakken `veld-fout-rail` vanzelf op. Er is geen
nieuwe e2e nodig.

**Screenshots** (in `e2e/systeem.spec.ts-snapshots/`):

| Baseline | Gevolg | Waarom |
|---|---|---|
| `tekst-veld-rail-linux.png` | verandert | hint, foutveld, placeholder in het rust-veld, nieuwe uitleg |
| `tekst-veld-rail-focus-linux.png` | verandert | idem; de focus valt op het lege rust-veld, de placeholder blijft zichtbaar |
| `tekst-veld-linux.png` | verandert | placeholder in het rust-veld, nieuwe uitleg |
| `tekst-veld-focus-linux.png` | verandert | idem, focus op het rust-veld |
| `veld-fout-rail-linux.png` | **nieuw** | sectie `veld-fout-rail` |
| `veld-fout-linux.png` | gelijk | lichte sectie ongewijzigd |
| alle andere | gelijk | |

Een diff in een baseline met "gelijk" is een fout. `veld-fout-rail` krijgt
geen hover- of focusbaseline: de sectie heeft geen knop en geen focusbaar
element (net als `veld-fout`). De baselines komen uit de workflow
`screenshots-bijwerken`: zet het label `screenshots-bijwerken` op de PR en
beoordeel daarna de PNG's in de PR-diff. Niemand maakt PNG's lokaal.

### Wie schrijft wat

| Rol | Bestanden |
|---|---|
| Developer | `src/components/tekstVeldKlassen.ts` (nieuw), `src/components/TekstVeld.tsx` (`TekstVeld` en `VeldFout`), `src/app/design/systeem/voorbeelden.tsx`, `src/app/design/systeem/teksten.ts` |
| Tester | `test/accentContrast.test.ts` (alleen nieuwe testblokken) |
| Docs | `src/components/README.md`: `tekstVeldKlassen` in de rij "Gewone invoer" en `tone` bij `VeldFout` vermelden; de vaste placeholderklasse van `TekstVeld` noemen. Dit moet in **dezelfde commit** als het nieuwe bestand, anders faalt `check:docs` ("elk component een README-rij") in de pre-commit. |
| Hoofdsessie | Niets aan gates. Na de push het label `screenshots-bijwerken` zetten of Bram vragen dat te doen. |

## Expliciet buiten scope

- **`ZoekVeld`**: heeft geen rail-tone (alleen `bg-surface`). Geen gat.
- **`Select`**: placeholder `text-rail-muted` op `surface-rail` haalt 4,98.
  `invalid` is alleen een rand `border-rail-error` (6,32, ruim boven 3:1 voor
  een UI-component, WCAG 1.4.11). Er is geen hint- of fouttekst. Geen gat.
- **`PinToetsenbord`** / **`CodeInvoer`**: de rail-fout gebruikt al
  `text-rail-error` (6,97 op `rail`, 6,32 op `surface-rail`). Geen gat.
- **`LeesFout`**: rail gebruikt al `text-rail-error`. Geen gat.
- **`NieuwWachtwoordVelden`**, **`LidZoeker`**: alleen licht. Geen gat.
- De eigen fout-`<p>`'s in `BeheerLogin`/`BarInloggen` omzetten naar
  `VeldFout tone="rail"`. Ze halen AA al. Dat is een hergebruikvraag voor
  een latere opruiming, geen contrastfix.
- Tokenwijzigingen: niet nodig.

# ABAS — frontendreview: componenten, tokens, interacties en schermen

**Datum:** 6 oktober 2026. **Scope:** punt 1 (bouwblokken en stylingtokens), punt 2 (interactiepatronen) en punt 3 (schermen, responsive gedrag en toegankelijkheid). Alle drie reviewstappen zijn afgerond op de hieronder vastgelegde bronbaseline en staan in ditzelfde rapport: 15 bevindingen en 41 screenshots. De aangevraagde opvolging is nu in een aparte checkout geïmplementeerd; stand, bewijs en resterende verificatie staan in de uitvoeringssectie hieronder. De schermreview is een afgebakende controle van representatieve schermen en toestanden; bewijsgrenzen en resterende apparaat-/schermlezercontroles staan hieronder.

ABAS heeft een bruikbare gedeelde componentlaag. Vooral dialogen, tabs, avatars, leesfouten en opslagfeedback worden aantoonbaar hergebruikt. De basiscontrols zijn minder consequent gedeeld: gewone velden en knoppen hebben nog verschillende lokale implementaties. Kleuren zijn grotendeels centraal geregeld; typografie, controlmaten, schaduwen en enkele decoratieve kleuren zijn gedeeltelijk lokaal vastgelegd.

## Uitvoering — 6 oktober 2026

**Publicatie van beeldbewijs:** de 51 screenshots zijn lokaal vastgelegd en visueel
gecontroleerd, maar worden nog niet naar GitHub gepubliceerd. De automatische
goedkeuringscontrole vereist expliciete toestemming voor die afbeeldingen. De
JSON-captures, metingen, testlogs en bronhashes zijn wel onderdeel van deze PR.
Afbeeldingsnamen hieronder verwijzen voorlopig naar de lokale auditmap.

De analyse, inventaristellingen en oorspronkelijke 41 screenshots hieronder
beschrijven de **reviewbaseline**, niet de nieuwe code. De fixes staan op branch
`codex/frontend-review-fixes`, gebaseerd op main `62ca126b…`, in de lokale
checkout `.worktrees/frontend-review-fixes` vanuit de projectroot. Bestaande lokale
appwijzigingen zijn behouden. Deze uitvoeringssectie legt de lokale controle vóór
publicatie vast. Commit, PR, volledige CI-verificatie en merge worden vastgelegd
in GitHub bij deze branch; een productiedeployment is een afzonderlijke releasestap.

| Bevinding | Uitgevoerde opvolging |
|---|---|
| C01 | TekstVeld heeft expliciete id/ref, begrensde maten, verborgen label en prefix; identieke login-/wachtwoord-/beheer-/bedragvelden gemigreerd. Parsing, guards en zoek-/comboboxrollen blijven bij hun eigenaar. |
| C02 | Passende knopconstanten consequent toegepast, inclusief aria-disabled-presentatie en dialoogmaat. Bestaande handlerguards behouden. |
| C03 | SVG-kleuren via currentColor, ontbrekende railkleuren centraal, gradient en terugkerende schaduwen in Tailwind. Huidige kleurwaarden behouden. |
| C04 | Gedocumenteerde typografie- en surfacerollen; herhaalde overeenkomende tekst-/schaduwwaarden gemigreerd. Bestaande controlmaten en legacyuitzonderingen expliciet; volledige schaalreductie blijft een aparte visuele ontwerpstap. |
| C05 | StartScherm over vijf donkere startschermen; ZoekIcoon bij drie zoekpresentaties. Eén main-landmark, eigen featuregedrag behouden. |
| C06 | Complete component-/patrooncatalogus, voorbeelden en actuele consumentcomments. T06-historie onderscheiden van huidig financieel/sluitcontract. |
| U01 | Bevestigde prijsopslag reset validatie; volgende lege poging valideert opnieuw. Fout behoudt invoer. |
| U02 | Gekoppelde naamfeedback bij portal, nieuw lid en lidbeheer; geen fout bij openen, wel bij blur/poging, focus naar eerste ongeldige veld. |
| U03 | Account gebruikt LeesFout/useLeesHerstel: focus tijdens laden/fout behouden, bij succes naar Accountkop; geen dubbele retry. |
| U04 | Productsecties tonen wijzigings-/successtatus voor prijs, afbeelding en assortimentstatus. Nieuwe invoer wist oud succes. |
| U05 | Eén expliciet financieel herstelpatroon binnen dialoog én na herladen, met oorspronkelijke context/UUID/payload. Receipt verwerkt via normale succescallback; annulering draait geen boeking terug. UI en pure guards getest; echte databaseproef blijft vóór merge nodig. |
| U06 | Bram koos **alle sluitacties vragen bevestiging bij onopgeslagen wijzigingen**. OverlaySluitKnop, detailheader en SheetKnoppen gebruiken dezelfde controller in alle zeven bestaande formulieren. Terug bewaart invoer/focus; Weggooien sluit; ongewijzigd sluit direct en pending wint. |
| R01 | Portalheader, tabs, filters en refreshcontrols wrappen; bedragen en transactietekst overlappen niet bij 320/390/1280 en 32px-basisletters. Voorheen overgeslagen vergrotingsproef weer actief. |
| R02 | Gewone lidselectie focust gekozen naam; volgende Tab bereikt opwaarderen. Ook wissel herstelt focus naar de zoeker. |
| R03 | Onder 700 CSS-px stapelt de kassa; producten/mandje via scroll bereikbaar, inclusief clipping- en hit-testcontrole bij 512×384. Draft/lid blijven behouden bij tabwissel. |

Bij de visuele eindcontrole bleek ook dat lange standaarddialogen hun controls
konden platdrukken. Hun inhoud scrollt nu met behoud van de knophoogte. De
sluitproeven bewaken zichtbaarheid, hit testing en minimaal 44px voor de betrokken
Sluiten/Annuleren/Terug/Weggooien-knoppen.

**Verificatie:** `check:fast` geslaagd (805 unitcontroles plus lint, typecheck,
architectuur, policy, RLS-, migratie- en ADR-gates); productiebuild geslaagd met
fictieve Supabase-configuratie. **215 browsertests in 14 suites geslaagd**, waarvan
27 nieuwe reviewregressies; nul overgeslagen, onverwachte of flaky gevallen.
Tien nieuwe captures visueel bekeken; nul axe-overtredingen of pageerrors in die
captures. [Logs, testgevallen, screenshots en bronhashes](execution-evidence/README.md)
staan naast het historische bewijs. Reactcontrole: directe imports, hooks op vaste
plaatsen, effecten met opruiming, guards bij callbacks, stabiele focus-/statusdoelen;
geen nieuwe dependency of server/client-grenswijziging.

**Nog te verifiëren vóór merge:** volledige `check:all`, waaronder de financiële
receipt-/annuleringsproef en live a11y tegen een geïsoleerde seeded Supabase-stack.
Docker en psql zijn in deze WSL-omgeving niet beschikbaar; de lokale Supabase-API
op 127.0.0.1:54321 geeft connection refused. De bestaande ABAS-Supabase
is productie en is niet gebruikt voor tests. Er is geen SQL-, receiptbeleid-,
startsaldohistorie- of externe omgevingswijziging gedaan. Ook fysieke apparaten,
schermlezers, echte 200/400%-browserzoom en een schermtoetsenbord blijven handmatige
controles. De automatische controles zijn geen volledige WCAG-certificering.

**Optioneel ontwerpvervolg:** alle oude tekstmaten/radii/controlmaten terugbrengen
naar een kleinere schaal. De tokenextractie bewaart bewust de huidige waarden;
dit afzonderlijke visuele besluit is geen voorwaarde voor de uitgevoerde fixes.
Een interactieve componentgalerij of Figma Code Connect is eveneens vervolgwerk.

[De uitvoeringsspec](../../features/frontend-review-opvolging.md) legt het actuele
contract vast. De oorspronkelijke reviewtekst hieronder blijft als bewijs van
het probleem bestaan; lees “huidig” in die secties als de vastgelegde baseline.

## Bron en bewijsgrenzen

- GitHub `main` gecontroleerd via MCP: [commit `62ca126b957a35cf7d8a60eb94c3951f404f9d44`](https://github.com/BramLambertJansen/ABAS/commit/62ca126b957a35cf7d8a60eb94c3951f404f9d44).
- De gelezen broncode in `/tmp/abas-platform-fixes` is exact dezelfde Git-subtree als die commit: `src = 4330a7664c829804a49093abaf8fb48755251f63`; `tailwind.config.ts = 02d8d73117547d5dc8733fb5f6e20fbab58305f9`. Ook de test- en e2e-subtrees komen overeen. De lokale ontwikkelcheckout is ouder en bevat eigen wijzigingen; die is niet als maatstaf genomen of aangepast.
- De actuele architectuurdocumentatie en T12-spec zijn ook op deze main-commit gelezen. T12 stelt een brede controlmigratie expliciet uit en kiest bewust voor knopconstanten. Deze review noemt dat vervolgwerk, geen overtreding van de eerder goedgekeurde scope.
- Dit is een broncode-review met een TypeScript-AST-inventaris en gerichte bestaande checks. Voor punt 2 zijn daarnaast 19 toestanden in een lokale Chromium-browser vastgelegd en bekeken, met DOM- en focuscontrole. De volledige app, schermlezers en fysieke apparaten zijn niet getest. Voor punt 3 zijn 22 aanvullende toestanden met schermmetingen en axe-core onderzocht; de afbakening staat bij die stap.
- Er is voor deze stap geen ABAS-Figma-file aangeleverd of geïnspecteerd. De vastgelegde ontwerpbron is het prototype in `designs/`, waarna het in-app design system leidend is. Een vergelijking met Figma-tokens of componentinstances is dus geen onderdeel van het bewijs.

## Inventaris

De scan omvat 234 TypeScript-bestanden, waaronder 94 TSX-bestanden. `src/components/` bevat 24 TSX-modules en twee TS-hulpmodulebestanden. Dit is een telling van bestanden, niet van alle geëxporteerde componenten.

| Bouwblok | Importplekken | Beoordeling |
|---|---:|---|
| `Overlay` | 19 | Goed gedeeld over tien featuremappen; modal/sheet verschillen in layout en delen focus-, sluit- en achtergrondgedrag. |
| `Tabs` (`TabList`, `TabPanel`) | 3 | Eén gedeeld toetsenbord- en ARIA-patroon voor bar, beheer en portal; vormgeving komt van de aanroeper. |
| `InitialsAvatar` | 12 | Begrensde size- en tone-varianten; hergebruik over zeven featuremappen. |
| `LeesFout` | 15 | Gedeelde fout- en retryweergave met light/rail-variant. |
| `TekstVeld` / `VeldFout` | 10 | Goede label-, hint- en foutkoppeling; importteller bevat ook gebruikers van alleen `VeldFout`. Veel gewone inputs blijven lokaal. |
| `CodeInvoer` | 5 | Hergebruik in beide shells; verificatie wordt door de aanroeper geleverd. |
| `BezettingKeuze` | 3 | Gedeelde keuze van medewerker bij drie financiële flows. |
| `ProductAfbeelding` | 3 | Vaste presentatievarianten en één afbeelding/fallback-implementatie. |
| `OpslaanSectie` | 2 | Draagt opslagstatus, pending en foutfeedback voor beide beheerformulieren. |
| `ZoekVeld`, `StatusFilter`, `ZijPaneel` | Elk 2 | Werkelijk gedeeld; zoeken is bewust nog niet overal gemigreerd. |
| `knopStijlen` | 12 | Gedeeltelijk toegepast; twee exports worden nog nergens in appcode gebruikt. |

Importplekken zijn statische importdeclaraties, inclusief relatieve imports binnen de componentlaag. Ze tellen geen gerenderde instances. Eén consument is op zichzelf geen reden om een component te verwijderen.

De AST-inventaris bevat ook 151 native `<button>`- en 30 native `<input>`-plekken. Dat zijn geen defectaantallen: tabs, toetsenborden, radios en file-inputs horen daar ook bij.

### Tokens

| Onderdeel | Stand |
|---|---|
| Kleuren | Centrale paletnamen in Tailwind: accent, ink, canvas, border, muted, rail, success, warning en danger. Enkele toepassingen omzeilen het palet; zie C03. |
| Font | Manrope centraal en lokaal geladen, met fallbackstack. |
| Spacing | Veel gebruik van de standaard Tailwind-schaal. `p-4`, `gap-2` e.d. zijn al gedeelde schaalwaarden en worden hier niet als hardcoded fouten gerekend. Daarnaast komen herhaalde arbitrary waarden voor. |
| Typografie | Naast de standaard Tailwind-schaal 21 verschillende numerieke `text-[Npx]`-waarden, samen 171 bronvermeldingen. Geen centrale rolenschaal voor bijvoorbeeld schermtitel, veldlabel en metadata. |
| Afrondingen | Eigen `card` en `control`, naast standaardradii en tien verschillende `rounded-[Npx]`-waarden, samen 68 bronvermeldingen. |
| Controlmaten | Nieuwe standaard 44px/12px en grote dialoogactie 50px/16px zijn gedocumenteerd; bestaande 48/52/54px-controls blijven aanwezig. |
| Elevatie | Meerdere lokale `shadow-[…]`-waarden, soms met RGB-waarden van het accent/ink rechtstreeks erin. |
| Focus en beweging | Centrale focusregel en reduced-motion-regel aanwezig. Velden kunnen een eigen ring gebruiken. |

De inventaris telt stringliteralen en statische templatefragmenten. Arbitrary waarden zijn signalen voor review, geen automatische fouten. SVG-geometrie, productafbeeldingmaten en responsieve `clamp`/`calc`-layouts kunnen een goede reden hebben om vast te blijven.

## Punt 1 — componenten en stylingtokens

**P2** = zinvol vervolgwerk voor onderhoudbaarheid en consistentie. **P3** = kleinere vereenvoudiging of documentatieverbetering. Deze prioriteiten betekenen geen aangetoonde productie-incidenten.

### C01 — P2: gewone invoervelden delen hun basis niet consequent

**Bewijs:** [TekstVeld:14][tekstveld] bevat de lichte veldstijl `h-[54px] rounded-2xl …`. Precies dezelfde klasseketen staat opnieuw in [PortalLogin:217][portallogin] en verderop op regels 281 en 343. Een tweede veldstijl, `h-12 rounded-control …`, staat identiek op vijf plekken in `NieuwWachtwoordVelden`, `NieuwProductOverlay` en `NieuwLidOverlay`.

Voor prijs, startsaldo en negatieflimiet worden de euro-prefix, de input en de focuscontainer eveneens per feature opgebouwd. [NieuwLidOverlay:179][nieuwlid] en [ProductBeherenOverlay:328][productbeheer] zijn concrete voorbeelden.

**Gevolg:** een aanpassing aan label-, input-, focus- of disabled-presentatie bereikt slechts een deel van de formulieren. `VeldFout` wordt al gedeeld, maar de basis eromheen nog niet. `TekstVeld` laat momenteel geen expliciete `id` of maatvariant toe; sommige bestaande consumers hebben die wel nodig voor focus en foutkoppeling.

**Voorstel:** uitbreiden met begrensde presentatievarianten en een optionele eigen id; de bestaande fout-, hint- en refkoppeling behouden. Een gedeelde veldbasis moet ook samengestelde invoer met prefix kunnen ondersteunen. Eerst gewone identieke velden migreren, daarna de bedragpresentatie. Validatie, bedragparsing, RPC's en authlogica blijven bij hun huidige eigenaar.

**Acceptatie:** bestaande veld-id's en refs blijven werken; fout/hint/describedby blijven gekoppeld; identieke velden gebruiken dezelfde basis; readOnly en disabled blijven semantisch verschillend. Bestaande maten aanvankelijk behouden. Een zichtbare maatwijziging krijgt een aparte schermcontrole.

### C02 — P2: knopstijlen zijn beschikbaar, maar slechts deels toegepast

**Bewijs:** [knopStijlen:36][knopstijlen] exporteert `KNOP_ACCENT_DONKER`; geen enkel ander TS/TSX-bestand in `src` gebruikt die export. Hetzelfde geldt voor `KNOP_DIALOOG_MAAT`. `KNOP_ACCENT_WIT` wordt wel door elf featurebestanden gebruikt en `KNOP_RAND` door acht bronbestanden.

Dezelfde donkere accentknop staat op vier plekken letterlijk in `ProductBeherenOverlay` en `LidBeherenOverlay`. [SheetKnoppen:35][sheetknoppen] implementeert de accent- en pendingstijl ook zelf. [AfrekenenOverlay:219][afrekenen] herhaalt de dialoogmaat, hoewel daar al kleurconstanten worden gebruikt.

**Gevolg:** kleur- en toestandswijzigingen in de centrale bron bereiken niet alle gelijksoortige knoppen. De gedeelde constanten ondersteunen nu native `disabled`, terwijl sommige submitknoppen bewust `aria-disabled` gebruiken om focus te behouden; blind vervangen is daarom niet correct.

**Voorstel:** eerst de bestaande constanten consequent toepassen bij passende knoppen en een expliciete stijlvariant voor `aria-disabled` toevoegen. Kleur/toestand en maat apart houden. Een klein `Knop`-component kan later de passende variants en maten combineren, als de publieke API vooraf helder is. Een nieuw component is niet nodig om de eerste verbeteringen te behalen.

**Acceptatie:** identieke primaire/secundaire acties halen hun presentatie uit één bron; rust/hover/active/disabled/aria-disabled worden gecontroleerd. Bestaande submitguards en focusbehoud veranderen niet. Niet elke kaart, chip of keypadtoets hoeft dezelfde knopvariant te worden.

**Bestaande afspraak:** T12 koos bewust constanten en stelde brede maatomzetting uit. Het ontbreken van een universeel Button-component is dus geen fout in die implementatie.

### C03 — P2: enkele kleurtoepassingen omzeilen het palet

**Bewijs:**

- `stroke="#aca69e"` staat in [ZoekVeld:32][zoekveld], [LidZoeker:148][lidzoeker] en [Assortiment:116][assortiment], terwijl die kleur al als `muted.light` bestaat.
- [PinToetsenbord:50][pintoetsenbord] gebruikt `hover:bg-[#262a31]`.
- [ModusKeuze:111][moduskeuze] en [StaffPicker:40][staffpicker] gebruiken `hover:bg-[#23262d]`.
- [DienstActief:316][dienstactief] gebruikt `text-[#e8eaed]`.
- Hetzelfde decoratieve accentgradient met `rgba(238,90,36,0.16)` is vijf keer gekopieerd. Ook accentschaduwen hebben rechtstreeks de accent-RGB-waarde.

**Gevolg:** aanpassen van `muted.light` of `accent` verandert die onderdelen niet mee. Dat beperkt de betrouwbaarheid van centrale styling en een eventuele latere themavariant.

**Voorstel:** SVG's laten erven via `currentColor` en een bestaande tokenklasse. Voor de terugkerende railkleuren passende centrale tokens toevoegen. De gedeelde gradient en terugkerende schaduwen een centrale definitie geven. De bestaande kleurwaarden eerst behouden.

**Acceptatie:** wijziging van een relevante token bereikt alle bedoelde consumers. Productmetadata zoals de PWA-`themeColor` is geen gewone CSS-consumer; die behoeft een eigen expliciete koppeling en wordt niet blind door een CSS-variable vervangen.

### C04 — P2: rollen voor typografie en surfaces zijn onvoldoende vastgelegd

**Bewijs:** `tailwind.config.ts` heeft wel kleuren, fontFamily en twee radiustokens, maar geen eigen typografierollen of elevatietokens. De scan vindt onder meer `text-[12.5px]` 32 keer en `text-[13.5px]` 21 keer. `rounded-[15px]` staat twaalf keer en `rounded-[13px]` elf keer in bronliteralen. Schaduwwaarden staan in afzonderlijke componenten en features.

De huidige veldmaten verschillen ook binnen de gedeelde laag: `TekstVeld` heeft 52/54px, `ZoekVeld` 52px, `Select` 48px en `LidZoeker` 50px. Dit zijn bestaande keuzes, geen automatische toegankelijkheidsfouten.

**Gevolg:** voor dezelfde visuele rol kiest nieuw werk gemakkelijk weer een net andere tekstmaat, radius of schaduw. Het is ook lastig om te bepalen welke verschillen bewust zijn.

**Voorstel:** een beperkte rolenset afspreken voor schermtitel, sectietitel, body, veldlabel en metadata; controlmaten en surfacevarianten expliciet benoemen. Bestaande uitzonderingen registreren. Herhaalde arbitrary spacing centraliseren waar dezelfde rol bedoeld wordt; de bestaande Tailwind-schaal behouden waar die voldoet.

**Acceptatie:** nieuwe UI kiest uit gedocumenteerde rollen; uitzonderingen hebben een reden. Tokenextractie kan eerst de huidige waarden bewaren. Het terugbrengen van 21 tekstmaten naar een kleinere schaal is een apart visueel besluit en vraagt controle van de betrokken schermen.

### C05 — P3: identieke schermomhulling en zoekiconen worden gekopieerd

**Bewijs:** de gehele donkere `<main>`-klasseketen en het achtergrondgradient zijn identiek in `BeheerLogin`, `ModusKeuze`, `BarInloggen`, `HervatScherm` en `DienstStarten`. [BeheerLogin:140][beheerlogin] en [ModusKeuze:71][modusframe] tonen hetzelfde patroon. Hetzelfde 17px-loepicoon staat in meerdere zoekvelden; een aantal gebruikt tokens via `currentColor`, een aantal een vaste stroke.

**Gevolg:** algemene wijzigingen aan de loginachtergrond, padding of zoekicoonpresentatie vragen aanpassingen op meerdere plekken.

**Voorstel:** een gedeelde presentatiewrapper voor de donkere startschermen en een klein gedeeld zoekicoon. Bij verdere zoekveldextractie de bestaande zoekveldrollen behouden: een gewone zoekinput en een combobox hebben verschillend gedrag. `Select` en `LidZoeker` delen daarvoor al `useListbox`; dat is goed.

**Acceptatie:** schermtitel, inhoud en focusrefs blijven bij de feature; de wrapper voegt geen tweede main-landmark toe en neemt geen login- of sessielogica over. Zoekvelden behouden hun eigen labels en comboboxsemantiek.

### C06 — P3: de componentcatalogus beschrijft de huidige laag niet volledig

**Bewijs:** [components/README.md][componentreadme] beschrijft hoofdzakelijk de beheerformulieren, knopconstanten en woordenlijst. Overzicht en keuzehulp voor onder meer `Tabs`, `TekstVeld`, `LeesFout`, `CodeInvoer`, `ProductAfbeelding` en de statuscomponenten ontbreken daar. Inline documentatie van [StatCard:20][statcard] noemt de metricvariant nog een toekomstige, ongemergede consument, terwijl `DienstAfsluitenOverlay` die inmiddels gebruikt. `MemberPill` bevat eveneens historische consumentinformatie.

**Gevolg:** de regel "zoek eerst naar een bestaande component" is moeilijker toe te passen. De catalogus maakt bovendien niet direct duidelijk welke maatregels voor nieuw werk gelden en welke afwijkingen legacy zijn.

**Voorstel:** één actuele index met doel, varianten, states, consumers en gebruiksvoorbeeld per bouwblok. Vermeld bij controls expliciet native disabled versus aria-disabled, fout/hintkoppeling en de toegestane nieuwe maten. Corrigeer verouderde consumentcomments. Begin met Markdown en voorbeelden; een aparte interactieve componentgalerij is mogelijk vervolgwerk.

**Acceptatie:** voor een nieuwe knop, veld, dialoog, tabgroep of melding is vanuit één index duidelijk welk bestaand bouwblok past. Documentatie claimt niet dat legacy-controls al allemaal op de nieuwe schaal zitten.

## Wat goed staat en behouden moet blijven

- `Overlay` centraliseert interactieregels in plaats van per feature een eigen dialoog te bouwen. Sheet en modal zijn bewuste shellverschillen.
- `TabList` en `TabPanel` delen het toetsenbord- en ARIA-gedrag; shellspecifieke presentatie is een passende scheiding.
- `InitialsAvatar` en `ProductAfbeelding` hebben benoemde variants in plaats van een vrije maat bij iedere consumer.
- `LeesFout`, `OpslaanSectie`, `VeldFout` en de financiële herstelmeldingen zijn herkenbare, gedeelde onderdelen. Deze review stelt geen wijziging van hun financiële of servergedrag voor.
- Veel domeinlogica zit al in hooks en pure helpers. Grote featurebestanden worden niet alleen vanwege hun regelaantal als fout aangemerkt. Eventuele verdere opsplitsing kan eerst binnen de feature; een formuliersectie hoeft niet meteen een generieke gedeelde component te worden.
- Het bestaande palet, zelf gehoste font, focusregel, reduced-motion-regel en contrastbewaking zijn een goede basis.

## Volgorde binnen punt 1

1. **C03:** tokenlekken corrigeren met behoud van actuele kleurwaarden.
2. **C02:** passende knoppen op gedeelde stijlen brengen; aria-disabled expliciet ondersteunen; huidige maten bewaren.
3. **C01:** één veldbasis uitbreiden en identieke gewone inputs migreren; daarna samengestelde bedragvelden.
4. **C04:** rollen en uitzonderingen vastleggen, vervolgens zichtbare harmonisatie per schermgroep uitvoeren.
5. **C05:** gedeelde schermomhulling en zoekicoon extraheren.
6. **C06:** de catalogus bij iedere stap bijwerken en de volledige index afronden.

Dit is een uitvoerbaar vervolgvoorstel. De review zelf voegt geen productcomponenten toe, wijzigt geen bestaande styling en maakt geen Figma-library aan.

## Verificatie van punt 1

- TypeScript-AST-inventaris uitgevoerd; resultaten in [inventory.json](inventory.json) en samenvatting in [inventory-summary.json](inventory-summary.json). Reproduceerbaar met [tools/inventory.cjs](tools/inventory.cjs): `node tools/inventory.cjs /pad/naar/checkout /tmp/inventory.json`. De targetcheckout moet zijn TypeScript-dependency geïnstalleerd hebben.
- `node test/accentContrast.test.ts`: **16 tests geslaagd**, inclusief de statische controle van gebruikte tokenparen en de fontcontrole.
- `node test/tabKeys.test.ts`: **12 tests geslaagd**.
- `node scripts/check-arch.mjs`: **geslaagd**, 234 bestanden gescand.
- Deze gerichte checks zijn direct uitgevoerd met Node 24.21.0. De eerste `node --test`-aanroep rapporteerde alleen twee bestandschecks; daarom zijn beide testbestanden daarna rechtstreeks uitgevoerd en zijn alleen de daadwerkelijk gerapporteerde 28 individuele tests hierboven als bewijs geteld.
- Geen volledige CI- of Figma-conformiteitsclaim. De browsercontrole voor punt 2 is hieronder afzonderlijk begrensd. De kleurtest bewijst ook geen volledige tokenisatie, omdat bijvoorbeeld ruwe SVG-strokes en gradientwaarden buiten die tokenpaarcontrole vallen.


## Punt 2 — consequente interactiepatronen

De gedeelde basis werkt voor veel interacties: tijdens opslaan wordt sluiten geblokkeerd, fouten blijven bij de actie, het laatste actieve activiteitstype krijgt een duidelijke waarschuwing en de portal herstelt focus na een geslaagde naamwijziging. De toepassing is niet overal consequent. Twee problemen zijn lokaal gereproduceerd: foutfeedback na een succesvolle prijswijziging en focusverlies bij opnieuw laden van Account. Daarnaast zijn er verschillen in veldvalidatie, zichtbare opslagstatus, financiële herstelacties en sluitgedrag.

### Werkwijze en bewijsgrenzen

- Dezelfde `src`- en testsubtrees als de hierboven genoemde main-commit zijn gebruikt. De lokale productiebuild van Next.js 15.5.27 draaide op `http://127.0.0.1:3100`; Node 24.21.0, Chromium via de Playwright-library. De broncheckout bleef schoon.
- Beheer is onderzocht op 1024 × 900, portal op 390 × 844, met reduced motion. Dit zijn twee onderzoeksviewports, geen volledige responsive- of apparaatcontrole.
- Auth, databaselezingen en RPC-antwoorden waren fictieve browserfixtures, deels gebaseerd op de bestaande e2e-helper. Alle andere externe browserrequests waren geblokkeerd. Er zijn geen productiedata gelezen of gewijzigd voor deze browsercontrole.
- De fixtures leveren succes, een geforceerde afwijzing, een vastgehouden antwoord en een verloren antwoord. De geforceerde prijsafwijzing bewijst alleen de foutpresentatie; €3,00 wordt hiermee niet als een ongeldige productieprijs aangemerkt. De leden-/productenlijsten en profielgegevens zijn vaste fixtures; hun oude waarden na een mutatie zijn geen bevinding over echte refreshlogica.
- Voor iedere opgenomen toestand is een screenshot opgeslagen en visueel bekeken. DOM-snapshots en `document.activeElement` onderbouwen de opmerkingen over focus en ARIA. Een screenshot bewijst geen aankondiging door VoiceOver/TalkBack.
- Serverherstel, definitieve annulering en een nieuwe bevoegde barsessie zijn in deze stap niet met een echte database uitgevoerd. Het financiële backendcontract is geen onderwerp van deze frontendreview. Niet-geldelijke time-outs na 30 seconden zijn uit de bestaande bronafspraak gelezen, maar niet in een nieuwe browserproef afgewacht.

### Overzicht van patronen

| Patroon | Geobserveerde toepassing | Beoordeling / vervolg |
|---|---|---|
| Gewijzigd → opslaan | Lid toont `Niet opgeslagen`; product heeft alleen het ingevoerde bedrag. | Gedeeld statuscontract beter toepassen: U04. |
| Opslaan loopt | Product vergrendelt de actie en sluiten; Escape geeft uitleg. Portal houdt de submitknop focusbaar met `aria-disabled`. | Goede basis behouden; C02 mag deze semantiek niet wegmigreren. |
| Geslaagd | Lid toont `Opgeslagen`; portal sluit de sheet en meldt `Naam bijgewerkt`; product wist het veld en toont een nieuwe validatiefout. | Taskverschillen zijn passend; de productfout repareren: U01, daarna U04. |
| Ongeldige invoer | Contactadres toont een gekoppelde veldmelding en herstelt veldfocus; lege naam blokkeert opslaan zonder veldmelding. | Eén validatiecontract per veldrol: U02. |
| Leesfout → retry | Gedeeld `LeesFout` + `useLeesHerstel` bewaart de knop; Account bouwt eigen markup en verliest focus. | Bestaand gedeeld patroon toepassen: U03. |
| Geldactie met onbekende uitkomst | Dialoog vraagt handmatige controle; na herladen verschijnen veilig afronden en definitief annuleren. | Herstel op dezelfde plek aanbieden en de eerdere actie benoemen: U05. |
| Sluiten met wijzigingen | Escape vraagt bevestiging; expliciet Sluiten gooit meteen weg. | Bestaand productbesluit, te heroverwegen UX-keuze: U06. |
| Risicovolle archivering | Het laatste actieve type benoemt de consequentie en biedt annuleren of eerst een type toevoegen. | Goed; niet iedere herstelbare archivering hoeft dezelfde extra bevestiging. |

### U01 — P2, gereproduceerde fout: succesvolle prijswijziging toont meteen een invoerfout

**Bewijs:** stap 05 → 06. De geaccepteerde fixture-response wijzigt de huidige prijs van €2,50 naar €2,75. Daarna is `Nieuwe prijs` leeg, krijgt het veld `aria-invalid` en verschijnt **“Vul een prijs in.”**. In [ProductBeherenOverlay:139][prijsvalidatie] blijft het eerder aangeraakte validatiemoment actief; [savePrice:149][prijssucces] wist alleen de invoer. [useVeldMoment][veldmoment] biedt geen reset naar een onaangeraakte nieuwe invoer.

**Gevolg:** succes ziet eruit als een fout die de gebruiker moet oplossen. De gebruiker kan daardoor twijfelen of de prijs is opgeslagen.

**Voorstel:** na bevestigde opslag de validatie-interactie van die prijsinvoer resetten, samen met het leegmaken. Het lege veld is dan opnieuw een onaangeraakte volgende wijziging. De huidige prijs blijft de opgeslagen waarde; zichtbare succesfeedback sluit aan op U04.

**Acceptatie:** na geldige prijsopslag zijn de nieuwe huidige prijs en het succes duidelijk, zonder foutmelding of `aria-invalid` op de gewiste invoer. Een volgende ongeldige invoer of bewuste lege opslagpoging toont weer de gebruikelijke veldmelding en focus. Een mislukte opslag behoudt invoer en fout. Voeg een regressietest toe voor deze gebruikersovergang; de bestaande pure validatietests dekken React-state na succes niet.

### U02 — P2: een lege verplichte naam verklaart niet waarom opslaan niet kan

**Bewijs:** stap 09 verlaat het lege naamveld en focust Opslaan. Er verschijnt geen veldmelding. [NaamWijzigenSheet:57][naamsheet] blokkeert een lege getrimde waarde vóór submit; het formulier heeft `noValidate` en toont alleen een serverfout. Een lege naam kan dus niet via die serverroute feedback krijgen. Dezelfde voorwaarde bestaat in `LidBeherenOverlay.canSaveName` en `NieuwLidOverlay.canSubmit`. Het contactadres laat in stap 19 juist een bruikbaar lokaal validatiepatroon zien.

**Gevolg:** de gebruiker ziet een niet beschikbare knop, maar krijgt geen expliciete aanwijzing bij het verplichte veld. Bedragen en e-mail gebruiken al een ander, duidelijker patroon.

**Voorstel:** pas dezelfde timing toe als bij bestaande veldfeedback: geen fout bij het openen of eerste typen; wel een gekoppelde naamfout na blur of een bewuste opslagpoging. Leg voor verplichte naamvelden vast of een poging de fout mag tonen of dat de knop geblokkeerd blijft met een veldmelding. `useVeldMoment` en `VeldFout` bieden de bestaande basis; dit hoort bij C01.

**Acceptatie:** lege of alleen uit spaties bestaande namen krijgen een duidelijke, aan het veld gekoppelde melding zodra feedback passend is. Corrigeren verwijdert die melding; initiële formulieren tonen geen fout; ongewijzigd en pending blijven afzonderlijke blokkaderedenen. Portal, nieuw lid en lidbeheer volgen hetzelfde naamcontract. Servervalidatie blijft leidend.

### U03 — P2, gereproduceerde fout: retry in Account verliest toetsenbordfocus

**Bewijs:** stappen 12 → 13 → 14. Na klikken op `Opnieuw proberen` vervangt Account de foutweergave door `Gegevens laden…`. De knop wordt verwijderd; `document.activeElement` wordt `BODY`. Na een tweede fout komt de knop terug, maar focus blijft op `BODY`. [AccountTab:71][accountretry] rendert laden en fout als exclusieve takken. [usePortalProfiel:90][profielretry] zet de foutstaat eerst terug naar laden.

**Gevolg:** een toetsenbordgebruiker verliest de plaats van de herstelactie en moet de knop opnieuw vinden. Dit is geobserveerd focusgedrag, geen claim over de volledige toegankelijkheid van Account.

**Voorstel:** gebruik `LeesFout` met `useLeesHerstel`, met een passende ref naar de herstelde Account-sectie. Die bestaande combinatie bewaart de fout-/retryplek tijdens laden en geeft de knop `aria-disabled` met een guard; bij succes gaat focus naar de herstelde sectie.

**Acceptatie:** fout → retry behoudt de focusbare herstelknop; een tweede poging tijdens laden start geen extra verzoek. Fout → retry → fout laat focus op de knop. Fout → retry → succes herstelt focus binnen Account. Rijen met verouderde gegevens verschijnen niet als bruikbare actuele data tijdens de fout.

### U04 — P2, vervolg op bewuste scope: product mist zichtbare wijzigings- en successtatus

**Bewijs:** stappen 02 en 06 tegenover 17 en 18. Lid gebruikt `OpslaanSectie.label` en `sectieStatus` voor `Niet opgeslagen`/`Opgeslagen`. Product gebruikt hetzelfde bouwblok, maar geeft [bij de prijssectie:317][productsectie] geen status mee. De [T11-catalogusspec:302][catalogusstatus] sluit product expliciet uit van die statusmigratie omdat het geen groot formulier is. Het verschil is dus geen gebroken T11-belofte.

**Gevolg:** twee overeenkomstige “wijzig één waarde en sla die op”-handelingen geven verschillende zekerheid. Bij product moet de gebruiker de nieuwe huidige prijs zelf als bewijs herkennen; U01 verergert dit.

**Voorstel:** maak tekstuele status de standaard voor blijvend geopende bewerksecties. Benut het bestaande `OpslaanSectie`-contract in product voor prijs en acties zoals archiveren/afbeelding, met een passende specifieke succestekst. Een korte portalsheet mag na succes sluiten en de melding in Account tonen; dat sluit aan op die taak en hoeft geen groot beheerformulier te worden.

**Acceptatie:** bij een gewijzigde prijs staat `Niet opgeslagen`; tijdens opslag is de actie herkenbaar bezig; na succes verschijnt een tekstuele bevestiging bij de sectie. Een nieuwe wijziging wist de eerdere successtatus. Fouten blijven bij hun actie en volgen het bestaande beleid dat een fout de status vervangt. Focus en live-region blijven stabiel; geen nieuwe globale toast voor lage beheerformulieren.

### U05 — P2: onbekende financiële uitkomst heeft twee verschillende herstelroutes

**Bewijs:** stap 15 toont `Ik heb gecontroleerd` en verwijst naar saldo of transacties. Stap 16, na herladen, toont `Eerdere nieuw lid veilig afronden` en `Eerdere nieuw lid definitief annuleren`, met de juiste uitleg dat annuleren geen boeking terugdraait. De actie blijft lokaal bewaard; de gemonitorde aanmaak-RPC is eenmaal verstuurd en herladen verstuurt geen tweede aanmaakactie.

[OnbekendeUitkomstMelding:5][geldmelding] en [opslaan.ts:24][geldtekst] bevatten bovendien nog actuele comments die zeggen dat er geen idempotentiesleutel is. [moneyRequest][moneyrequest] gebruikt inmiddels een bewaarde UUID en [EerdereGeldActie][geldherstel] biedt expliciet herstel via de bestaande hook. De historische T06-keuze mag blijven staan, maar actuele comments en de componentcatalogus moeten het huidige contract beschrijven.

**Gevolg:** binnen de geopende dialoog ontdekt de gebruiker het bestaande serverherstel niet. De herstelbanner noemt alleen het soort actie en mist oorspronkelijke lid-/bedragcontext; “veilig afronden” kan bij een ontbrekende receipt de eerdere handeling uitvoeren, dus de bedoeling moet herkenbaar zijn.

**Voorstel:** bied in de onbekende-uitkomstweergave dezelfde expliciete herstelkeuzes aan als bij een bewaarde actie, met oorspronkelijke actiecontext. Vermeld duidelijk dat controleren een eerder resultaat kan vinden, afronden een nog niet verwerkte actie kan uitvoeren en definitief annuleren alleen een niet geboekte sleutel afsluit. Hergebruik de bestaande guards, UUID en resultaat-/annuleringslogica. Werk de actuele financiële comments mee bij onder C06; verander historische besluiten niet stilzwijgend.

**Acceptatie:** de gebruiker kan vanuit de onbekende uitkomst de eerdere actie herkennen en het eerdere resultaat laten controleren/herstellen of veilig annuleren, zonder een herlaadtruc. De oorspronkelijke sleutel en invoer blijven intact; gewijzigd formulier kan die actie niet vervangen. Geen automatisch financieel verzoek bij mount, login of herladen. Succes meldt wat is afgerond; annulering beweert nooit dat een bestaande boeking is teruggedraaid. Backendreceiptbeleid en startsaldoregistratie blijven volgens het goedgekeurde #143-contract. Deze acceptatie vraagt later ook de bestaande financiële tests en een geschikte databaseproef, buiten deze audit.

### U06 — P2, UX-keuze: Sluiten en Escape behandelen dezelfde invoer verschillend

**Bewijs:** stappen 02 → 03 → 04. Escape vraagt `Niet-opgeslagen wijziging weggooien?` en focust `Terug`. Na terugkeren sluit de expliciete knop dezelfde invoer meteen af. [Overlay:164][sluitverzoek] bewaakt Escape/backdrop; directe Sluiten-knoppen roepen `onClose` aan. De [T06-afspraak:33][sluitafspraak] kiest dit uitdrukkelijk. De [componentwoordenlijst][componentreadme] zegt tegelijk dat Sluiten niets afbreekt, waardoor documentatie en concrete weggooibetekenis niet scherp overeenkomen.

**Gevolg:** het gevolg van dezelfde intentie, de dialoog verlaten, hangt af van toetsenbord of knop. Vooral in product ontbreekt de extra waarschuwing vooraf via `Niet opgeslagen` (U04).

**Voorstel ter besluitvorming bij uitvoering:** gebruik één gedeeld sluitverzoek voor Escape, backdrop en Sluiten/Annuleren bij gewijzigde invoer. Toon een inline weggooivraag met veilige focus op Terug; zonder wijzigingen direct sluiten. Als de bestaande directe-knopkeuze behouden blijft, leg die expliciet vast in de woordenlijst en zorg dat de onopgeslagen toestand zichtbaar is. Er is in deze review geen bestaand productbesluit omgedraaid.

**Acceptatie:** het gekozen contract geldt voor modal en sheet en staat op één plek beschreven. Pending blijft sluiten blokkeren; een afsluitpoging behoudt invoer. Terug verlaat alleen de bevestiging, Weggooien sluit expliciet af, en focus keert terug naar de trigger. De bestaande veilige annulering van het laatste actieve type blijft een afzonderlijk risicoafhankelijk patroon.

## Gezamenlijke aanpak voor punt 1, 2 en 3

Dit is één werkvoorraad met dezelfde bronbaseline. Volgorde en afhankelijkheden voorkomen dat controls eerst worden herschreven en hun gedrag daarna opnieuw moet worden aangepast. De bevindingen vragen verschillende verificatie; één gezamenlijke planning hoeft geen onoverzichtelijke alles-in-één codewijziging te betekenen.

| Volgorde | Werkpakket | Bevindingen | Concreet resultaat en verificatie |
|---|---|---|---|
| 1 | Aangetoonde feedback- en focusfouten oplossen | U01, U03, R02 | Prijsfeedback na succes herstellen, Account-retry focus behouden en focus na lidselectie herstellen. Gerichte browserregressies voor deze overgangen. |
| 2 | Vergroting en bereikbaarheid herstellen | R01, R03, C04 | Portal bij vergroot basislettertype en kassa bij verkleinde zoomlayout laten werken. Behalve paginaoverflow ook clipping, zichtbare inhoud en bereikbare acties meten. |
| 3 | Interactiecontracten vastleggen | U02, U04, U05, U06, C06 | Korte patrooncatalogus: veldfeedback, opslagstatus, leesherstel, onbekende financiële uitkomst en sluitgedrag. U06 vraagt een expliciete scopekeuze bij uitvoering; andere afspraken aansluiten op bestaande goedgekeurde regels. |
| 4 | Gedeelde veld- en knopbasis toepassen | C01, C02, U02, U04 | Controls centraliseren en direct de juiste states gebruiken. Bestaande maten eerst behouden; geen focus-/validatieverlies door alleen een stijlmigratie. |
| 5 | Financiële herstelpresentatie samenbrengen | U05, C06 | Bestaande herstelacties op de plek van de onbekende uitkomst, met herkenbare actiecontext en correcte actuele comments. UUID-/receipt-/annuleringsgedrag gericht blijven testen. |
| 6 | Tokenlekken en presentatiekopieën opruimen | C03, C05 | Gedeeld palet, gradients, schermomhulling en zoekicoon met dezelfde huidige waarden. Contrastchecks en schermcontrole van relevante consumers. |
| 7 | Visuele rollen en actuele index afronden | C04, C06 | Typografie/control/surface-rollen en uitzonderingen vastleggen; bij elke stap consumers en patronen bijwerken. De schermmatrix hieronder als baseline gebruiken en na zichtbare harmonisatie opnieuw controleren. Legacy-maten, scopegrenzen en het verschil tussen automatische scans en handmatige controles vermelden. |

**Patrooncatalogus bij uitvoering:** per interactie vastleggen: aanleiding → invoer/gewijzigd → bezig → gelukt/fout/onbekend; primaire/secundaire actie, sluitregels, focusdoel en aankondiging. Verwijs naar `Overlay`, `OpslaanSectie`, `TekstVeld`/`VeldFout`, `LeesFout`/`useLeesHerstel` en financiële herstelcomponenten. Geen nieuw generiek framework nodig als een bestaand bouwblok volstaat.

## Verificatie van punt 2

- **19** screenshots met toestandsnotities opgenomen en visueel geaccepteerd; DOM/focus in [interaction-evidence/captures.json](interaction-evidence/captures.json). De notities bij de screenshots hieronder vormen het leesbare bewijs.
- Bestaande checks opnieuw uitgevoerd op dezelfde bron: `node test/opslaan.test.ts` **8 geslaagd**, `node test/veldFouten.test.ts` **5 geslaagd**, `node test/moneyRequest.test.ts` **16 geslaagd**; **29 individuele tests, nul mislukkingen**. Uitvoer in [interaction-evidence/checks](interaction-evidence/checks/).
- Geen JavaScript-`pageerror` tijdens de captures; zie [browser-errors.json](interaction-evidence/browser-errors.json). Geforceerde HTTP-/netwerkfouten zijn scenario-input, geen onverwachte runtimefout. Dit bewijst geen afwezigheid van alle consolewaarschuwingen of productiefouten.
- Capturehulpmiddel in [tools/interaction-audit.cjs](tools/interaction-audit.cjs), met [instructies en scenario's](tools/INTERACTION-AUDIT.md). Het gebruikt fictieve data en blokkeert externe requests. De huidige captures zijn interactief gemaakt; dit is een reproduceerhulp, geen nieuw compleet e2e-testsuite-resultaat.
- Productcode en production resources zijn niet gewijzigd. De auditbrowser en de tijdelijke lokale server zijn na de controle gestopt. De aanvullende controle van punt 3 staat hieronder.

## Browserbewijs van punt 2 — stappen, screenshots en notities

Iedere onderstaande stap verwijst naar de screenshot uit deze reviewrun. “Goed” betekent dat de onderzochte interactie passend werkte, niet dat het hele scherm of de hele app is goedgekeurd.

### Stap 01 — Product openen

**Beoordeling:** Goed. De acties staan per sectie; Sluiten is onderaan. De vaste detailkop uit lidbeheer is hier bewust niet toegepast.

Stap 01: Product openen — lokaal beeldbewijs: `screenshots/01-product-opslag.png`.

### Stap 02 — Prijs wijzigen

**Beoordeling:** Verbeteren — U04. De afwijkende prijs is zichtbaar in het veld, maar er is geen tekstuele Niet opgeslagen-status.

Stap 02: Prijs wijzigen — lokaal beeldbewijs: `screenshots/02-product-onopgeslagen.png`.

### Stap 03 — Escape met wijzigingen

**Beoordeling:** Goed binnen huidig besluit — U06. De invoer blijft staan en de inline vraag krijgt veilige focus op Terug.

Stap 03: Escape met wijzigingen — lokaal beeldbewijs: `screenshots/03-escape-bevestiging.png`.

### Stap 04 — Expliciet Sluiten met wijzigingen

**Beoordeling:** UX-keuze — U06. Dezelfde invoer verdwijnt zonder vraag; dit volgt de bestaande T06-afspraak.

Stap 04: Expliciet Sluiten met wijzigingen — lokaal beeldbewijs: `screenshots/04-sluiten-direct.png`.

### Stap 05 — Vertraagde prijsopslag en Escape

**Beoordeling:** Goed. Veld, actie en sluiten zijn geblokkeerd; Escape geeft verwerkingsuitleg en de focus blijft binnen de dialoog.

Stap 05: Vertraagde prijsopslag en Escape — lokaal beeldbewijs: `screenshots/05-product-pending.png`.

### Stap 06 — Prijsopslag geslaagd

**Beoordeling:** Fout — U01; statusverschil U04. De huidige prijs is €2,75, maar het gewiste veld toont Vul een prijs in. en is aria-invalid. Dit is na een bevestigde succesresponse.

Stap 06: Prijsopslag geslaagd — lokaal beeldbewijs: `screenshots/06-product-opgeslagen.png`.

### Stap 07 — Prijsopslag afgewezen

**Beoordeling:** Grotendeels goed. De fout blijft bij de prijsactie en de invoer €3,00 blijft staan. De serverafwijzing is geforceerd; dit zegt niets over de geldigheid van €3,00 in productie.

Stap 07: Prijsopslag afgewezen — lokaal beeldbewijs: `screenshots/07-product-opslagfout.png`.

### Stap 08 — Laatste actieve type archiveren

**Beoordeling:** Goed. De concrete consequentie en alternatieven staan direct bij Repetitie. Deze stap verstuurt nog geen archivering.

Stap 08: Laatste actieve type archiveren — lokaal beeldbewijs: `screenshots/08-laatste-type-bevestiging.png`.

### Stap 09 — Lege naam in portal

**Beoordeling:** Verbeteren — U02. Opslaan is aria-disabled en focusbaar, maar na verlaten van het veld verschijnt geen verklaring bij de verplichte naam.

Stap 09: Lege naam in portal — lokaal beeldbewijs: `screenshots/09-portal-lege-naam.png`.

### Stap 10 — Vertraagde naamopslag in portal

**Beoordeling:** Goed. Opslaan… en geblokkeerd annuleren maken pending duidelijk; de submitknop behoudt focus.

Stap 10: Vertraagde naamopslag in portal — lokaal beeldbewijs: `screenshots/10-portal-pending.png`.

### Stap 11 — Naamopslag geslaagd in portal

**Beoordeling:** Goed. De sheet sluit met Naam bijgewerkt en focus keert terug naar de Naam wijzigen-rij. De oude profielnaam komt uit een vaste fixture.

Stap 11: Naamopslag geslaagd in portal — lokaal beeldbewijs: `screenshots/11-portal-opgeslagen.png`.

### Stap 12 — Accountgegevens laden mislukt

**Beoordeling:** Verbeteren — U03. De fout en retry zijn duidelijk, maar deze eigen markup gebruikt het gedeelde herstelpatroon niet.

Stap 12: Accountgegevens laden mislukt — lokaal beeldbewijs: `screenshots/12-account-leesfout.png`.

### Stap 13 — Account-retry loopt

**Beoordeling:** Fout — U03. De retryknop verdwijnt; actieve focus wordt BODY. Laden is bewust vastgehouden om deze toestand te onderzoeken.

Stap 13: Account-retry loopt — lokaal beeldbewijs: `screenshots/13-account-retry-pending.png`.

### Stap 14 — Account-retry opnieuw mislukt

**Beoordeling:** Fout — U03. De knop verschijnt opnieuw, maar focus blijft op BODY. De gebruiker moet de herstelactie opnieuw vinden.

Stap 14: Account-retry opnieuw mislukt — lokaal beeldbewijs: `screenshots/14-account-retry-fout.png`.

### Stap 15 — Nieuw lid met verloren antwoord

**Beoordeling:** Verbeteren — U05. Invoer blijft staan en Toevoegen is geblokkeerd. De melding vraagt handmatige controle, terwijl de bewaarde actie ook serverherstel ondersteunt.

Stap 15: Nieuw lid met verloren antwoord — lokaal beeldbewijs: `screenshots/15-geld-uitkomst-onbekend.png`.

### Stap 16 — Bewaarde actie na herladen

**Beoordeling:** Goede basis; presentatie verbeteren — U05. Expliciet afronden/annuleren en de juiste uitleg verschijnen. Herladen start geen tweede aanmaakactie; de oorspronkelijke naam/het bedrag ontbreken in de banner.

Stap 16: Bewaarde actie na herladen — lokaal beeldbewijs: `screenshots/16-geld-herstel-na-herladen.png`.

### Stap 17 — Naam in lidbeheer wijzigen

**Beoordeling:** Goed. Niet opgeslagen staat bij de juiste sectie; dit is het voorbeeld voor U04.

Stap 17: Naam in lidbeheer wijzigen — lokaal beeldbewijs: `screenshots/17-lid-onopgeslagen.png`.

### Stap 18 — Naamopslag in lidbeheer geslaagd

**Beoordeling:** Goed. Opgeslagen verschijnt bij de naam; het veld behoudt focus. De achtergrondlijst is een vaste fixture.

Stap 18: Naamopslag in lidbeheer geslaagd — lokaal beeldbewijs: `screenshots/18-lid-opgeslagen.png`.

### Stap 19 — Ongeldig contactadres opslaan

**Beoordeling:** Goed. De gekoppelde veldmelding legt de fout uit en focus keert terug naar Contactadres. De validatie vindt lokaal vóór de mutatie plaats.

Stap 19: Ongeldig contactadres opslaan — lokaal beeldbewijs: `screenshots/19-lid-veldvalidatie.png`.


## Punt 3 — schermen, responsive gedrag en toegankelijkheid

De normale schermen zijn overzichtelijk en passen op de onderzochte ondersteunde breedtes. De portal blijft op 320px bruikbaar en vormt op desktop één gecentreerde kolom. De kassa werkt op tablet in portret en landschap; lang productlabel, mandje, totaal en saldo zijn herkenbaar. Dialoogafscherming, focuslus, tabbediening en labels hebben een goede gedeelde basis. De grotere-tekst- en zoomscenario's leggen wel twee layoutproblemen bloot. Daarnaast verliest de gewone lidselectie in de kassa de toetsenbordfocus. Deze drie bevindingen worden toegevoegd als R01–R03; de eerdere C- en U-bevindingen blijven van toepassing.

### Onderzoeksopzet en bewijsgrenzen

- GitHub-main opnieuw via MCP gecontroleerd: dezelfde commit `62ca126b957a35cf7d8a60eb94c3951f404f9d44`. `src`, tests, e2e en stylingbaseline zijn niet veranderd. De onderzochte app draaide als lokale Next.js-productiebuild.
- **22 nieuwe captures (20–41)**, ieder opgeslagen en visueel bekeken, met DOM-snapshot, actieve focus, bounding boxes, documentmaten en axe-core **4.13.0**. De browser gebruikte reduced motion en wachtte op de fonts. Auth en gegevens waren fictieve fixtures; andere externe browserrequests werden geblokkeerd.
- Portal: 320×844, 390×844, 390×500 en 1280×800. Bar: 768×1024 en 1024×768; aanvullend een zoomlayout van 512×384. Beheer: 768×1024, 768×600 en 1024×768. Bar/beheer zijn volgens CLAUDE.md voor tablet/desktop; de smallere kassa is onderzocht als vergroting van een ondersteund tablet, niet als nieuwe telefoonondersteuning.
- Twee afzonderlijke vergrotingsproeven: `html { font-size: 32px }` op de portal vergroot rem-tekst en rem-maten, maar vergroot vaste px-lettergroottes niet mee. De kassa op 512×384 CSS-px simuleert de layoutviewport bij 200% zoom op 1024×768. Dit zijn reproduceerbare layoutproeven, geen meting van de browserzoomknop of OS-tekstvergroting op een fysiek apparaat.
- axe draaide met tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`: **nul automatisch gerapporteerde violations in 22 scans**. Negen scans hebben nog `incomplete` contrastbeoordelingen, samen 29 nodevermeldingen, waaronder herhaalde symbolen en overlappende/afgedekte tekst. Nul violations is dus geen volledige contrastgoedkeuring of WCAG-conformiteitsclaim. Het vastgestelde focusverlies en de layoutfouten worden door deze scans niet als violation gerapporteerd.
- Voor drie contrastvermeldingen in de gewone kassa zijn de actuele voor-/achtergrondkleuren apart gemeten: beide mintekens **5,112:1**, de witte afrekenpijl **4,828:1**. Dat sluit een contrastprobleem voor die gemeten kleurparen uit; overige `incomplete` gevallen blijven afzonderlijk te beoordelen. Zie [manual-contrast.json](screen-evidence/manual-contrast.json).
- De schermmetingen noemen controls onder 44px, maar ook controls in de inerte achtergrond van een dialoog. Gebruik die teller niet als defectaantal. De concrete maten hieronder komen uit schermen zonder overlay. Playwrights DOM-snapshot kan inerte achtergrondmarkup weergeven; de apart gemeten inert- en focuscontrole is leidend voor afscherming.
- Sommige screenshots zijn `fullPage`: de extra ruimte onder de viewport van een korte portalsheet is achtergrondinhoud buiten het actuele scherm, geen bewezen afschermingsfout. Voor 27, 40 en 41 is de daadwerkelijke viewport vastgelegd om clipping en bereikbaarheid te tonen.
- Geen echte betalingen, accountwijzigingen, afsluitingen of afmeldingen uitgevoerd. Deze stap controleert de presentatie en bediening, niet de backenduitkomst. Fictieve namen en ontbrekende productafbeeldingen zijn fixturegegevens.
- Safari/Firefox, VoiceOver/TalkBack/NVDA, echte touchbediening, de mobiele toetsenbord-/visualViewport-interactie, OS-tekstvergroting en alle uitzonderlijke auth/PIN/TOTP/hersteltoestanden zijn niet volledig onderzocht. Er is geen vergelijking met een actuele Figma-file en geen volledige nieuwe CI-run. Dit begrenst de conclusie; het maakt deze reviewstap niet tot een volledige toegankelijkheidscertificering.

### Schermmatrix en wat behouden moet blijven

| Gebied | Getest | Beoordeling |
|---|---|---|
| Portal-login | 320px, labels en inlogmethode | Heldere primaire actie; geen horizontale overflow; automatische scan zonder violations. |
| Saldo en transacties | Gevulde en lege lijst, teruggedraaide bestelling, lange productomschrijving, 320/390px | Bedragen houden hun richting; terugdraaiing heeft tekst en uitleg; omschrijvingen breken af; leeg is duidelijk te onderscheiden van niet geregistreerd. |
| Portal-account en sheets | Handmatige tabactivatie, Tab-lus, Escape, 500px hoogte, wachtwoordlabels/-eisen | Focuslus en herstel werken; achtergrond is inert; velden, eisen en acties zijn gekoppeld en bereikbaar. R01 raakt de vergrote layout, U02/U03 blijven eerdere uitzonderingen. |
| Lange naam en desktopportal | Lange voornaam op 320px; kolom op 1280px | Header kapt de voornaam bewust af maar bewaart de volledige tekst in DOM; Uitloggen blijft vrij. Desktopkolom blijft 560px en gecentreerd. |
| Kassa | Gekozen lid, twee producten, lange naam, 768/1024px, afrekendialoog | Duidelijke hiërarchie en saldo/totaal; naam afgekapt op productkaart maar volledig in accessible name en mandje. R02: focus na gewone lidselectie. R03: productgedeelte verdwijnt in zoomlayout. |
| Dienst | Verticale automatische tabactivatie, samenvatting, lege boekingen, 1024px | Dienst wordt met ArrowDown geactiveerd; lege boekingen geven uitleg; afsluitactie herkenbaar. |
| Beheer | Assortiment, lid-detail bij 600px hoogte, instellingen op 768px | Tabs en Uitloggen zichtbaar; detailkop blijft staan terwijl de inhoud scrollt; lagere acties bereikbaar. Instellingen schakelen op 768px naar één kolom. |
| Logboek en diensten/apparaten | Lange naam, zes gebeurtenissen, expliciete niet-geregistreerde filter; één actieve dienst/apparaat | Groepering en context duidelijk; geen stille fictieve auditdata. Assortiment-/Ledenfilters zijn bewust bestaande scope, met uitleg. Acties aan andere apparaten zijn benoemd. |

### R01 — P2, gereproduceerd: vergrote basisletters breken portalnavigatie en transactieregels

**Bewijs:** stap 27 tegenover 22. Bij 320px en `html { font-size: 32px }` wordt de documentbreedte **415px**. Account eindigt rond x=415; Verversen en Opwaarderingen steken ook buiten de viewport. De screenshot toont overlappende tablabels en `Bestelling` over het bedrag. De gewone 320px-versie past wel.

[PortalDashboard:14][portaltabmaat] en [TransactiesTab:69][transactiefilters] gebruiken één flexrij met beperkte hoogte en geen passende afbreek-/omslagstrategie. [VerversStatus][verversstatus] houdt tijdstip en verversknop op één rij. De bestaande mix van rem- en px-tekst/maten maakt vergroten bovendien ongelijkmatig; dat sluit aan op C04.

**Gevolg:** juist bij grotere letters worden belangrijke navigatie en bedragen lastiger leesbaar of buiten beeld geplaatst. Geen automatisch axe-resultaat meldt deze layoutfout.

**Voorstel:** laat navigatie, filterknoppen en de verversregel bij beperkte ruimte omslaan of een gecontroleerde extra regelhoogte gebruiken. Zorg dat transactiebeschrijving en bedrag elkaar niet kunnen bedekken. Los dit op in de bestaande gedeelde/presentatiebouwblokken en rolentokens; het verkleinen van de tekst tot de oude maat is geen oplossing voor deze gebruikersbehoefte.

**Acceptatie:** de gewone portal op 320/390/1280px blijft bruikbaar. In het vastgelegde 32px-basisscenario blijven alle tab-/filterlabels en Verversen binnen bereik; titel, omschrijving en bedrag overlappen niet; tekstueel belangrijke informatie raakt niet verborgen. Breid de browsercontrole uit met echte 200% tekst-/browservergroting en 400% reflow waar van toepassing, voordat volledige conformiteit wordt geclaimd. De [W3C-uitleg bij tekstvergroting](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) en [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) zijn de referenties voor dat vervolg; deze stresstest alleen bewijst geen volledige SC 1.4.4/1.4.10-uitspraak.

### R02 — P2, gereproduceerd: gewone lidselectie in de kassa verwijdert het focusdoel

**Bewijs:** vóór stap 29 stond de focus in `Zoek lid op naam`, met één geselecteerde optie. Enter kiest Joris. Daarna verdwijnt de combobox en wordt `document.activeElement` **BODY**. Het gekozen lid en het mandje zijn correct zichtbaar; de focusovergang niet. Vastgelegd in [keyboard.json](screen-evidence/keyboard.json), `memberSelection`, en capture 29.

[Mandje:116][lidselectiefocus] roept in de gewone keuze `onSelectMember` aan zonder focusherstel. `bevestigWissen` zet verderop wél `focusOpLid`; de bestaande effect/ref naar de lidnaam is dus al aanwezig, maar alleen toegepast op de bevestigde wisselroute.

**Gevolg:** een toetsenbordgebruiker verliest de plek na een succesvolle selectie en moet de volgende handeling opnieuw vinden. Dit is hetzelfde soort lifecycleprobleem als U03, op een andere overgang.

**Voorstel:** pas het bestaande focusdoel bij de gekozen lidnaam consequent toe na iedere voltooide selectie die de zoeker verwijdert. Controleer ook de omgekeerde `wissel`-overgang naar de zoeker, zodat de hele keuze heen en terug voorspelbaar is. De bestaande mandje-/lidwisselbevestiging behouden.

**Acceptatie:** lid selecteren met Enter, Space waar van toepassing of pointer toont het gekozen lid en houdt een betekenisvol focusdoel in het mandjepaneel; focus blijft niet op BODY. De volgende Tab bereikt een passende vervolgactie. Wissel geeft focus terug aan de zoeker. Bij een noodzakelijke mandjebevestiging blijft de veilige focus op Terug en wordt niets stil gewist. Voeg een browserregressie toe voor de gewone selectie, niet uitsluitend voor `Wissen en kiezen`.

### R03 — P2, gereproduceerd: zoomlayout houdt mandje vast maar verbergt het assortiment

**Bewijs:** stap 33 tegenover 29/31. Op 512×384 CSS-px (layout-equivalent van 200% zoom op 1024×768) heeft de pagina geen horizontale overflow: `scrollWidth = clientWidth = 512`. Toch toont de screenshot geen productkaarten. Het zijpaneel blijft 300px en de rail 80px; voor de linkerkolom blijft 132px over. Na padding is het productgedeelte 80px breed.

De DOM-meting in [zoom-product-clipping.json](screen-evidence/zoom-product-clipping.json) plaatst de productlijst op **y=467**, terwijl de viewport tot y=384 loopt. De lijst heeft slechts **10px hoogte** en valt buiten haar eigen `overflow-hidden`-voorouder (y=119, hoogte=243). Productkaarten blijven in DOM en hebben 150px minimumbreedte. [ZijPaneel:24][zijpaneelbreedte], [VerkoopScherm:264][verkooplayout] en [Assortiment:205][productgrid] onderbouwen de combinatie. De bestaande tabletspec toetst wel 150% layout en 24px basisletters, maar niet deze 200%-overgang.

**Gevolg:** geen paginaoverflow betekent hier niet dat de taak nog bruikbaar is. De gebruiker ziet het mandje en totaal, maar kan niet op de gewone manier bij het productaanbod; zelfs de zoek-/weergavecontrols raken deels afgeknipt.

**Voorstel:** geef de kassa een layout voor vergrote/smallere werkruimte, bijvoorbeeld een stapelbare of wisselbare inhoud/paneelindeling met behoud van mandje, gekozen lid en totaal. Laat het hoofdgedeelte werkelijk scrollen in plaats van de productlijst onder vaste controls af te knippen. De specifieke presentatie bij uitvoering afstemmen op de bestaande kassataak; dit voorstel introduceert geen telefoonondersteuning als nieuw productvereiste.

**Acceptatie:** op gewone 768/1024/1280-tablets blijft de kassa herkenbaar. Op de 512×384-zoomlayout zijn zoeken, categorie/weergave, producten en mandjehandelingen bereikbaar met pointer en toetsenbord, zonder informatieverlies of een onzichtbare lijst. Controleer intersectie met viewport én clippingvoorouders en daadwerkelijke bedienbaarheid; een alleen-op-`scrollWidth` gebaseerde test is onvoldoende. Mandje en gekozen lid blijven bij een layout-/tabwissel behouden. Werk de bestaande tablet-/zoommatrix en expliciete beperkingen mee bij onder C06.

### Aanvullend bewijs bij bestaande C04/C06

- In de gewone kassa zijn verwijderen-knoppen **30×30px**, de bezettingsknop **40px** hoog en Uitloggen circa **33,75px** hoog. Portal-tabs zijn **40px** hoog; beheer-tabs en diverse ingreepknoppen **36px**. Dit bevestigt C04's gemengde controlmaten op echte schermen. T12 beperkte de eerdere migratie bewust; deze review behandelt die maten als gerichte vervolgkeuzes, niet als alsnog gebroken scope.
- 44px is hier een gewenste comfortabele controlmaat voor nieuwe/herhaalde tabletacties. De [WCAG 2.2-minimumregel voor targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) gaat over 24×24 CSS-px of toepasselijke uitzonderingen/afstand. De genoemde 30/36/40px-controls zijn daarom niet alleen op basis van hun maat als WCAG-fout aangemerkt. Controleer later ook de ruimte tussen targets en echte touchbediening.
- Documenteer per patroon/scherm: ondersteunde breedte, verkleinings-/vergrotingsgedrag, scrollgebied, focusdoel en uitzonderingen. De huidige a11y-e2e-scans gebruiken hoofdzakelijk `wcag2a`/`wcag2aa`; aanvullende 2.1/2.2-tags en handmatige gebruikersovergangen verbeteren de dekking. Een CI-scan mag niet worden beschreven als volledige WCAG-AA-goedkeuring.
- Klein copywerk bij C06: het instellingenlabel heet `Nieuw activiteittype`, terwijl kop en waarschuwing `Activiteitstypes`/`activiteitstype` gebruiken. Harmoniseer die schrijfwijze bij het bijwerken van de component-/patrooncatalogus; dit is geen functionele blokkade.

### Verificatie van punt 3

- **22/22 captures visueel bekeken**; alle referenties, DOM-/focusmetingen en axe-uitvoer in [screen-evidence/captures.json](screen-evidence/captures.json). Geen automatisch gerapporteerde violations; de `incomplete` gevallen blijven zichtbaar in de evidence. De drie handmatige problemen zijn afzonderlijk onderbouwd.
- Portal: pijlen verplaatsen focus terwijl Transacties geselecteerd blijft; Enter activeert Account. Zeven Tab-stappen in de naamdialoog blijven binnen de dialoog. Escape geeft focus terug aan de trigger. In de wachtwoordsheet is de achtergrond inert en kan programmatisch focus op Uitloggen niet uit de dialoog ontsnappen.
- Bar: ArrowDown activeert Dienst meteen; ArrowUp keert terug naar Verkoop. De verkoopdraft blijft aanwezig. Escape uit Afrekenen geeft focus terug aan de afrekenknop. De gewone comboboxselectie laat het afzonderlijke R02-probleem zien.
- De bestaande directe checks zijn voor deze stap opnieuw uitgevoerd: `node test/accentContrast.test.ts` **16 geslaagd**, `node test/tabKeys.test.ts` **12 geslaagd**. Uitvoer in [screen-evidence/checks](screen-evidence/checks/). Dit zijn 28 opnieuw uitgevoerde tests, niet 28 extra nieuwe tests boven op dezelfde punt-1-checks.
- Geen JavaScript-`pageerror` tijdens deze captures; [browser-errors.json](screen-evidence/browser-errors.json). Een lege pageerrorlijst is geen complete console-/backendcontrole.
- Capturehulp in [tools/screen-audit.cjs](tools/screen-audit.cjs), met [scenario- en reproduceerinstructies](tools/SCREEN-AUDIT.md). De captures zijn interactief gemaakt; de hulp is geen nieuwe volledige CI/e2e-suite. De broncheckout bleef schoon; appcode en productie zijn niet aangepast. Browser en tijdelijke server zijn gestopt.

### Nog nodig bij de uitvoering, buiten deze review

De gecombineerde werkvoorraad hierboven bevat nu alle **15** bevindingen. Bij de reparaties de aangetoonde React-state-, focus- en vergrotingsovergangen als regressies vastleggen. Daarna de gewijzigde schermen opnieuw controleren op de matrix en uitvoeren op echte iOS/Android-tablets en de portal, inclusief virtueel toetsenbord en relevante schermlezers. De overige auth/PIN/TOTP- en herstelvarianten blijven onderdeel van hun bestaande featuretests en gerichte controles. Deze review levert de concrete planning en baseline; de voorgestelde implementatie en volledige toegankelijkheidsvalidatie zijn nog niet uitgevoerd.

## Browserbewijs van punt 3 — schermen en toestanden

### Stap 20 — Portal-login op 320px

**Beoordeling:** Goed. Labels en primaire actie passen; geen horizontale overflow.

Stap 20: Portal-login op 320px — lokaal beeldbewijs: `screenshots/20-portal-login-320.png`.

### Stap 21 — Saldo op 320px

**Beoordeling:** Goed. Lange productomschrijvingen breken af; bedrag en terugdraai-uitleg blijven duidelijk.

Stap 21: Saldo op 320px — lokaal beeldbewijs: `screenshots/21-portal-saldo-320.png`.

### Stap 22 — Transacties op 320px

**Beoordeling:** Goed. Filters, maandgroepering en bedragen passen; Alle transacties geeft focus aan de Transacties-tab.

Stap 22: Transacties op 320px — lokaal beeldbewijs: `screenshots/22-portal-transacties-320.png`.

### Stap 23 — Account met toetsenbord

**Beoordeling:** Goed. Pijlen verplaatsen focus, Enter activeert Account; zichtbare focusring en benoemde acties.

Stap 23: Account met toetsenbord — lokaal beeldbewijs: `screenshots/23-portal-account-toetsenbord.png`.

### Stap 24 — Naamsheet bij 500px hoogte

**Beoordeling:** Goed. Zeven Tab-stappen blijven binnen de dialoog; Annuleren bereikbaar. FullPage toont ook achtergrond onder de echte 500px viewport; dat is geen afschermingsbevinding.

Stap 24: Naamsheet bij 500px hoogte — lokaal beeldbewijs: `screenshots/24-portal-sheet-kleine-hoogte.png`.

### Stap 25 — Lange voornaam op 320px

**Beoordeling:** Goed binnen huidige presentatie. Naam wordt zichtbaar afgekapt om Uitloggen vrij te houden; volledige tekst blijft in DOM en Account beschikbaar.

Stap 25: Lange voornaam op 320px — lokaal beeldbewijs: `screenshots/25-portal-lange-voornaam-320.png`.

### Stap 26 — Portal op desktop

**Beoordeling:** Goed. 560px kolom gecentreerd op 1280px; geen horizontale overflow.

Stap 26: Portal op desktop — lokaal beeldbewijs: `screenshots/26-portal-desktop-1280.png`.

### Stap 27 — Portal met grotere basisletters

**Beoordeling:** Probleem — R01. 320px viewport wordt 415px documentbreedte; labels steken uit en transactietekst bedekt bedrag. Screenshot toont de echte viewport.

Stap 27: Portal met grotere basisletters — lokaal beeldbewijs: `screenshots/27-portal-grotere-basisletter.png`.

### Stap 28 — Portal zonder transacties

**Beoordeling:** Goed. Lege staat heeft uitleg en bruikbare filters/navigatie.

Stap 28: Portal zonder transacties — lokaal beeldbewijs: `screenshots/28-portal-lege-transacties.png`.

### Stap 29 — Kassa op 768px portret

**Beoordeling:** Layout goed; focusprobleem R02. Assortiment, mandje en totaal passen. Enter selecteert het lid, verwijdert de zoeker en laat focus op BODY.

Stap 29: Kassa op 768px portret — lokaal beeldbewijs: `screenshots/29-bar-verkoop-tablet-768.png`.

### Stap 30 — Afrekendialoog

**Beoordeling:** Goed. Gekozen lid, bedrag en consequentie zijn duidelijk. Alleen geopend; geen boeking gestart.

Stap 30: Afrekendialoog — lokaal beeldbewijs: `screenshots/30-bar-afrekenen-dialoog.png`.

### Stap 31 — Kassa op 1024px landschap

**Beoordeling:** Goed. Producten, mandje, afrekenen en herstelde focus passen; langere naam volledig in mandje.

Stap 31: Kassa op 1024px landschap — lokaal beeldbewijs: `screenshots/31-bar-verkoop-landschap.png`.

### Stap 32 — Dienst via verticale tabs

**Beoordeling:** Goed. ArrowDown activeert Dienst en houdt focus op de tab; cijfers en lege boekingen zijn duidelijk.

Stap 32: Dienst via verticale tabs — lokaal beeldbewijs: `screenshots/32-bar-dienst-toetsenbord.png`.

### Stap 33 — Kassa in 200%-zoomlayout

**Beoordeling:** Probleem — R03. Productkaarten verdwijnen buiten de clippingvoorouder, ondanks nul paginabrede horizontale overflow.

Stap 33: Kassa in 200%-zoomlayout — lokaal beeldbewijs: `screenshots/33-bar-zoom-layout-512.png`.

### Stap 34 — Beheerassortiment op 768px

**Beoordeling:** Goed. Alle tabs, Uitloggen, zoeken en statusfilters binnen beeld.

Stap 34: Beheerassortiment op 768px — lokaal beeldbewijs: `screenshots/34-beheer-assortiment-768.png`.

### Stap 35 — Lang liddetail op lage viewport

**Beoordeling:** Goed. Bij scroll naar lagere acties blijven titel/context en Sluiten vast zichtbaar. Geen archivering uitgevoerd.

Stap 35: Lang liddetail op lage viewport — lokaal beeldbewijs: `screenshots/35-beheer-liddetail-scroll.png`.

### Stap 36 — Instellingen op 768px

**Beoordeling:** Goed; klein copywerk bij C06. Cards staan onder elkaar en velden zijn gelabeld. Label Nieuw activiteittype wijkt in schrijfwijze af.

Stap 36: Instellingen op 768px — lokaal beeldbewijs: `screenshots/36-beheer-instellingen-768.png`.

### Stap 37 — Gevuld logboek op 1024px

**Beoordeling:** Goed. Lange lidnaam, dagen en handelingcontext leesbaar. Fixture toont zes gebeurtenissen, geen claim over echte volledigheid.

Stap 37: Gevuld logboek op 1024px — lokaal beeldbewijs: `screenshots/37-beheer-logboek-1024.png`.

### Stap 38 — Logboekfilter zonder databron

**Beoordeling:** Goed binnen bestaande scope. Nog niet geregistreerd legt het bestaande besluit duidelijk uit; geen verzonnen auditgeschiedenis.

Stap 38: Logboekfilter zonder databron — lokaal beeldbewijs: `screenshots/38-logboek-niet-geregistreerd.png`.

### Stap 39 — Diensten en apparaten

**Beoordeling:** Goed. Actieve dienst en medewerker herkenbaar; Afmelden noemt het doel. Alleen bekeken, niet afgesloten/afgemeld.

Stap 39: Diensten en apparaten — lokaal beeldbewijs: `screenshots/39-beheer-diensten-apparaten.png`.

### Stap 40 — Wachtwoordsheet en labels

**Beoordeling:** Goed. Eisen zijn tekstueel en via describedby gekoppeld; achtergrond inert; geen wachtwoord ingevoerd of gewijzigd.

Stap 40: Wachtwoordsheet en labels — lokaal beeldbewijs: `screenshots/40-portal-wachtwoord-labels.png`.

### Stap 41 — Wachtwoordsheet met Tab naar acties

**Beoordeling:** Goed. Herhaal wachtwoord en Annuleren bereikbaar; de 440px sheet heeft 460px inhoud en kan intern scrollen. Geen fysiek mobiel toetsenbord gesimuleerd.

Stap 41: Wachtwoordsheet met Tab naar acties — lokaal beeldbewijs: `screenshots/41-portal-wachtwoord-scroll-acties.png`.

[tekstveld]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/TekstVeld.tsx#L14
[portallogin]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-login/PortalLogin.tsx#L217
[nieuwlid]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/ledenbeheer/NieuwLidOverlay.tsx#L179
[productbeheer]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L328
[knopstijlen]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/knopStijlen.ts#L36
[sheetknoppen]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-profiel/SheetKnoppen.tsx#L35
[afrekenen]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/verkoop/AfrekenenOverlay.tsx#L219
[zoekveld]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/ZoekVeld.tsx#L32
[lidzoeker]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/LidZoeker.tsx#L148
[assortiment]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/verkoop/Assortiment.tsx#L116
[pintoetsenbord]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/PinToetsenbord.tsx#L50
[moduskeuze]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ModusKeuze.tsx#L111
[staffpicker]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/dienst-starten/StaffPicker.tsx#L40
[dienstactief]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/bezetting-beheren/DienstActief.tsx#L316
[beheerlogin]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/BeheerLogin.tsx#L140
[modusframe]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ModusKeuze.tsx#L71
[componentreadme]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/README.md
[statcard]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/StatCard.tsx#L20

[prijsvalidatie]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L139
[prijssucces]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L149
[veldmoment]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/hooks/useVeldMoment.ts#L16
[naamsheet]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-profiel/NaamWijzigenSheet.tsx#L57
[accountretry]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-profiel/AccountTab.tsx#L71
[profielretry]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/hooks/queries/usePortalProfiel.ts#L90
[productsectie]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/assortimentbeheer/ProductBeherenOverlay.tsx#L317
[catalogusstatus]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/docs/features/beheerformulieren-catalogus.md#L302
[geldmelding]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/OnbekendeUitkomstMelding.tsx#L5
[geldtekst]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/lib/opslaan.ts#L24
[moneyrequest]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/lib/moneyRequest.ts
[geldherstel]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/EerdereGeldActie.tsx
[sluitverzoek]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/Overlay.tsx#L164
[sluitafspraak]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/docs/features/opslaan-sluiten-pending.md#L33

[portaltabmaat]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-dashboard/PortalDashboard.tsx#L14
[transactiefilters]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/portal-dashboard/TransactiesTab.tsx#L69
[verversstatus]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/VerversStatus.tsx
[lidselectiefocus]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/verkoop/Mandje.tsx#L116
[zijpaneelbreedte]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/components/ZijPaneel.tsx#L24
[verkooplayout]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/verkoop/VerkoopScherm.tsx#L264
[productgrid]: https://github.com/BramLambertJansen/ABAS/blob/62ca126b957a35cf7d8a60eb94c3951f404f9d44/src/features/verkoop/Assortiment.tsx#L205

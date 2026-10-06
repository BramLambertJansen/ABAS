# Gedeelde UI-bouwblokken

Zoek hier vóór je nieuwe UI maakt. Presentatie en interactiebasis horen hier;
validatie, bedragen, autorisatie en RPC's blijven bij hun feature/datalaag.
Het huidige in-app design system is leidend; het prototype beschrijft de eerste bouw.

## Keuzehulp

| Taak | Bouwblok | Varianten, states en huidige consumers |
|---|---|---|
| Gewone invoer | `TekstVeld` | `tone=rail/light`; expliciete `id`, `inputRef`, `fout`, `foutAlert`, `hint`, `labelVerborgen`. Login, portalprofiel, nieuw lid/product en wachtwoordvelden. |
| Bedrag invoeren | `TekstVeld prefix="€"` | Lichte presentatie, maat 44/48; prefix decoratief, geen parsing. Productprijs en startsaldo (ook nieuw product). |
| Lokale veldmelding | `VeldFout` | Alleen tekst bij blur/poging; `alert` alleen direct na opslagpoging. Bedrag-, naam- en adresvelden. |
| Knop | `knopStijlen.ts` | `KNOP_ACCENT_WIT`, `KNOP_ACCENT_DONKER`, `KNOP_RAND`; native én aria-disabled-stijl. Maat/layout blijven bij consument; grote actie `KNOP_DIALOOG_MAAT`. |
| Zoekinput | `ZoekVeld` + `ZoekIcoon` | Beheerlijsten. Andere zoekrollen mogen hun eigen input behouden; hetzelfde decoratieve icoon bij assortiment en lidzoeker. |
| Lid zoeken/kiezen | `LidZoeker` | Combobox met `useListbox`; loading/error/ready, retry, lege resultaten en laag saldo. Mandje. |
| Gesloten keuze | `Select` | Gedeelde listboxlogica; donkere staf-/activiteitkeuze. Geen gewone zoekinput van maken. |
| Statusfilter | `StatusFilter` | Chips met tellers; geselecteerde toestand en waarde bij aanroeper. Leden/productenbeheer. |
| Tabnavigatie | `TabList`, `TabPanel` | Stabiele ids, ARIA en toetsenbord. Bar/beheer automatisch; portal handmatig met Enter/Space. Vormgeving bij aanroeper. |
| Dialoog | `Overlay`, `OverlaySluitKnop` | Shell bepaalt modal/sheet; focus trap, achtergrond inert, scrolllock en focusherstel gedeeld. `detail` heeft vaste kop in modal, meescrollende kop in sheet. |
| Aanwezigheid dialoog | `OverlayPresence` / `overlayShield` | Gedeelde teller voorkomt openen van achtergrondmeldingen en geeft triggerfocus terug; geen tweede overlay voor een bevestiging. |
| Bewerken/opslaan | `OpslaanSectie` | `label`, `kop`, `status`, `statusTekst`, pending, wachtOpAnder, eigen fout. Product- en lidbeheer. |
| Leesfout zonder data | `LeesFout` + `useLeesHerstel` | Fout/retryplek blijft tijdens laden; aria-disabled voorkomt focusverlies, guard voorkomt dubbel verzoek; focus naar herstelde sectie bij succes. Account en beheer/bar. |
| Bestaande data verversen | `VerversStatus` | Oude data blijft beschikbaar bij verversfout; beleefde status, stabiele focusbare knop. Portal saldo/transacties. |
| Onbekend geldresultaat | `OnbekendeUitkomstMelding` + `GeldActieHerstel` | Expliciet controleren/afronden/annuleren op dezelfde UUID en invoer. Afrekenen, opwaarderen, nieuw lid. |
| Bewaarde geldactie | `EerdereGeldActie` | Dezelfde herstelpresentatie met naam-/bedragcontext; geen automatisch financieel verzoek bij mount/herladen. |
| Nieuw wachtwoord | `NieuwWachtwoordVelden` | Twee velden met regels en mismatchkoppeling; readOnly tijdens opslag. Portal/herstel. |
| Code/PIN | `CodeInvoer`, `PinToetsenbord` | Begrensde codeinvoer/keypad; eigen toetsenbordrol, geen gewone knopmigratie. Login, PIN en tweede factor. |
| Wie geeft uit? | `BezettingKeuze` | Bezettingskeuze met attributie bij feature/server; optioneel disabled tijdens geldactie. Afrekenen/opwaarderen/terugdraaien. |
| Merk/startscherm | `AuroraMerk`, `StartScherm` | Licht/donker merk; donkere presentatiewrapper met één main-landmark en centraal gradient. Geen auth/sessielogica in wrapper. |
| Persoon/rol | `InitialsAvatar`, `RoleBadge`, `MemberPill` | Begrensde avatarmaat/tone, rolbadge; pill rendert li voor DienstAfsluitenOverlay. |
| Statistiek | `StatCard` | `member` in Afrekenen/Terugdraaien; `metric` in DienstAfsluitenOverlay. |
| Productafbeelding | `ProductAfbeelding` | tile/row/detail, initialenfallback, decoratief waar naam al accessible is. Verkoop/beheer. |
| Zijpaneel | `ZijPaneel` | Vanaf 700 CSS-px 300–372px breed; smallere zoomlayout volle breedte met eigen scrollgebied. Mandje/DienstActief. |

## Voorbeelden en semantiek

```tsx
<TekstVeld id={naamId} inputRef={naamRef} label="Naam" tone="light" maat="48"
  value={naam} onChange={wijzigNaam} onBlur={naamMoment.bijBlur}
  fout={naamMelding} foutAlert={naamMoment.pogingAlert} readOnly={pending} />
<TekstVeld label="Nieuwe prijs" labelVerborgen tone="light" maat="44" prefix="€"
  inputMode="decimal" value={prijs} onChange={wijzigPrijs} />
<OpslaanSectie label="Prijs wijzigen" pending={pending} wachtOpAnder={anderBezig}
  fout={fout} status={status} statusTekst="Prijs opgeslagen">…</OpslaanSectie>
```

`TekstVeld` combineert fout, hint en externe aria-describedby-id's. Een expliciete
id en inputRef blijven intact. Externe `VeldFout` mag bij bestaande samengestelde
secties blijven als zijn id op het input gekoppeld is. readOnly blijft focusbaar;
native disabled verlaat de tabvolgorde. Gebruik aria-disabled als de actie tijdens
pending focus moet behouden; de click-/submit-handler moet dan zelf blokkeren.
De knopconstanten voegen alleen presentatie toe, geen guard.

Verplichte naamvelden (portal, nieuw lid, lidbeheer) starten zonder fout. Blur of
een bewuste lege opslagpoging toont `Vul een naam in.`; de poging focust het veld,
correctie verwijdert de melding. Ongewijzigd/pending zijn afzonderlijke blokkades.
Servervalidatie blijft leidend. `useVeldMoment.reset()` start na geslaagde
prijsopslag een onaangeraakte nieuwe invoer.

Blijvend geopende bewerksecties tonen `Niet opgeslagen`, een bezige actie en
tekstuele succesfeedback. Nieuwe invoer wist oud succes; een fout vervangt de
status bij die actie. Een korte portalsheet mag sluiten met een melding in Account.

Onbekende geldresultaten: controleren doet alleen inspectie; veilig afronden kan
bij ontbreken van een receipt de vastgelegde actie uitvoeren; definitief annuleren
sluit alleen een onbevestigde sleutel af en draait geen boeking terug. Velden
blijven bevroren. Een bevestigd herstel gebruikt dezelfde normale succescallback
(waaronder mandje legen); een geannuleerde startsaldoactie wist de oude invoer.

## Visuele rollen en bestaande uitzonderingen

Kleur, font, radii, typografierollen, gradients en schaduwen staan in
`tailwind.config.ts`. Nieuwe schermen kiezen `text-screen-title`,
`text-dialog-title`, `text-section-title`, `text-sm` voor body, `text-xs` voor
veldlabels, `text-metadata`/`text-detail` voor de bestaande secundaire rollen.
De eigen rollen bewaren de huidige pixelwaarden; dit is geen volledige migratie
van alle legacyteksten naar rem of een kleinere typografieschaal.

Surfaces kiezen rounded-card/rounded-control en shadow-surface, shadow-dialog,
shadow-dropdown, shadow-menu of de expliciete donkere/merkvariant. Accentschaduwen
en het railgradient worden uit dezelfde accentkleur afgeleid; SVG's erven
currentColor. Themawijziging vraagt nog contrast- en visuele controle.

Nieuw werk: gewone knop/invoer 44px met rounded-control; grote primaire
modalactie 50px met rounded-2xl. Bestaande 48/52/54px-controls blijven bewust
behouden. Portal-tabs groeien/wrappen bij vergrote letters. Bestaande iconbuttons,
chips en samengestelde controls zijn geen belofte dat alles al op 44px staat.
Een brede maatharmonisatie of verkleining van de tekstschaal vraagt een afzonderlijke
visuele beslissing en schermcontrole.

## Sluiten en taal

De keuze U06 van 6 oktober 2026 geldt: pending blokkeert alle sluitpaden;
Escape, backdrop en Sluiten/Annuleren vragen bij gewijzigde invoer inline
`Weggooien` of `Terug`. Gebruik `OverlaySluitKnop` voor expliciete sluitacties;
die gebruikt dezelfde controller. De detailheader en `SheetKnoppen` doen dit
automatisch. `Terug` bewaart de invoer en herstelt focus naar de sluittrigger.
Nogmaals Escape/backdrop verlaat de bevestiging; opnieuw Sluiten/Annuleren
houdt haar open. Ongewijzigde formulieren sluiten direct. Een bevestigde
opslag sluit via de succescallback, zonder weggooivraag.
Sluiten slaat niets op. Een aparte risicoafhankelijke bevestiging (zoals het
laatste activiteitstype) houdt zijn eigen veilige annulering.

**Klaar** beëindigt een scherm waarvan wijzigingen al live zijn opgeslagen;
**Contant** is de betaalmethode; **Uitnodiging** is de Nederlandse term. Gebruik
**Annuleren**, geen vervoegde korte opdracht. Formele schermlezer-/apparaat- en
echte zoomcontroles staan afzonderlijk in het frontendtestplan.

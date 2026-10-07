# Opvolging gezamenlijke frontendreview

De opdracht van 6 oktober 2026 autoriseert het oppakken van de bevindingen in
[het gezamenlijke rapport](../audits/2026-10-06-componenten-tokens/REVIEW.md).
Bronbaseline is main `62ca126b957a35cf7d8a60eb94c3951f404f9d44`. Uitvoering vindt
plaats in een aparte checkout; bestaande lokale wijzigingen en productie blijven intact.

## Gedrag en scope

- U01/U03/R02: reset prijsvalidatie na bevestigd succes; bewaar Account-retryfocus
  tijdens fout/laden/fout en herstel naar de Accountkop bij succes; focus na
  gewone lidselectie naar de gekozen naam, bij wissel terug naar de zoeker.
- R01: portalnavigatie, filters en refreshcontrols groeien/wrappen bij vergrote
  basisletters; transactietekst en bedrag overlappen niet. Ook de header kan wrappen.
- R03: onder 700 CSS-px stapelt de kassa assortiment en mandje. Beide blijven
  bereikbaar via scrollen; draft/lid blijven behouden. Ondersteuning blijft
  tablet/desktop, geen nieuwe telefoonbelofte. De test meet ook clippingvoorouders
  en hit testing, niet alleen rootoverflow.
- U02/U04: één lokale naamfeedbacktiming en tekst; opslagstatus bij alle
  productsecties, via bestaande OpslaanSectie en sectieStatus.
- C01/C02: bestaande gewone/prefixvelden en passende knoppen delen presentatie;
  ids/refs/foutkoppeling, readOnly/disabled en submitguards blijven behouden.
- U05: één herstelpresentatie voor bewaarde actie en onbekend resultaat binnen
  dialoog; drie expliciete acties, oorspronkelijke naam-/bedragcontext en UUID.
  Controleren schrijft geen boeking. Afronden hergebruikt vastgelegde invoer;
  annuleren gebruikt bestaand serverbewijs. Normale succescallbacks verwerken
  bevestigde receipts; er is geen geldverzoek bij mount/login/herladen. De
  inspectieguard voorkomt dat een oude UI een nieuwere lokale sleutel annuleert.
- C03/C05: centraal palet/gradient/schaduw, gedeeld zoekicoon en één donkere
  startschermwrapper; actuele kleuren en ontwerp blijven behouden.
- C04/C06: centrale rolentokens en volledige component-/patrooncatalogus. Geen
  brede maatwijziging of reductie van alle legacytekstgroottes in deze stap.
- U06: Bram heeft op 6 oktober gekozen dat alle sluitacties bij onopgeslagen
  invoer bevestiging vragen. `OverlaySluitKnop`, detailheader en SheetKnoppen
  gebruiken dezelfde controller als Escape/backdrop. Terug bewaart invoer en
  herstelt focus; Weggooien sluit. Ongewijzigd sluit direct; pending wint;
  succescallbacks sluiten zonder vraag. De zeven bestaande onopgeslagen
  formulieren zijn gemigreerd (nieuw/productbeheer, nieuw/lidbeheer en
  naam/wachtwoord/pincode in de portal). Historische T06-keuze is vervangen.

Backendreceiptbeleid, RPC-autorisatie, financiële historie en startsaldoregistratie
blijven volgens #143. Geen migratie of wijziging aan Supabase/Vercel-productie.
De SDK-conventies zijn gecontroleerd tegen [RPC](https://supabase.com/docs/reference/javascript/rpc)
en [getSession](https://supabase.com/docs/reference/javascript/auth-getsession);
getSession is clientcontext, serverguards bepalen bevoegdheid.

## Verificatie

`e2e/frontend-review.spec.ts` gebruikt uitsluitend fictieve Auth-/REST-antwoorden
en blokkeert overig extern browserverkeer. De matrix omvat portal 320/390/1280,
32px-basisletters en kassa 768/1024/1280 plus 512×384-layoutzoom. Geen claim dat
CSS-basisletters fysieke browserzoom of een schermtoetsenbord simuleren.

Regressies: prijs succes/volgende lege poging/fout, retryfocus met vastgehouden
antwoord en geen dubbele retry, gewone lidselectie/wissel, gekoppelde naamfout,
clipping en daadwerkelijke productbediening, draft bij tabwissel, financiële
controle/receipt/annulering met dezelfde payload en sleutel. De bestaande
pending-/sluitproeven volgen het nieuwe expliciete controlecontract.

Naast lint/typecheck/build: pure financiële tests (incl. concurrerende sleutels),
contrastbewaking met rolentokens, architectuur/policy/RLS/migratie/ADR-gates en
bestaande relevante e2e-suites. Voor financiële UI staat nog een volledige
proef tegen een geïsoleerde database vóór merge, als die lokaal beschikbaar is;
productie wordt daarvoor niet gebruikt. Fysieke apparaten, schermlezers en echte
200/400% browserzoom zijn aanvullend handmatig werk, geen automatische WCAG-goedkeuring.

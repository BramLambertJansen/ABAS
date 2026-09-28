# Magic link op `/beheer` verraadt of een e-mailadres een account heeft

Spec voor [issue #70](https://github.com/BramLambertJansen/ABAS/issues/70).

**Status: concept, wacht op akkoord van Bram.** Er is nog niets gekozen. De
aanbeveling hieronder is een voorstel. Alle beslissingen die bij Bram liggen
staan onderaan onder "Open vragen". De Developer begint pas na akkoord.

Hoort bij het concept-[ADR 0013](../adr/0013-accountbestaan-niet-geheim-op-auth-api.md).
Raakt ADR [0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)
(bij Bram's keuze "e-mail: magic link of wachtwoord"),
[0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md),
[0005](../adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md),
[0006](../adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
(het patroon voor een server-side auth-actie),
[0008](../adr/0008-auth-maillinks-via-token-hash.md),
[0009](../adr/0009-portal-sessie-eigen-cookienaam.md) en
[0011](../adr/0011-device-sessie-alleen-voor-gekoppelde-tablet.md)
(`/beheer/**` en `/auth/**` zijn in de middleware vrijgesteld).

## Doel

Vastleggen wat er aan accountbestaan lekt, waar dat lek zit en welke kant
we op gaan. Het lek zit in de Supabase Auth-API zelf, niet alleen in de
`/beheer`-pagina. Deze spec kiest tussen:

- het lek dichter maken aan de app-kant,
- de magic link op `/beheer` weghalen, of
- het restlek op API-niveau expliciet accepteren.

Daarnaast herstelt deze spec twee specs die nu iets beweren wat niet klopt
(zie "Documentcorrecties").

## Uitgangssituatie (na #99)

- `useBeheerLogin.ts` → `signInWithMagicLink` roept vanuit de browser
  `signInWithOtp({ email, options: { shouldCreateUser: false, ... } })` aan.
  Elke uitkomst eindigt in dezelfde `magic_link_sent`-staat, en fouten gaan
  alleen naar `logLocalError`. `BeheerLogin.tsx` toont altijd "Als er een
  account bij {email} hoort, hebben we een inloglink gestuurd."
- Het **gedrag** verraadt nog steeds of een adres een account heeft:
  1. **Statuscode.** `POST /auth/v1/otp` met `create_user: false`: onbekend
     adres geeft `422 otp_disabled` ("Signups not allowed for otp"), bekend
     adres geeft `200`. Dat staat in de netwerktab van `/beheer`, en is ook
     rechtstreeks op te vragen met de anon-key. Die sleutel is publiek, want
     hij zit in elke clientbundel.
  2. **Timing.** Bij een bekend adres wacht GoTrue op SMTP, bij een onbekend
     adres niet.
  3. **Rate limit.** Alleen een bekend adres kan
     `429 over_email_send_rate_limit` opleveren, omdat alleen daar echt
     gemaild wordt.
- Volgens de opdracht staat signup uit in het gehoste Supabase-project. Dat
  heb ik niet zelf tegen het gehoste project gecontroleerd (zie Open vraag
  1). Lokaal staat `enable_signup = true` in `supabase/config.toml`,
  vanwege de GoTrue-eigenaardigheid `supabase/auth#330` die daar beschreven
  staat.

## Onderzoek: waar het lek werkelijk zit

**Kernbevinding: de client kiest `create_user`, niet de server.**
`@supabase/auth-js` stuurt `create_user` gewoon mee in de request body
(`GoTrueClient.js`: `create_user: options.shouldCreateUser ?? true`). Wie de
anon-key heeft, kan dus zelf `POST /auth/v1/otp` sturen met
`create_user: false`, en ziet dan 422 of 200, **ongeacht wat `/beheer` of
`/portal` zelf meestuurt**. Dat orakel bestaat zolang:

- de e-mailprovider aanstaat, en
- magic link / e-mail-OTP op het project aanstaat.

Beide zijn nodig voor de portal (CLAUDE.md → Auth: "magic link of
wachtwoord, beide actief"). Voor zover ik weet heeft Supabase geen aparte
schakelaar om alleen `/auth/v1/otp` uit te zetten terwijl wachtwoordlogin
aan blijft. Dat moet nog geverifieerd worden (Open vraag 2).

Gevolg: **geen enkele optie hieronder dicht het statuscode-orakel op het
API-oppervlak.** Een optie kan alleen weghalen dat onze eigen app een
extra of makkelijker orakel biedt. Dat bepaalt hoe de opties wegen.

Verwante endpoints, ter volledigheid (niet door #70 genoemd, wel hetzelfde
soort lek):

- **`POST /auth/v1/recover`** (`resetPasswordForEmail`, Wachtwoord vergeten
  op `/beheer` en `/portal`) geeft voor beide gevallen 200, maar lekt via
  timing (SMTP) en via 429 (alleen bekend adres). Dezelfde klasse lek, al
  geaccepteerd in `wachtwoord-vergeten.md` → besluit 4 en de
  rate-limit-review van PR #69. Daar is alleen de UI neutraal gemaakt.
- **`POST /auth/v1/token?grant_type=password`** geeft voor beide gevallen
  `invalid_credentials`. Vermoedelijk is er wel een timingverschil (bcrypt
  alleen bij een bestaand account). Dat heb ik niet geverifieerd (Open vraag
  2). `portal-login.md` en de comment in `useBeheerLogin.ts` zeggen nu "het
  wachtwoordpad lekt niet". Dat klopt voor de response body, maar mogelijk
  niet voor de timing.

**Gevolg voor `portal-login.md` → Besloten door Bram, punt 2.** De
motivatie daar ("bij `true` bestaat #70's lek voor de portal niet, élk
adres doorloopt exact hetzelfde pad") klopt om twee redenen niet:

1. Een aanvaller stuurt zelf `create_user: false` en omzeilt zo de keuze
   van de portal.
2. Staat signup uit in het gehoste project, dan geeft GoTrue ook met
   `create_user: true` een 422 voor een onbekend adres. Bij `signup
   disabled` is dat vermoedelijk `signup_disabled` of `otp_disabled`, wat
   nog te verifiëren is (Open vraag 2). In productie gedraagt `true` zich
   dan voor onbekende adressen hetzelfde als `false`. Ook de belofte "elk
   geldig e-mailadres krijgt een werkende magic link" geldt dan niet.

Het besluit zelf is van Bram. Deze spec verandert het niet, maar legt het
voor als Open vraag 3.

## Opties

Per optie: wat blijft er lekken aan het API-oppervlak, hoe complex is het,
en wat is de impact op bestaande flows.

### Optie A: server-side route/action, altijd 200, vaste minimale responstijd

`/beheer` roept niet meer vanuit de browser `signInWithOtp` aan, maar een
Server Action of Route Handler (patroon ADR 0006, bv.
`src/app/(bar)/beheer/inloglink/route.ts` plus een helper in `src/lib/`).
Die roept server-side GoTrue aan en geeft altijd `200 { ok: true }` terug.
Het antwoord komt na een vaste minimale tijd, of de mail wordt verstuurd na
het antwoord (Next 15 `after()`), zodat de SMTP-wachttijd niet in de
responstijd zit.

- **Wat blijft lekken:** het directe `POST /auth/v1/otp` met de anon-key,
  dus alle drie de signalen (statuscode, timing, 429). Alleen de netwerktab
  van `/beheer` wordt schoon. `/auth/v1/recover` blijft lekken.
- **Complexiteit:** middel.
  - Een nieuw server-only entrypoint.
  - Een vaste-tijd- of `after()`-constructie, die op Vercel correct moet
    werken.
  - **Rate limiting verschuift.** GoTrue ziet dan elk verzoek vanaf het
    Vercel-IP. De per-IP-limieten van Supabase gelden dan voor alle
    gebruikers samen: één aanvaller kan de magic link voor iedereen
    blokkeren. Dat vraagt ofwel het echte client-IP doorsturen (Supabase
    ondersteunt dat voor zover ik weet alleen met een server-/service-key
    via een forwarded-for-header, nog te verifiëren, Open vraag 2), ofwel
    een eigen rate limit. Beide zijn nieuw in deze codebase.
  - `emailRedirectTo` moet server-side uit een vaste origin komen, niet uit
    `window.location`.
- **Impact op flows:** geen zichtbare UI-wijziging. De token_hash-mail (ADR
  0008) werkt ongewijzigd, want er is geen PKCE-verifier nodig. De
  middleware-vrijstelling voor `/beheer/**` (ADR 0011) dekt de route. Er
  komt een extra server-hop bij.
- **Oordeel:** veel werk voor een lek dat één `curl` verderop even groot
  blijft.

### Optie B: `shouldCreateUser: true` plus een filter dat alleen leden provisiont

`/beheer` stuurt `true`, net als de portal. Een filter zorgt dat alleen
leden een bruikbaar account krijgen. Dat kan achteraf (een ongekoppelde
`auth.users`-rij krijgt `denied`, zoals op de portal) of vooraf (een
Supabase "Before User Created"-auth-hook die niet-leden weigert).

- **Wat blijft lekken:**
  - Het `create_user: false`-orakel blijft volledig bestaan (zie
    Kernbevinding).
  - Weigert een hook vooraf, dan geeft die weigering zelf weer een
    afwijkende fout terug, en is het lek terug via een andere statuscode.
  - Laat je iedereen toe en filter je pas achteraf, dan geldt dat alleen als
    signup aanstaat.
- **Complexiteit:** laag in de client (één vlag), maar hoog in de gevolgen:
  - Het werkt alleen als signup aanstaat in het gehoste project. Staat
    signup uit (zie Uitgangssituatie), dan verandert `true` voor een
    onbekend adres niets.
  - Signup aanzetten is een projectbrede wijziging. Met `enable_signup =
    true` en zonder e-mailbevestiging kan iedereen via `/auth/v1/signup`
    wachtwoordaccounts aanmaken. RLS maakt die accounts onschadelijk, maar
    het is ruis, en het maakt van de app een verzender van mails naar
    willekeurige adressen.
  - Een auth-hook is een nieuw soort bouwsteen: een Postgres-functie of
    HTTP-hook, geconfigureerd in het dashboard, buiten de repo.
- **Impact op flows:** een onbekend adres krijgt op `/beheer` een werkende
  link en belandt daarna in de `denied`-staat van `useBeheerSession`. Er
  ontstaan `auth.users`-rijen zonder lid. Bestaande beheerders merken niets.
  Dit wijkt af van "bardienst/beheerder-accounts worden uitsluitend door een
  beheerder geprovisioned" (`docs/ARCHITECTURE.md` → "Provisioning voor
  #14", `portal-login.md` → Betrokken shell punt 2).
- **Oordeel:** lost het API-lek niet op en vergroot het aanvalsoppervlak.
  Niet aanbevolen.

### Optie C: magic link op `/beheer` weghalen

Bardienst en beheerder hebben verplicht een wachtwoord (CLAUDE.md → Auth,
ADR 0005). `BeheerLogin.tsx` houdt alleen e-mail + wachtwoord + "Wachtwoord
vergeten?" over. `signInWithMagicLink` verdwijnt uit `useBeheerLogin.ts`.

- **Wat blijft lekken:** het directe `POST /auth/v1/otp` blijft volledig
  bestaan, want de portal houdt de magic link. `/auth/v1/recover` blijft
  lekken via timing en 429, en dat endpoint roept `/beheer` zelf nog
  steeds aan. Tegenover de huidige staat na #99 wint deze optie op
  API-niveau dus niets: het `/beheer`-orakel was al gelijk aan het
  API-orakel.
- **Complexiteit:** laag, het is vooral code weghalen:
  - de methode-fieldset in `BeheerLogin.tsx`;
  - de `magic_link_sent`-staat;
  - de focuslogica rond `magicLinkSentRef`;
  - de e2e-cases in `e2e/wachtwoord-vergeten.spec.ts` en `e2e/a11y.spec.ts`
    die de magic link op `/beheer` raken.
- **Impact op flows (groter dan het lijkt):**
  - **Uitgenodigde leden zonder wachtwoord.** Een lid dat via de invite
    (`lid-account-invite.md`, #24) een account kreeg, heeft nog geen
    wachtwoord: er is geen instelscherm, dat is #17 en nog niet gebouwd.
    `updateUser({ password })` bestaat alleen in de herstelflow. Zo iemand
    logt vandaag vermoedelijk in met de magic link. Zonder magic link is
    "Wachtwoord vergeten?" de enige weg naar binnen. Dat werkt, maar voelt
    vreemd bij een eerste keer. Hoeveel echte leden in deze staat zitten,
    kan ik niet vaststellen (Open vraag 5).
  - **Wireframe.** `Bar App.dc.html` (regel 3002, 3014, 3023) toont
    "Inloglink per mail" als uitweg voor wie de pincode niet weet. Een
    afwijking van de wireframe is normale evolutie (CLAUDE.md →
    Designbestanden), maar het is wel een ontwerpbeslissing.
  - **ADR 0002 amenderen.** Bram koos daar expliciet "e-mail: magic link
    of wachtwoord". Weghalen amendeert dat besluit, en dat vraagt een ADR
    (zie ADR 0013, variant C).
  - `/auth/callback?next=bar` en `/beheer/callback` blijven nodig voor de
    invite- en herstelmails. Daar verandert niets.
- **Oordeel:** eenvoudig, maar met een functioneel verlies en zonder
  winst op het API-oppervlak. Alleen zinvol als Bram de magic link op
  `/beheer` om andere redenen niet meer wil: minder mail, en één duidelijke
  basis-inlog in lijn met ADR 0005.

### Optie D: restlek op API-niveau expliciet accepteren (huidige staat plus vastleggen)

De UI-maskering van #99 blijft zoals ze is. Er komt een ADR (0013) die
vastlegt: **accountbestaan is voor iemand met de anon-key niet geheim te
houden zolang het project e-mail-OTP aanbiedt. De app zorgt alleen dat haar
eigen UI het niet vertelt.** De documenten die iets anders beweren worden
gecorrigeerd.

- **Wat blijft lekken:** hetzelfde als bij A en C, en dat is dus ook wat bij
  A en C blijft lekken. De netwerktab van `/beheer` toont 422 of 200.
  Iemand die zo ver kijkt, kan hetzelfde met één `curl` doen.
- **Complexiteit:** alleen documentatie en een paar codecomments
  (`useBeheerLogin.ts` regel 76–83 en 91–96, `usePortalLogin.ts` regel
  17–22) die nu "lekt nooit" of "wachtwoordpad lekt niet" zeggen.
- **Impact op flows:** geen.
- **Wat het kost:** een expliciet aanvaard risico. Wie het e-mailadres van
  een lid kent, kan vaststellen dat die persoon een account heeft. Dat zegt
  niet welke rol. Er is geen saldo, geen transactie en geen sessie mee te
  krijgen. Bij Aurora gaat het om een ledenlijst van één vereniging. Of dat
  aanvaardbaar is, is een risico-afweging voor Bram (Open vraag 4).

### Niet als optie uitgewerkt: het lek echt dichten

Echt dichten zou betekenen dat `/auth/v1/otp` niet meer publiek bruikbaar
is. Bijvoorbeeld: een eigen magic-link-flow via `auth.admin.generateLink`
(service-role, server-side) met een eigen mailer en eigen rate limiting, en
e-mail-OTP op het project uitzetten, als Supabase dat los van wachtwoord
toestaat (Open vraag 2). Dat raakt ook de portal. Het vervangt een
Supabase-functie door eigen auth-code en verdient een eigen ticket plus
spike, als Bram het lek onaanvaardbaar vindt. Hier valt het buiten scope.

## Aanbeveling (voorstel, niet gekozen)

**Optie D**, met de documentcorrecties hieronder. Het lek zit in de
Supabase Auth-API, die met de publieke anon-key voor iedereen bereikbaar
is. A en C veranderen daar niets aan. A voegt een server-hop, een
rate-limitprobleem en nieuwe code toe voor een lek dat een `curl` verderop
even groot blijft. C kost een functie die uitgenodigde leden zonder
wachtwoord vermoedelijk nu gebruiken. B maakt het erger. D is eerlijk over
wat de app wel en niet kan garanderen, en voorkomt dat een volgende feature
opnieuw "maskering" of "`true` lost het op" als oplossing presenteert.

Wil Bram de magic link op `/beheer` om andere redenen kwijt (Open vraag 6),
dan kan C bovenop D, als aparte, bewuste amendering van ADR 0002. Vindt
Bram het restlek onaanvaardbaar (Open vraag 4), dan is geen van A–D genoeg,
en is "het lek echt dichten" een nieuw ticket.

## Betrokken shell(s)

Alleen `shells/bar`, route `/beheer`. Bij optie D en C raakt dit ook de
documentatie van `shells/portal` (portal-login.md), niet de code, behalve
een comment. Geen `useShell()`-afhankelijk gedrag.

## Geldlaag

Niet geraakt. Er beweegt geen geld, en `place_order`, `top_up` en de
reverse-RPC's veranderen niet. Attributie via bezetting en PIN (CLAUDE.md →
Architectuurbeslissingen) staat hier los van: het gaat alleen om het
inlogformulier van een persoonlijke e-mailsessie (ADR 0002).

## Datamodel-wijzigingen

Geen, bij alle vier de opties. Alleen optie B met een auth-hook zou een
Postgres-functie toevoegen. Die moet dan, volgens de regel in CLAUDE.md,
`EXECUTE` expliciet intrekken voor `PUBLIC`, en wordt bewaakt door
`supabase/tests/rpc_execute_grants.test.sql`.

## RPC's

Geen nieuwe en geen gewijzigde RPC's. Optie A voegt een server-side route
toe (patroon ADR 0006), geen RPC.

## Rolzichtbaarheid

Niet van toepassing: het gaat om het inlogformulier vóór er een rol bekend
is. De neutrale melding geldt voor iedereen gelijk.

## Randgevallen

| Geval | D (aanbevolen) | A | C |
|---|---|---|---|
| Onbekend adres, magic link | Neutrale melding. De netwerktab toont 422 | Neutrale melding, route geeft 200 | Geen magic link op `/beheer` |
| Bekend adres, magic link | Neutrale melding plus mail | idem, na vaste tijd of `after()` | n.v.t. |
| Rate limit bij een bekend adres | Neutrale melding. De netwerktab toont 429 | Neutrale melding. De route vangt 429 af | n.v.t. |
| Rate limit door aanvaller op één IP | Per client-IP (GoTrue) | **Geldt voor alle gebruikers samen**, tenzij het IP wordt doorgestuurd of er een eigen limiet komt | n.v.t. |
| Uitgenodigd lid zonder wachtwoord | Magic link werkt | Magic link werkt | Alleen via "Wachtwoord vergeten?" |
| Direct `POST /auth/v1/otp` met de anon-key | lekt | lekt | lekt (de portal houdt de magic link) |
| `/auth/v1/recover` (timing/429) | lekt, al geaccepteerd | lekt | lekt |

## Documentcorrecties (bij elke keuze)

#99 heeft zonder goedkeuring van Bram het besluit "maskeren in plaats van
vermijden" in twee specs gezet. Die passages worden teruggezet of vervangen.
Welke van de twee, is Open vraag 7. Het voorstel is vervangen: de tekst van
vóór #99 ("blijft lekken tot #70 zelf gebouwd wordt") klopt na de
UI-wijziging ook niet meer.

1. **`docs/features/portal-login.md`, regel ~296–304** (Schermflow → punt
   1, "Neutrale melding"). "(dat was daar de eigen #70-fix, sinds
   2026-09-28 gebouwd ...)" en "en sinds #70 doet `useBeheerLogin.ts` dat
   ook" worden: "`/beheer` toont sinds #99 dezelfde neutrale melding. Dat
   is alleen een UI-maskering, zie `beheer-magic-link-enumeratie.md`."
   (commit `d58dd89` en een deel van `aa1d303`).
2. **`docs/features/portal-login.md`, regel ~696–699** (Expliciet buiten
   scope). "Sinds 2026-09-28 volgt `useBeheerLogin.ts` hetzelfde patroon,
   met `shouldCreateUser: false` behouden: fouten worden gemaskeerd in
   plaats van vermeden." wordt: "Zie `beheer-magic-link-enumeratie.md`
   (#70)."
3. **`docs/features/wachtwoord-vergeten.md`, regel ~258–260**
   (Opvolgissues). "Gebouwd 2026-09-28: elke uitkomst geeft nu de neutrale
   melding." suggereert dat #70 is afgesloten. Dat wordt: "UI neutraal
   sinds #99; het gedrag lekt nog, zie `beheer-magic-link-enumeratie.md`."
4. **`docs/features/portal-login.md`, regel ~278–284 en ~726–730.** Dit is
   de motivatie van Bram's besluit punt 2. Deze spec wijzigt die tekst
   **niet** zelf, want het is een Bram-besluit. Het voorstel is een
   voetnoot dat de motivatie niet opgaat (zie Onderzoek). Of het besluit
   zelf blijft staan, is Open vraag 3.
5. **Codecomments**, na akkoord door de Developer:
   - `useBeheerLogin.ts` regel 76–83: "Lekt nooit een foutcode" moet
     "toont nooit een foutcode" worden, met een verwijzing naar ADR 0013.
   - `usePortalLogin.ts` regel 17–22: dezelfde nuance.
   - `useWachtwoordHerstellen.ts` regel 20–26: noemt de 429 al correct, en
     krijgt alleen een verwijzing.

## Expliciet buiten scope

- Het lek echt dichten op API-niveau (eigen magic-link-flow, e-mail-OTP
  uit). Dat wordt een apart ticket als Bram daarvoor kiest.
- Het timinglek van `/auth/v1/recover` en `/auth/v1/token`. Dat wordt
  alleen vastgelegd in ADR 0013, er wordt niets aan gebouwd.
- Een wachtwoord-instelscherm na de invite (#17). Dat wordt pas relevant
  als Bram voor C kiest.
- Een eigen SMTP-provider. Dat blijft buiten scope, zoals in
  `wachtwoord-vergeten.md`.
- Het portal-besluit `shouldCreateUser: true` zelf. Dat wordt alleen
  voorgelegd (Open vraag 3), niet gewijzigd.

## Open vragen voor Bram

1. **Staat signup in het gehoste Supabase-project echt uit?** Welke
   schakelaar precies: "Allow new users to sign up" onder Authentication →
   Sign In / Providers, of de e-mailprovider zelf? De opdracht zegt dat
   signup uitstaat, maar ik kan het project niet inzien. Het antwoord
   bepaalt of optie B iets kan doen en of het portal-besluit punt 2 in
   productie werkt. Het raakt ook de `supabase/auth#330`-waarschuwing: werkt
   wachtwoordlogin daar op dit moment?
2. **Mag de Developer (of de Tester) een korte spike doen tegen het
   gehoste project** om vier GoTrue-gedragingen te verifiëren? Ik heb ze
   niet getest:
   - (a) de statuscode voor een onbekend adres bij `create_user: true` en
     signup uit;
   - (b) of e-mail-OTP los van wachtwoordlogin uit te zetten is;
   - (c) of er een timingverschil zit in `grant_type=password`;
   - (d) of Supabase een doorgestuurd client-IP accepteert bij server-side
     aanroepen (alleen relevant voor optie A).
3. **Portal, besluit punt 2 (`shouldCreateUser: true`):** de motivatie
   ("bij `true` bestaat het lek niet") klopt niet, en bij signup uit werkt
   de belofte "elk geldig adres krijgt een werkende link" niet. Blijft het
   besluit staan met alleen een gecorrigeerde motivatie, of wil je het
   heroverwegen? Dat is een apart ticket, niet deze spec.
4. **Is het restlek aanvaardbaar?** Iemand die een e-mailadres kent, kan
   met de publieke anon-key vaststellen of dat adres een account heeft
   (niet welke rol). Zo ja: optie D, en ADR 0013 legt dat vast. Zo nee:
   geen van A–D is genoeg, en "het lek echt dichten" wordt een nieuw
   ticket met een spike.
5. **Zijn er nu bardienst- of beheerderleden die via een invite binnenkwamen
   en nog geen wachtwoord hebben?** Of leden die om een andere reden op de
   magic link van `/beheer` leunen? Dat is alleen relevant als optie C in
   beeld is.
6. **Wil je de magic link op `/beheer` los van #70 behouden?** De wireframe
   toont hem als uitweg bij een vergeten pincode, en ADR 0002 legde "magic
   link of wachtwoord" vast. Of wil je hem weg (optie C, amendering van
   ADR 0002)?
7. **De #99-passages in `portal-login.md` en `wachtwoord-vergeten.md`:
   terugzetten naar de tekst van vóór #99, of vervangen door de
   formuleringen onder "Documentcorrecties" punt 1–3?** Het voorstel is
   vervangen.
8. **Optie A, als je daarvoor kiest:** vaste minimale responstijd (welke
   waarde?) of mail versturen na het antwoord (`after()`)? En eigen rate
   limiting of het client-IP doorsturen?

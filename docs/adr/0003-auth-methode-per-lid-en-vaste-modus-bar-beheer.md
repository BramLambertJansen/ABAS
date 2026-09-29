# 0003 — Auth-methode is een per-lid either/or-keuze; modus (bar/beheer) is vast, niet wisselbaar binnen een sessie

**Geamendeerd door [ADR 0016](0016-dienst-hoort-bij-geregistreerde-app-sessies.md)
(dienst per sessie, 2026-09-29):** Beslissing 2 (losse modi, geen wisselknop)
blijft, en wordt nu server-side vastgelegd in `bar_sessions.mode` (een sessie
wisselt nooit van modus, `mode_locked`). Beslissing 3: "de ingelogde persoon
stelt de bezetting samen (...) andere leden loggen niet zelf in, ze liften op
die sessie" blijft, maar "die sessie" is de persoonlijke sessie van wie
ingelogd is, niet een gedeelde; en "het is dezelfde RPC-laag, ongeacht welke
sessie de aanroep doet" **vervalt**: de RPC's eisen een gekoppelde bar-sessie.
Beslissing 4: de verwijzing naar het geaccepteerde risico van de gedeelde
device-sessie (#34) **vervalt**.

**Beslissing 1 (either/or, "nooit allebei tegelijk") is aangevuld door
[ADR 0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
(2026-09-02)** — Bram heeft, bij het beoordelen van de #42-conceptspec die
dit ADR uitvoerde, vastgesteld dat wachtwoord altijd verplicht is voor
`bardienst`/`beheerder` en dat PIN een optionele, niet-exclusieve
snelkoppeling is (beide tegelijk mag, alleen PIN zonder werkend wachtwoord
niet). Beslissing 2/3/4 hieronder (modus-keuze, bar-modus-gedrag, doel van
login) blijven ongewijzigd geldend — alleen Beslissing 1 is met ADR 0005
vervangen voor de "welke inlogmethode(s) mag een lid hebben"-as. Lees ADR
0005 voor de volledige context; dit document blijft voor het overige de
geldende beschrijving.

Let op — nummering: dit amendement heette bij het schrijven ervan nog "ADR
0004"; het is hernummerd naar 0005 bij het mergen van `main` (issue #57/PR
#59 claimde 0004 eerst voor de PII-kolommen-RPC-gated-lezen-beslissing,
zie [ADR 0004](0004-pii-kolommen-vereisen-rpc-gated-lezen.md)). Verwijzingen
naar "ADR 0004" in commit-geschiedenis vóór deze merge bedoelen dit
document.

Status: **geïmplementeerd** voor het deel dat #14 bouwde (issue #14, PR #45,
gemerged 2026-08-27 — `/beheer`'s inlogflow en de scope-splitsing hieronder,
zie `docs/features/assortimentbeheer.md`); de auth-methode-instelling per
lid en een bar-modus bereikbaar via e-mail/wachtwoord blijven, zoals dit ADR
zelf al vaststelt (zie scope-splitsing), een apart, nog niet gebouwd issue —
dat is geen open punt van dit ADR maar de bewust afgesproken scope-grens
zelf. Oorspronkelijk geaccepteerd (Bram, vastgesteld). **Vult [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md)
aan**, vervangt 'm niet: het sessie-mechanisme dat ADR 0002 beschrijft
(één actieve Supabase Auth-sessie per browser, een nieuwe login *vervangt*
de vorige, geen twee gelijktijdige sessies) blijft exact zoals het daar
staat. Dit ADR verbreedt alleen de *reden*: e-mail/wachtwoord-login is niet
een beheer-specifiek mechanisme, het is één van twee methodes die een lid
zelf kiest — beheer is vandaag de enige bestemming die er al via bereikbaar
is.

## Context

Bij het bouwen van #14 (Assortimentbeheer, `docs/features/assortimentbeheer.md`)
ontstond de vraag of "inloggen met e-mail, dan bar/beheer kiezen" ook de
al gebouwde PIN-flow (issue #6, `docs/features/dienst-starten.md`, gemerged)
vervangt. Twee opties zijn aan Bram voorgelegd:

- (a) alleen voor beheer — bar blijft uitsluitend PIN, zoals vandaag.
- (b) overal — e-mail/wachtwoord vervangt PIN volledig, voor bar en beheer.

Bram's letterlijke antwoord: **"Het is of/of, je kan zelf instellen op je
account of je pin of email/ww wilt."** — geen van beide opties (a)/(b),
maar een derde: de keuze is niet systeembreed maar **per lid**, en geldt
voor beide modi tegelijk (niet "bar altijd PIN, beheer altijd e-mail").

Dit raakt drie dingen die al bestaan en gemerged zijn, en die dit ADR
expliciet *niet* herbouwt (zie Beslissing → scope-splitsing):

- `start_shift` (#6) — dienst starten met eigen PIN, tegen de gedeelde
  tablet-sessie.
- `add_shift_member`/`remove_shift_member`/`shift_members` (#7,
  `docs/features/bezetting-beheren.md`) — bezetting samenstellen zonder dat
  toegevoegde leden zelf inloggen.
- Het gedeelde device-sign-in-mechanisme (#32/#33,
  `docs/ARCHITECTURE.md` → "Device sign-in mechanism").

En het raakt hoe `docs/features/dienst-starten.md` → "Expliciet buiten
scope" de modus-keuze uit het prototype ("Bardienst draaien" vs. "Beheer")
destijds afwees: *"vervalt: in dit rebuild is beheerder een superset van
bardienst die binnen dezelfde bar-shell werkt, geen apart adminscherm"*.
Die uitspraak klopte binnen de aanname van dat moment (geen aparte
beheer-sessie bestond nog). ADR 0002 heeft die aanname al gecorrigeerd
(beheer kreeg een eigen sessie); dit ADR maakt de modus-keuze die daaruit
volgt nu expliciet — niet als terugkeer naar het prototype's ontwerp, maar
als rechtstreeks gevolg van "één sessie per browser, die vervangen wordt,
niet gedeeld" toegepast op meer dan alleen beheer.

## Beslissing

**1. Authenticatiemethode is een per-lid, instelbare either/or-keuze.**
Elk lid met een `bardienst`- of `beheerder`-rol kiest zelf, op het eigen
account, of het met PIN inlogt of met e-mail/wachtwoord — nooit allebei
tegelijk voor hetzelfde lid, geen systeembrede instelling, en geen vaste
koppeling tussen methode en modus ("bar = PIN" of "beheer = e-mail" zijn
geen regels, alleen de staat van vandaag omdat er nog geen andere weg
gebouwd is — zie scope-splitsing). Leden met alleen de `lid`-rol vallen hier
buiten: portal-login is al e-mail-only (CLAUDE.md → Auth), dat verandert
niet.

**2. Na inloggen, ongeacht methode, kies je een modus: bar of beheer.**
Modi zijn **losse instanties, niet een sessie die wisselt** — er is geen
in-app "wissel van modus"-actie. Overstappen van de ene modus naar de
andere vereist uitloggen en opnieuw inloggen. Dit is een generalisatie van
ADR 0002's sessie-vervang-mechanisme (`@supabase/ssr`, cookie-based, één
actieve sessie per browser) — geen nieuw mechanisme, hetzelfde toegepast op
een bredere set bestemmingen dan alleen "beheer krijgt een eigen sessie".

**3. Bar-modus is, ongeacht hoe je inlogde, functioneel identiek aan wat er
vandaag al bestaat.** De ingelogde persoon stelt de bezetting samen
(`start_shift` + `add_shift_member`/`remove_shift_member`, exact zoals
`docs/features/bezetting-beheren.md` het beschrijft) — andere leden loggen
niet zelf in, ze liften op die sessie. Attributie bij afrekenen
(`place_order`/`top_up`) blijft het bestaande `served_by`-mechanisme uit de
bezetting, ongewijzigd (CLAUDE.md → Architectuurbeslissingen). Er komt geen
tweede, apart bar-mechanisme voor wie via e-mail inlogde — het is dezelfde
RPC-laag, ongeacht welke sessie de aanroep doet; alleen de weg ernaartoe
("wie logt hier in, met PIN of e-mail") wordt breder.

**4. Doel van de login is toegangscontrole, geen fijnmazige
per-actie-beveiliging.** Dit sluit aan bij het al geaccepteerde risico rond
de gedeelde device-sessie (`docs/ARCHITECTURE.md` → "Accepted risk: device
sign-in has no tablet-trust check", issue #34) — dit ADR verandert dat
risico niet, het beschrijft alleen wie welke voordeur mag gebruiken, niet
hoe waterdicht elke voordeur is.

### Scope-splitsing: wat #14 hiervan bouwt, wat een nieuw issue wordt

Dit principe is groter dan #14 (Assortimentbeheer) alleen — het raakt #6 en
#32/#33, allebei al gemerged. Volledig herbouwen van de PIN-vs-e-mail-keuze
binnen #14 zou een op zichzelf staand ticket laten ontsporen in een herbouw
van al gemergede features, zonder dat daar een wireframe of acceptatiecriterium
voor bestaat. Daarom:

- **#14 bouwt**: het e-mail/wachtwoord-inlogformulier op `/beheer`,
  `members.auth_user_id`, en de beheerder-only RPC-verificatie via
  `auth.uid()` — dit was al ADR 0002's scope en verandert inhoudelijk niet.
  Nieuw t.o.v. de vorige versie van `docs/features/assortimentbeheer.md`:
  de openstaande vraag "bouwt #14 dit zelf of wacht het op #15/#24" is nu
  beslist — **#14 bouwt de koppeling + het inlogformulier zelf, minimaal**,
  niet de volledige portal-inlogflow van #15 en niet de
  self-service-uitnodigingsflow van #24 (zie
  `docs/features/assortimentbeheer.md` voor hoe minimaal).
- **#14 bouwt niet**: een auth-methode-instelling (PIN/e-mail kiezen) voor
  bestaande bardienst/beheerder-leden, en bar-modus bereikbaar maken via
  e-mail/wachtwoord-login. `start_shift`/`add_shift_member`/
  `remove_shift_member` (#6/#7) en het device-sign-in-mechanisme (#32/#33)
  blijven exact zoals ze zijn — geen acceptatiecriterium in #14 vraagt erom
  dat PIN-gebruikers ook e-mail krijgen, of andersom.
- **Geen zichtbare "bar"-knop in #14's inlogflow.** Punt 2 hierboven stelt
  een modus-keuze na inloggen vast als architectuurprincipe — maar #14's
  `/beheer`-inlogformulier leidt na een succesvolle login **direct** naar de
  productenlijst, zonder een keuzescherm met een tweede, niet-werkende
  "bar"-knop erbij. Reden: er bestaat vandaag geen bestemming om naar te
  routeren (geen wireframe, geen navigatie-ingang-ontwerp voor "hoe kom je
  van een e-mail-sessie in de bestaande bar-schermen") en een knop die niets
  doet is precies het soort placeholder dat CLAUDE.md afwijst ("geen
  placeholder die later 'wel even' wordt ingevuld"). Dit is geen schending
  van punt 2: er ís conceptueel een modus (beheer), er is alleen nog maar
  één bestemming om naartoe te routeren. Zodra het nieuwe issue (hieronder)
  een echte tweede bestemming bouwt, wordt dit dezelfde plek een echte
  keuze — niet een herontwerp.
- **Nieuw issue bouwt**: de auth-methode-instelling per lid (PIN of
  e-mail/wachtwoord, waar en hoe een lid dat zelf instelt — vermoedelijk
  ledenbeheer, dat zelf ook nog niet gebouwd is), bar-modus bereikbaar via
  e-mail/wachtwoord-login (het echte "bar of beheer"-keuzescherm met twee
  werkende opties, plus de navigatie-ingang ernaartoe vanaf de bar-shell
  root), en de vraag wat er gebeurt met bestaande leden die alleen
  `pin_hash` hebben (default-methode, migratiepad). Zie de volledige
  issue-tekst in de Architect-rapportage bij dit ADR — inmiddels
  [issue #42](https://github.com/BramLambertJansen/ABAS/issues/42).

  **Update (Docs, 2026-09-02):** de gok hierboven ("vermoedelijk
  ledenbeheer") is niet uitgekomen. Ledenbeheer is inmiddels gebouwd en
  gemerged ([issue #13](https://github.com/BramLambertJansen/ABAS/issues/13),
  PR #55, `docs/features/ledenbeheer.md`,
  `docs/ARCHITECTURE.md` → "Ledenbeheer (gebouwd en gemerged, #13, PR #55,
  2026-09-02)") zonder een auth-methode-instelling: die spec noemt dit
  onderwerp nergens, `LidBeherenOverlay.tsx` biedt alleen naam/rol/archief
  aan, geen PIN-vs-e-mail-keuze. #42 blijft dus volledig open en losstaand
  — de "waar dit wordt ingesteld"-vraag is niet langer "vermoedelijk
  ledenbeheer" maar een nog te bepalen plek binnen #42's eigen scope
  (mogelijk een uitbreiding van `LidBeherenOverlay.tsx`, mogelijk elders —
  aan de Architect van #42 om te beslissen, geen aanname hier).

## Effect op eerdere documenten

- **`docs/features/dienst-starten.md` → "Expliciet buiten scope"**: de
  bullet "Modus-keuze 'Bardienst draaien' vs. 'Beheer' uit het ontwerp —
  vervalt" krijgt een korte amendement-verwijzing naar dit ADR — de
  oorspronkelijke uitspraak beschreef terecht dat déze PIN-flow geen
  modus-keuze krijgt (dat klopt nog steeds, #6 wordt niet herbouwd), maar
  het bredere "vervalt" (alsof er nooit een modus-concept terugkomt) is
  achterhaald door ADR 0002/0003. De spec zelf wordt niet herschreven — #6
  is gemerged, gedrag verandert niet.
- **`docs/features/assortimentbeheer.md`**: "Let op — een echte
  openstaande vraag" is niet meer open (zie scope-splitsing hierboven);
  bijgewerkt om dit ADR te citeren in plaats van ADR 0002 alleen, en om de
  "geen bar-knop"-beslissing hierboven te reflecteren.
- **Issue #22** ("Alternatieve inlogmethoden bar-shell naast PIN"): ADR
  0002 noemde dit "inhoudelijk opgelost" door de beheer-e-mail-login. Met
  dit ADR is dat te vroeg gebleken — #22's titel gaat letterlijk over de
  **bar-shell**, en #14 raakt de bar-shell's PIN-flow niet. #22 is dus
  hooguit voor de helft (de beheer-kant) opgelost door #14; het nieuwe issue
  hierboven is de daadwerkelijke, volledige voortzetting van #22's
  oorspronkelijke scope. Zie de Architect-rapportage voor de aanbeveling
  aan Bram over hoe #22 en het nieuwe issue zich tot elkaar verhouden.

## Verworpen alternatieven

- **Alles nu herbouwen binnen #14** (optie waarbij #14 ook de
  auth-methode-instelling en bar-via-e-mail bouwt): verworpen — geen
  wireframe, geen acceptatiecriterium in #14 dat dit vraagt, en het zou een
  op zichzelf staand ticket (assortimentbeheer) laten uitgroeien tot een
  herbouw van #6/#32, met migratierisico voor bestaande PIN-only leden dat
  niet in #14's scope hoort.
- **Systeembrede instelling** ("de vereniging kiest PIN óf e-mail voor
  iedereen"): verworpen — Bram's antwoord is expliciet "je kan zelf
  instellen op je account", niet een instellingenscherm voor de vereniging
  als geheel.
- **Vaste koppeling methode↔modus** ("PIN is altijd bar, e-mail is altijd
  beheer"): verworpen — dat was optie (a), expliciet niet wat Bram koos.
  Dat vandaag alleen PIN→bar en e-mail→beheer gebouwd zijn is een
  scope-gevolg (zie scope-splitsing), geen regel.
- **Twee gelijktijdig actieve modi** (bar én beheer open naast elkaar in
  dezelfde browser): verworpen om dezelfde reden als ADR 0002's eigen
  verworpen alternatief (twee gelijktijdige sessies) — geen nieuwe
  sessie-infrastructuur voor een voordeel dat niemand vroeg; Bram's eigen
  woorden waren "je kan niet wisselen", niet "je kan twee tegelijk hebben".

## Gevolgen

- `docs/ARCHITECTURE.md` krijgt een nieuwe sectie "Auth-methode & modus" die
  dit principe vastlegt en de eerdere "Open, blocking issue #14's actual
  build"-paragraaf bijwerkt naar settled.
- `CLAUDE.md` → Auth wordt kort bijgewerkt (per CLAUDE.md's eigen "Regel
  over regels" — geen uitgebreide herhaling van dit ADR, alleen de
  samenvatting die een gate niet kan afdwingen).
- `docs/features/assortimentbeheer.md` is bijgewerkt: geen open vraag meer
  over zelf bouwen vs. wachten op #15/#24, en de "geen bar-knop"-beslissing
  hierboven is verwerkt in de Schermflow.
- `docs/features/dienst-starten.md` krijgt een korte amendement-verwijzing,
  geen herbouw.
- Een nieuw issue is geformuleerd (zie Architect-rapportage) voor de
  auth-methode-instelling per lid + bar-modus bereikbaar via
  e-mail/wachtwoord — dit is waar #6/#32 wél worden aangeraakt, met een
  eigen spec wanneer dat issue aan de beurt is.

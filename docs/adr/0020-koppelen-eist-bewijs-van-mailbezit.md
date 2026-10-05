# 0020 — Een lid koppelen aan een auth-account eist bewijs van mailbezit in de huidige sessie, gebonden aan het uitgenodigde account

Status: **geaccepteerd (2026-10-05)**. Bram heeft de keuzes voor deze opdracht
bij de Architect gelegd (item B van de review van 2026-10-05); de spec
[`docs/features/account-koppeling-bewijs.md`](../features/account-koppeling-bewijs.md)
geldt daarmee als goedgekeurd. Te bouwen in migratie `0040`. **Vervangt** de
matchregel uit [ADR 0006](0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
→ "Aanvulling (2026-09-21)" ("matchen op `auth.email()`"); de rest van die
aanvulling (geen foutcodes, stille no-op bij 0 of meer dan 1 match) blijft
staan. Raakt [ADR 0005](0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md),
[0008](0008-auth-maillinks-via-token-hash.md) en
[0013](0013-accountbestaan-niet-geheim-op-auth-api.md) niet.

## Herziening (2026-10-05, na review van de bouw in 73edbbf)

Beslissing 3 is vervangen en Beslissing 7 gecorrigeerd. Aanleiding, met
bron (Supabase Auth/GoTrue): bij het openen van een uitnodiging zet GoTrue
zelf een willekeurig wachtwoord op elk account zonder wachtwoord
(`verify.go:317-329`), en een magic-link-aanvraag voor een onbekend adres
maakt een account met een tijdelijk wachtwoord (`magic_link.go:84-91`). De
oorspronkelijke Beslissing 3 ("een ongekoppeld account met een wachtwoord
wordt niet gekoppeld") blokkeerde daardoor het hoofdpad zelf. Een
GoTrue-tijdelijk wachtwoord en een wachtwoord van een aanvaller zijn in de
database niet te onderscheiden; de nieuwe Beslissing 3 vraagt dat ook niet
meer. Details en Developer-delta:
[spec → Herziening](../features/account-koppeling-bewijs.md#herziening-2026-10-05-na-review-van-73edbbf).

## Context

`link_invited_member_account()` (`0012`) en `link_lid_member_account()`
(`0022`) zetten `members.auth_user_id` voor elke sessie waarvan
`auth.email()` gelijk is aan `members.email` van een uitgenodigd, nog
ongekoppeld lid. Een e-mailadres op een sessie is geen bewijs dat de
houder die mailbox leest:

- Het project staat signup toe (`enable_signup = true`; de portal gebruikt
  `shouldCreateUser: true`), en de anon-key is publiek (ADR 0013). Met
  "Confirm email" uit krijgt een wachtwoord-signup direct een sessie én een
  gevulde `email_confirmed_at` — zonder dat er ooit een mail geopend is.
  Of die instelling op het gehoste project aan staat, is onbekend.
- De RPC's zijn granted aan `authenticated` en dus rechtstreeks via
  PostgREST aan te roepen, niet alleen vanuit de callback-routes.
- Gekoppeld zijn is de toegang tot alles daarna: `src/lib/barLogin.ts` zoekt
  het e-mailadres bij het lid en logt in met het wachtwoord van dát
  auth-account; TOTP stelt de houder zelf in. Een vreemde die het adres van
  een uitgenodigde beheerder registreert, kan zo beheerder worden.

Een volgende feature die een koppel- of herkoppelpad toevoegt (e-mailwijziging
door het lid zelf, online opwaarderen met een betaalprovider-account,
een "account opnieuw koppelen"-knop) zou dezelfde shortcut kunnen nemen.
Daarom een ADR.

## Beslissing

**1. Koppelen vereist bewijs van mailbezit in de sessie die koppelt.** De
`amr`-claim van het JWT (door Supabase Auth ondertekend, per sessie
vastgelegd) moet een methode bevatten die alleen via een link of code uit de
mailbox tot stand komt: `invite`, `magiclink`, `otp` of `email/signup`.
`password`, `token_refresh`, `oauth`, `anonymous` en elke onbekende methode
tellen niet. `email_confirmed_at is not null` wordt óók geëist, maar alleen
als extra laag: met "Confirm email" uit zegt die kolom niets.

**2. Koppelen is gebonden aan het auth-account dat de uitnodiging aanmaakte.**
`inviteUserByEmail()` geeft het id van het auth-account terug; dat id gaat via
`mark_member_invite_sent` naar `members.invited_auth_user_id`. Alleen een
sessie met precies dat `auth.uid()` kan het lid koppelen. Een ander account
met hetzelfde adres (eerder of later geregistreerd) kan het nooit, ook niet
met een geldige magic link.

**3. Bij het koppelen worden het wachtwoord en alle MFA-factoren van het
account gewist (herzien 2026-10-05).** Wat vóór de koppeling op het account
stond, is niet door deze eigenaar aangetoond: een GoTrue-tijdelijk
wachtwoord, een wachtwoord van wie het adres vóór de uitnodiging
registreerde (pre-account-takeover), of een wachtwoord en TOTP-factor die
iemand zette via een sessie zonder mailbezit. Niet weigeren (dat blokkeert
het hoofdpad, zie Herziening) maar resetten, in dezelfde transactie als de
koppeling, alleen als er echt gekoppeld wordt. Het lid stelt daarna zelf
een wachtwoord in, zoals al na elke uitnodiging.

**4. Bij het koppelen eindigen alle andere Auth-sessies van dat account.**
Een sessie die vóór de koppeling op het account bestond, is niet door deze
eigenaar aangetoond. Zelfde mechanisme als `close_bar_session_internal`
(`0034`): de rij in `auth.sessions` verdwijnt, Supabase Auth weigert daarna
verversen. Met 3 samen: na de koppeling is de sessie die het bewijs
leverde het enige inlogmiddel op het account.

**5. De uitnodiging hoort bij het adres.** Een adreswijziging
(`update_member_email`) wist `invited_at` en `invited_auth_user_id`: naar
het nieuwe adres ging nog geen uitnodiging.

**6. Gearchiveerde leden worden niet gekoppeld.**

**7. Elk toekomstig koppelpad volgt 1 t/m 4.** Een nieuwe flow die een
andere `amr`-methode wil toelaten, voegt die expliciet toe in de spec van die
flow, met motivatie dat de methode mailbezit bewijst. Nooit `password`.
*(Gecorrigeerd 2026-10-05.)* Via `token_hash` (ADR 0008) geeft GoTrue voor
élk type `otp` (`verify.go:185`, `:285`), ook voor herstel en adreswijziging;
die sessies kunnen dus al koppelen, en terecht: ze bewijzen mailbezit van het
huidige adres. Alleen PKCE levert `recovery`/`email_change` als eigen methode
(`token.go:256`); die staan niet in de lijst, tot een PKCE-flow ze nodig
heeft.

## Gevolgen

- De callback-routes hoeven niet te veranderen: ze roepen dezelfde RPC's aan,
  die nu zelf het bewijs eisen.
- Een wachtwoordlogin koppelt nooit. Wie een uitnodiging kreeg maar nog niet
  gekoppeld is, moet de link uit de mail (of een magic link) gebruiken. Dat
  was al zo: alleen de callback-routes koppelen.
- Openstaande uitnodigingen van vóór `0040` krijgen hun
  `invited_auth_user_id` via een backfill uit `auth.users.invited_at`; waar
  dat niet eenduidig kan, wordt `invited_at` gewist en moet de beheerder
  opnieuw uitnodigen.
- Wie vóór het koppelen via "wachtwoord vergeten" een wachtwoord zette,
  verliest dat bij het koppelen (Beslissing 3) en stelt het opnieuw in.
  Bewust: zeldzaam, en veiliger dan een wachtwoord laten staan waarvan niet
  vast te stellen is wie het zette.
- Een TOTP-factor die vóór het koppelen op het account stond, moet opnieuw
  worden ingesteld.
- Een lid dat vóór de uitnodiging de portal probeerde ("Confirm email" aan),
  wordt gewoon gekoppeld: de uitnodiging hergebruikt dat onbevestigde
  account, en wat erop stond verdwijnt bij het koppelen.
- Het bewijs voor het GoTrue-gedrag is een integratietest in CI tegen de
  lokale Supabase-stack (spec → Tests), plus een eenmalige controle door
  Bram op het gehoste project na de merge.

**Restrisico, geaccepteerd.** Beslissing 4 verwijdert de Auth-sessie, maar
een al uitgegeven access token blijft voor PostgREST geldig tot het verloopt
(standaard een uur). Dat speelt alleen als iemand zonder mailbezit een sessie
op het uitgenodigde account wist te krijgen (alleen denkbaar met "Confirm
email" uit en een GoTrue-versie die op een signup naar een bestaand,
onbevestigd adres een sessie uitgeeft) én binnen dat uur de echte eigenaar
koppelt. Binnen dat uur kan dat token PostgREST aanroepen als het
gekoppelde lid (aal1, zonder bardienst-sessie); de Auth-API zelf
(`updateUser`, verversen) hoort het te weigeren omdat de sessie weg is. Dat
laatste bewijst de integratietest (spec → Tests, scenario 3); faalt het, dan
komt dit restrisico terug bij Bram. Dichten voor PostgREST hoort bij het
aparte item "JWT na afmelden" (zie ADR 0019 → Verworpen alternatieven);
"Confirm email" aanzetten op het gehoste project sluit het pad nu al.

## Verworpen alternatieven

- **Alleen `email_confirmed_at is not null` eisen.** Met "Confirm email" uit
  zet Supabase die kolom bij elke signup. Niet veilig ongeacht de
  projectinstelling, en dat was de eis.
- **Alleen binden aan het invite-user-id, zonder `amr`.** Met "Confirm email"
  uit kan een signup op een bestaand, onbevestigd adres (afhankelijk van de
  GoTrue-versie) een sessie op juist dat account opleveren. De binding houdt
  dan niets tegen.
- **De `amr`-methoden uit `auth.mfa_amr_claims` lezen in plaats van uit het
  JWT.** Even betrouwbaar, maar de `aal`-controle (`0034`) leest al uit het
  JWT; één bron voor sessie-eigenschappen.
- **Een bestaand account koppelen als `inviteUserByEmail` `email_exists`
  geeft.** Dat account kan van iemand anders zijn (met "Confirm email" uit is
  het zelfs bevestigd) en een wachtwoord van die ander hebben. Veilig
  koppelen vraagt een eigen flow (verplicht nieuw wachtwoord, alle sessies
  weg); zie de spec → Buiten scope.
- **Een ongekoppeld account met een wachtwoord weigeren** (de oorspronkelijke
  Beslissing 3). GoTrue zet zelf een wachtwoord bij het openen van een
  uitnodiging; dat blokkeerde elke koppeling. Vervangen door resetten.
- **Bij uitnodigen een bestaand onbevestigd account verwijderen en vers
  uitnodigen.** Lost alleen het geval vóór de uitnodiging op (het verse
  account krijgt bij het openen alsnog een tijdelijk wachtwoord), vraagt een
  service-role-RPC om `auth.users` op adres te zoeken, en een destructieve
  delete met een race tegen een net binnenkomende bevestiging. Na de reset
  overbodig.
- **`mark_member_invite_sent` laten eisen dat het account
  `auth.users.invited_at` heeft.** GoTrue zet die kolom ook bij een
  hergebruikt account; onderscheidt niets. Met de reset doet het er niet toe
  wie het account aanmaakte.
- **Het e-mailadres uit de JWT-claim blijven gebruiken.** Het adres komt nu
  uit `auth.users` bij `auth.uid()`: dezelfde waarde, maar geen afhankelijkheid
  van hoe een claim in de sessie terechtkwam.

# 0008 — Auth-maillinks werken via `token_hash`, niet via PKCE

Status: **voorgesteld** (Architect, 2026-09-23, bij
`docs/features/wachtwoord-vergeten.md`). Het magic-link-deel is al gebouwd
(`src/app/(bar)/beheer/callback/route.ts`, branch
`claude/keen-hopper-9gb5b1`).

## Context

`@supabase/ssr` gebruikt standaard de PKCE-flow: de mail bevat een link die
na verificatie terugkomt met `?code=...`, en die code is alleen in te
wisselen met de `code_verifier` die in een cookie staat van **de browser
die de link aanvroeg**. De Supabase auth-logs van 2026-09-23 lieten precies
zien wat dat in de praktijk betekent: magic link aangevraagd op een pc,
geopend op een telefoon → verificatie bij Supabase geslaagd, maar
`exchangeCodeForSession` faalt in `/beheer/callback` → terug op het
inlogformulier, zonder foutmelding.

Aanvragen op het ene apparaat en de mail openen op het andere is voor deze
vereniging het normale geval, niet de uitzondering: een beheerder vraagt
de link aan op het bar-tablet of de pc en leest mail op de telefoon.

## Beslissing

Elke Supabase-mail die een sessie oplevert (magic link, wachtwoordherstel,
later invite en e-mailwijziging) linkt via de mailtemplate rechtstreeks
naar een app-route met `?token_hash={{ .TokenHash }}&type=...`. De app
wisselt dat in met `verifyOtp({ token_hash, type })` — geen
`code_verifier` nodig, dus apparaat-onafhankelijk.

- De templates staan in het Supabase-dashboard (Authentication → Emails),
  niet in de repo. De featurespec die een mail toevoegt of wijzigt, noemt
  de exacte link.
- Routes die `?code=` al accepteerden, blijven dat doen: een mail van vóór
  de template-wijziging, of een template die (nog) niet is aangepast,
  blijft werken zoals voorheen.
- Waar het token niet bij het openen maar pas bij een gebruikersactie
  ingewisseld kan worden (zoals het herstelformulier), gebeurt het pas
  dan — mailscanners die links vooraf openen verbruiken het anders.

## Gevolgen

- Een link werkt in elke browser. Dat is niet zwakker dan PKCE voor dit
  doel: wie de mail kan lezen, kon met de oude link ook al inloggen; PKCE
  beschermt tegen een onderschepte `?code=`, niet tegen een onderschepte
  mail.
- Een gewijzigde template geldt voor de live omgeving én elke preview:
  `{{ .SiteURL }}` wijst altijd naar productie.

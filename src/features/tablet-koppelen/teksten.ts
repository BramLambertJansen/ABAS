/**
 * Alle zichtbare tekst van het koppelscherm op één plek
 * (docs/features/tablet-koppelen.md → open vraag 5, door Bram aangeleverd
 * op 2026-09-28). e2e-tests en axe leunen niet op deze letterlijke tekst,
 * alleen op rol en label-koppeling, zodat een tekstwijziging hier geen
 * test breekt.
 */
export const TEKSTEN = {
  kop: "Tablet koppelen",
  uitleg:
    "Deze tablet is nog niet gekoppeld aan de bar. Vul de koppelcode in; die heb je maar één keer nodig. De code staat bij het bestuur.",
  veldlabel: "Koppelcode",
  knop: "Koppelen",
  fouteCode: "Deze code klopt niet. Controleer hem en probeer het opnieuw.",
  nietGeconfigureerd:
    "Koppelen is op deze omgeving niet ingesteld. Log in met je e-mailadres om de bar te gebruiken.",
  /** Zelfde tekst als de link in DienstStarten (spec → Schermflow §1). */
  inloggenMetEmail: "Inloggen met e-mail",
  portalVraag: "Ben je lid en wil je je saldo bekijken?",
  portalLink: "Ga naar het portaal",
} as const;

/** De verwijzing naar `/portal` voor een lid dat op de bar-URL uitkomt. */
export const TOON_PORTAL_VERWIJZING = true;

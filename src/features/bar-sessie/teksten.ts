import type { SessieMeldingReden } from "@/lib/barSessie";
import type { AdminMeldingReden } from "@/lib/barState";

/**
 * Alle teksten van dienst-per-sessie, letterlijk uit docs/features/
 * dienst-per-sessie.md → Teksten (goedgekeurd door Bram, 2026-09-29; Bram
 * past ze later aan als dat nodig is). Toon zoals in `src/features/**`:
 * titels met een hoofdletter, foutregels klein met een gedachtestreepje,
 * "je", kort. Eén bestand, zodat een tekstwijziging één plek heeft.
 *
 * `{…}`-velden uit de spec zijn hier functies met dezelfde naam als in de
 * spec (`naam`, `tijd`, `activiteit`, `starter`).
 */

// ── Startscherm (namenlijst) ─────────────────────────────────────────────

export const STARTSCHERM = {
  titel: "Bar openen",
  ondertitel: "Tik op je naam om in te loggen.",
  emailLink: "Inloggen met e-mail",
} as const;

// ── Inlogscherm na een tik op een naam ───────────────────────────────────

export const INLOGGEN = {
  terug: "← andere naam",
  pinInstructie: "Voer je pincode in",
  pinToggle: "Inloggen met wachtwoord",
  wachtwoordLabel: "Wachtwoord",
  wachtwoordKnop: "Inloggen",
  wachtwoordToggle: "Inloggen met pincode",
  wachtwoordVergeten: "Wachtwoord vergeten?",
  pinNietMogelijk:
    "Met je pincode inloggen kan op dit apparaat pas nadat je hier een keer met je wachtwoord bent ingelogd.",
  lockout: "Je pincode is geblokkeerd na te veel foute pogingen. Log in met je wachtwoord.",
  foutWachtwoord: "onjuist wachtwoord",
  foutRateLimit: "te veel pogingen — wacht even en probeer het opnieuw",
  foutGeenAccount:
    "er is voor jou nog geen wachtwoord ingesteld — vraag een beheerder om een uitnodiging",
  foutNietToegestaan: "je kunt niet op de bar inloggen — vraag een beheerder",
  foutOverig: "er ging iets mis, probeer het opnieuw",
  vergetenUitleg: "Je krijgt een mail met een link om een nieuw wachtwoord in te stellen.",
  vergetenKnop: "Stuur herstellink",
  vergetenBevestiging:
    "Als er een account bij je naam hoort, is de mail onderweg. De link is 1 uur geldig.",
} as const;

/** "onjuiste pincode — nog {n} pogingen", en bij de laatste poging de tekst
 *  die naar het wachtwoord verwijst. */
export function foutPin(attemptsLeft: number | undefined): string {
  if (attemptsLeft === 1) {
    return "onjuiste pincode — nog 1 poging, daarna log je in met je wachtwoord";
  }
  if (typeof attemptsLeft === "number" && attemptsLeft > 1) {
    return `onjuiste pincode — nog ${attemptsLeft} pogingen`;
  }
  return "onjuiste pincode";
}

// ── Hervatscherm ─────────────────────────────────────────────────────────

export const HERVATTEN = {
  verder: "Verder",
  uitloggen: "Uitloggen",
} as const;

export function hervatTitel(naam: string): string {
  return `Verder als ${naam}?`;
}

export function hervatUitleg(naam: string): string {
  return `Dit apparaat is nog ingelogd als ${naam}.`;
}

export function hervatUitlegMetDienst(activiteit: string | null, tijd: string): string {
  return `De dienst (${activiteit ?? "geen activiteit"}, sinds ${tijd}) loopt nog.`;
}

// ── Dienst loopt op een ander apparaat ───────────────────────────────────

export const DIENST_ELDERS = {
  titel: "Er loopt al een dienst",
  voorBardienst: "Alleen een beheerder kan deze dienst overnemen of afsluiten.",
  overnemen: "Overnemen",
  afsluiten: "Afsluiten",
  uitloggen: "Uitloggen",
} as const;

export function dienstElders(input: {
  starter: string;
  tijd: string;
  activiteit: string | null;
  naam: string | null;
  laatstActief: string | null;
}): string {
  const activiteit = input.activiteit ?? "geen activiteit";
  const begin = `${input.starter} is om ${input.tijd} een dienst begonnen (${activiteit}).`;
  if (input.naam && input.laatstActief) {
    return `${begin} Die loopt op een ander apparaat, ingelogd als ${input.naam}, laatst actief om ${input.laatstActief}.`;
  }
  return begin;
}

export function dienstEldersWees(input: {
  starter: string;
  tijd: string;
  activiteit: string | null;
}): string {
  const activiteit = input.activiteit ?? "geen activiteit";
  return `${input.starter} is om ${input.tijd} een dienst begonnen (${activiteit}). Er is geen apparaat meer ingelogd in deze dienst.`;
}

// ── Overnemen, afsluiten en afmelden door een beheerder ──────────────────

export const BEHEERDER_INGREEP = {
  overnemenTitel: "Dienst overnemen?",
  overnemenUitleg:
    "De dienst gaat verder op dit apparaat. Op het andere apparaat kan niemand meer in deze dienst werken. Je komt zelf in de bezetting.",
  overnemenKnop: "Overnemen",
  annuleren: "Annuleren",
  overnemenToast: "Dienst overgenomen",
  afsluitenTitel: "Dienst afsluiten",
  afsluitenExtraRegel: "Deze dienst loopt op een ander apparaat. Daar stopt hij ook.",
  afmeldenTitel: "Apparaat afmelden?",
  afmeldenKnop: "Afmelden",
  afmeldenToast: "Apparaat afgemeld",
  foutAlEigenDienst: "je werkt al in een dienst — sluit die eerst af",
  foutDienstAlDicht: "deze dienst is al afgesloten",
  foutOverig: "er ging iets mis, probeer het opnieuw",
} as const;

export function afmeldenUitleg(naam: string): string {
  return `${naam} wordt op dat apparaat uitgelogd. Loopt daar een dienst, dan blijft die open zonder apparaat.`;
}

// ── Meldingen bij een gesloten sessie ────────────────────────────────────

export const MELDING_OK = "OK";

/** Bij een half ingevuld mandje komt er een regel bij. */
export const MELDING_MANDJE = "Wat nog in het mandje stond, is niet afgerekend.";

export const SESSIE_MELDINGEN: Record<SessieMeldingReden, { titel: string; uitleg: string }> = {
  inactief: {
    titel: "Je bent uitgelogd",
    uitleg: "Er is 60 minuten niets gedaan op dit apparaat.",
  },
  inactief_met_dienst: {
    titel: "Je bent uitgelogd",
    uitleg:
      "Er is 60 minuten niets gedaan op dit apparaat. De dienst loopt nog; een beheerder heeft een melding gekregen.",
  },
  overgenomen: {
    titel: "Je dienst is overgenomen",
    uitleg: "Een beheerder werkt nu op een ander apparaat in deze dienst.",
  },
  afgesloten_door_beheerder: {
    titel: "De dienst is afgesloten",
    uitleg: "Een beheerder heeft de dienst afgesloten vanaf een ander apparaat.",
  },
  afgemeld: {
    titel: "Je bent afgemeld",
    uitleg: "Een beheerder heeft dit apparaat afgemeld.",
  },
  rol_gewijzigd: {
    titel: "Je bent uitgelogd",
    uitleg:
      "Je account mag niet meer op de bar werken. Klopt dat niet, vraag dan een beheerder.",
  },
  geen_sessie: {
    titel: "Je bent uitgelogd",
    uitleg: "Log opnieuw in om verder te gaan.",
  },
};

// ── Melding voor de beheerder in de app ──────────────────────────────────

export const ADMIN_MELDING = {
  titel: "Dienst zonder apparaat",
  overnemen: "Overnemen",
  afsluiten: "Afsluiten",
  hintInBeheer: "Overnemen kan op de bar.",
} as const;

export function adminMeldingUitleg(input: {
  starter: string;
  activiteit: string | null;
  tijd: string;
}): string {
  return `De dienst van ${input.starter} (${input.activiteit ?? "geen activiteit"}, sinds ${input.tijd}) heeft geen ingelogd apparaat meer.`;
}

export function adminMeldingReden(reden: AdminMeldingReden, naam: string | null): string {
  const wie = naam ?? "Iemand";
  switch (reden) {
    case "inactief":
      return "Er is 60 minuten niets gedaan.";
    case "uitgelogd":
      return `${wie} is uitgelogd zonder af te sluiten.`;
    case "afgemeld":
      return "Het apparaat is afgemeld.";
    case "geen_bar_rol":
      return `${wie} mag niet meer op de bar werken.`;
  }
}

// ── Uitloggen ────────────────────────────────────────────────────────────

export const UITLOGGEN = {
  knop: "Uitloggen",
  keuzeTitel: "Je dienst loopt nog",
  keuzeUitleg: "Wil je de dienst afsluiten voor je uitlogt?",
  dienstAfsluiten: "Dienst afsluiten",
  openLaten: "Open laten en uitloggen",
  openLatenHint: "Een beheerder krijgt dan een melding.",
  annuleren: "Annuleren",
} as const;

export function ingelogdAls(naam: string): string {
  return `Ingelogd als ${naam}`;
}

// ── Gearchiveerd lid ─────────────────────────────────────────────────────
// De tekst bij de login (race met de lijst) is INLOGGEN.foutNietToegestaan;
// "tijdens de sessie" is SESSIE_MELDINGEN.rol_gewijzigd; en de bestaande
// "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid" staat
// in de messages van verkoop en opwaarderen.

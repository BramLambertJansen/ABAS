import { logLocalError } from "@/lib/clientErrors";

/**
 * Een lege eigen `members`-rij kan sinds ADR 0022 twee dingen betekenen: het
 * account is niet gekoppeld, óf het token hoort bij een Auth-sessie die
 * elders beëindigd is (uitgelogd, wachtwoord hersteld of gewijzigd) en leest
 * daarom niets meer (docs/features/sessie-na-afmelden.md → keuze 9). Deze
 * functie vraagt de sessie na bij GoTrue (`getUser`), dat een token van een
 * verwijderde sessie weigert.
 *
 * Bevestigd → `true` (de aanroeper toont "niet gekoppeld" zoals voorheen).
 * Niet bevestigd → dit apparaat lokaal afmelden en `false`: het inlogscherm
 * volgt via `onAuthStateChange`. Ook een netwerkfout geeft `false`: de
 * sessie is dan niet te bevestigen, en opnieuw inloggen is veilig. Alleen
 * die netwerkfout wordt lokaal gelogd; een geweigerde sessie is een
 * verwachte uitkomst (geen `reportClientError`).
 *
 * Gedeeld door `usePortalSession` en `useBeheerSession`. Geen
 * `@supabase/*`-import: elke hook geeft de `auth` van zijn eigen client mee
 * (cookie-isolatie, ADR 0009), zoals `src/lib/mfa.ts`.
 */
type AuthFoutLike = { status?: number } | null;

export type SessieAuthClient = {
  getUser: () => Promise<{ data: { user: unknown }; error: AuthFoutLike }>;
  signOut: (options: { scope: "local" }) => Promise<unknown>;
};

export async function bevestigSessieOfMeldAf(
  auth: SessieAuthClient,
  label: string,
): Promise<boolean> {
  let bevestigd = false;
  try {
    const { data, error } = await auth.getUser();
    if (error) {
      // Een antwoord van GoTrue (4xx) is een geweigerde sessie; al het
      // andere (geen status, 0, 5xx) is niet te bevestigen.
      const status = error.status ?? 0;
      if (status < 400 || status >= 500) {
        logLocalError(`${label} (getUser)`, error);
      }
    } else {
      bevestigd = data.user != null;
    }
  } catch (err) {
    logLocalError(`${label} (getUser)`, err);
  }
  if (bevestigd) return true;

  try {
    await auth.signOut({ scope: "local" });
  } catch (err) {
    logLocalError(`${label} (signOut)`, err);
  }
  return false;
}

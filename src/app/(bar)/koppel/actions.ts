"use server";

import { cookies, headers } from "next/headers";
import type { KoppelResultaat } from "@/features/tablet-koppelen/TabletKoppelen";
import {
  KOPPELCOOKIE_NAAM,
  barDeviceSecretUitEnv,
  controleerCode,
  koppelcookieOpties,
  maakKoppelcookie,
} from "@/lib/tabletKoppeling";

/**
 * Koppelt deze browser als bar-tablet (docs/features/tablet-koppelen.md →
 * Server-actie: koppelen, ADR 0011). De code komt alleen via deze
 * formulier-POST binnen, nooit via een URL. Server Actions hebben een
 * ingebouwde Origin-check; een aparte CSRF-maatregel is niet nodig.
 *
 * Bij succes zet dit alleen het cookie en geeft `{ gekoppeld: true }`
 * terug; het scherm doet daarna zelf een volledige navigatie naar `/`.
 * Geen `redirect("/")` hier: Next.js rendert het redirectdoel van een
 * Server Action dan in dezelfde response mee en laat de `Set-Cookie`s van
 * die interne render vallen (`actionsForbiddenHeaders`). De device-sessie
 * die de middleware daar aanmaakt, zou de browser dus nooit bereiken, en
 * `/` zou zonder sessie renderen. Een echte documentrequest naar `/` gaat
 * wel gewoon door de middleware (tabelrij 1: device-inloggen).
 */
export async function koppelTablet(formData: FormData): Promise<KoppelResultaat> {
  const invoer = formData.get("code");
  const secret = barDeviceSecretUitEnv();
  const uitkomst = await controleerCode(typeof invoer === "string" ? invoer : "", secret);

  if (uitkomst === "niet_geconfigureerd") {
    return { fout: "niet_geconfigureerd" };
  }
  if (uitkomst === "ongeldige_code") {
    // Nooit de ingevoerde waarde loggen.
    console.error("koppelen: ongeldige code");
    return { fout: "ongeldige_code" };
  }

  const waarde = await maakKoppelcookie(secret, Math.floor(Date.now() / 1000));
  if (waarde === null) {
    return { fout: "niet_geconfigureerd" };
  }

  // Secure alleen op https, zoals in de middleware
  // (`request.nextUrl.protocol`, dat Next.js ook uit x-forwarded-proto
  // afleidt). Lokaal en in CI op http://127.0.0.1 staat de flag uit.
  const protocol = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  (await cookies()).set(KOPPELCOOKIE_NAAM, waarde, koppelcookieOpties(protocol === "https"));

  return { gekoppeld: true };
}

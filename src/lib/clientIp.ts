import { isIP } from "node:net";

/**
 * Het IP-adres van de gebruiker voor de eigen loginlimiet
 * (docs/features/login-rate-limit.md → Server-kant → IP-adres, ADR 0017 →
 * Beslissing 3). Puur, zodat `node --test` het rechtstreeks draait
 * (test/clientIp.test.ts).
 *
 * Eerst `x-real-ip`, daarna de eerste waarde van `x-forwarded-for`: op
 * Vercel zet de proxy beide. Is geen van beide een geldig IP-adres, dan de
 * vaste sleutel `'onbekend'` (lokaal en in CI).
 *
 * Te controleren op productie: dat Vercel deze headers overschrijft en de
 * client ze niet kan meesturen.
 */

export const ONBEKEND_IP = "onbekend";

type HeaderBron = { get(name: string): string | null };

function geldig(value: string | null | undefined): string | null {
  const kandidaat = value?.trim();
  return kandidaat && isIP(kandidaat) !== 0 ? kandidaat : null;
}

export function clientIp(headers: HeaderBron): string {
  const realIp = geldig(headers.get("x-real-ip"));
  if (realIp) return realIp;
  const eerste = headers.get("x-forwarded-for")?.split(",")[0];
  return geldig(eerste) ?? ONBEKEND_IP;
}

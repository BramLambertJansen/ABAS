import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * TOTP-codes (RFC 6238: SHA-1, 30 seconden, 6 cijfers, wat Supabase Auth
 * gebruikt) voor de e2e-tests van de tweede factor (docs/features/
 * beheer-tweede-factor.md, ADR 0017). Zonder dependency: node:crypto.
 *
 * `FEMKE_TOTP_SECRET` is het vaste secret van de seed-factor van Femke Bos
 * (supabase/seed.sql). Alleen lokaal en in CI.
 */
export const FEMKE_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

function base32Naar(secret: string): Buffer {
  const alfabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const schoon = secret.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const teken of schoon) {
    const waarde = alfabet.indexOf(teken);
    if (waarde < 0) throw new Error(`ongeldig base32-teken: ${teken}`);
    bits += waarde.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** De code voor `secret` op tijdstip `nu` (ms). */
export function totpCode(secret: string, nu: number = Date.now()): string {
  const teller = Math.floor(nu / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(teller));
  const hmac = createHmac("sha1", base32Naar(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const getal =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(getal % 1_000_000).padStart(6, "0");
}

/**
 * Een code die nog minstens `marge` seconden geldig is: vlak voor de grens
 * van een 30-secondenvenster eerst wachten tot het volgende. Supabase Auth
 * accepteert ook het vorige venster (skew 1), dus dit is extra ruimte, geen
 * voorwaarde.
 */
export async function versTotpCode(secret: string, marge = 3): Promise<string> {
  const inVenster = (Date.now() / 1000) % 30;
  if (30 - inVenster < marge) {
    await new Promise((r) => setTimeout(r, (30 - inVenster) * 1000 + 100));
  }
  return totpCode(secret);
}

/** Tikt een code in op het gedeelde toetsenbord (`CodeInvoer`/`PinToetsenbord`:
 *  knoppen "Cijfer 0" … "Cijfer 9"). */
export async function vulCodeIn(page: Page, code: string): Promise<void> {
  for (const cijfer of code) {
    await page.getByRole("button", { name: `Cijfer ${cijfer}`, exact: true }).click();
  }
}

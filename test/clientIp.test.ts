import { test } from "node:test";
import assert from "node:assert/strict";

import { clientIp, ONBEKEND_IP } from "../src/lib/clientIp.ts";

/**
 * `clientIp` (docs/features/login-rate-limit.md → Server-kant → IP-adres):
 * header-volgorde, de lijst in `x-forwarded-for`, en ongeldige waarden.
 */

function headers(waarden: Record<string, string>) {
  const h = new Headers(waarden);
  return { get: (name: string) => h.get(name) };
}

test("x-real-ip gaat voor x-forwarded-for", () => {
  assert.equal(clientIp(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7");
});

test("zonder x-real-ip: de eerste waarde van x-forwarded-for", () => {
  assert.equal(
    clientIp(headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1, 10.0.0.2" })),
    "198.51.100.1"
  );
  assert.equal(clientIp(headers({ "x-forwarded-for": "  198.51.100.9  " })), "198.51.100.9");
});

test("IPv6 is een geldig adres", () => {
  assert.equal(clientIp(headers({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
});

test("een ongeldige x-real-ip valt terug op x-forwarded-for", () => {
  assert.equal(clientIp(headers({ "x-real-ip": "geen-ip", "x-forwarded-for": "198.51.100.2" })), "198.51.100.2");
});

test("geen of alleen ongeldige headers: de vaste sleutel 'onbekend'", () => {
  assert.equal(ONBEKEND_IP, "onbekend");
  assert.equal(clientIp(headers({})), "onbekend");
  assert.equal(clientIp(headers({ "x-real-ip": "", "x-forwarded-for": "" })), "onbekend");
  assert.equal(clientIp(headers({ "x-forwarded-for": "nonsens, 198.51.100.3" })), "onbekend");
  assert.equal(clientIp(headers({ "x-real-ip": "999.1.1.1" })), "onbekend");
});

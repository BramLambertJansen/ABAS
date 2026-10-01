"use client";

import { useState } from "react";
import { logLocalError } from "@/lib/clientErrors";
import {
  toPinFout,
  toWachtwoordFout,
  type BarLoginOpties,
  type PinLoginResultaat,
  type VergetenResultaat,
  type WachtwoordLoginResultaat,
} from "@/lib/barLoginTypes";

export type {
  BarLoginOpties,
  PinLoginFout,
  PinLoginResultaat,
  VergetenResultaat,
  WachtwoordLoginFout,
  WachtwoordLoginResultaat,
} from "@/lib/barLoginTypes";

async function post(pad: string, body: unknown): Promise<Record<string, unknown> | null> {
  const response = await fetch(pad, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * De client-kant van het inloggen op de bar (docs/features/dienst-per-sessie.md
 * → Inloggen op de bar): inlogopties voor een naam, inloggen met wachtwoord of
 * PIN, en wachtwoord vergeten. Alles loopt via de server-only Route Handlers
 * onder `/inloggen/`: het e-mailadres wordt op de server opgezocht en de
 * sessie server-side aangemaakt. Geen `log_client_error` (ADR 0015): er is nog
 * geen sessie.
 */
export function useBarLogin() {
  const [pending, setPending] = useState(false);

  /** Kan het lid op dit apparaat met de PIN inloggen? Bij een fout: alleen
   *  wachtwoord, zodat een storing nooit iemand buitensluit. */
  async function haalOpties(memberId: string): Promise<BarLoginOpties> {
    try {
      const body = await post("/inloggen/opties", { memberId });
      return {
        pinAvailable: body?.ok === true && body.pinAvailable === true,
        pinLocked: body?.ok === true && body.pinLocked === true,
        pinNeedsMfa: body?.ok === true && body.pinNeedsMfa === true,
      };
    } catch (err) {
      logLocalError("useBarLogin (opties)", err);
      return { pinAvailable: false, pinLocked: false, pinNeedsMfa: false };
    }
  }

  async function loginMetWachtwoord(
    memberId: string,
    password: string
  ): Promise<WachtwoordLoginResultaat> {
    setPending(true);
    try {
      const body = await post("/inloggen/wachtwoord", { memberId, password });
      if (body?.ok === true) return { ok: true };
      return { ok: false, code: toWachtwoordFout(body?.code) };
    } catch (err) {
      logLocalError("useBarLogin (wachtwoord)", err);
      return { ok: false, code: "unknown" };
    } finally {
      setPending(false);
    }
  }

  async function loginMetPin(memberId: string, pin: string): Promise<PinLoginResultaat> {
    setPending(true);
    try {
      const body = await post("/inloggen/pin", { memberId, pin });
      if (body?.ok === true) return { ok: true };
      return {
        ok: false,
        code: toPinFout(body?.code),
        attemptsLeft: typeof body?.attemptsLeft === "number" ? body.attemptsLeft : undefined,
      };
    } catch (err) {
      logLocalError("useBarLogin (pin)", err);
      return { ok: false, code: "unknown" };
    } finally {
      setPending(false);
    }
  }

  /** Het antwoord is altijd neutraal (ADR 0013): ook een fout meldt zich als
   *  verstuurd. `limited`: de eigen limiet is bereikt en er ging geen mail
   *  (docs/features/login-rate-limit.md); ook dat zegt niets over een
   *  account. */
  async function vergeten(memberId: string): Promise<VergetenResultaat> {
    setPending(true);
    try {
      const body = await post("/inloggen/vergeten", { memberId });
      return { ok: true, limited: body?.limited === true };
    } catch (err) {
      logLocalError("useBarLogin (vergeten)", err);
      return { ok: true, limited: false };
    } finally {
      setPending(false);
    }
  }

  return { pending, haalOpties, loginMetWachtwoord, loginMetPin, vergeten };
}

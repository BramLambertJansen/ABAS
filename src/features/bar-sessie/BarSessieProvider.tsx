"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBarAuth } from "@/hooks/queries/useBarAuth";
import { useMijnDienst } from "@/hooks/queries/useMijnDienst";
import { useBarHartslag } from "@/hooks/queries/useBarHartslag";
import { useEndBarSession } from "@/hooks/queries/useEndBarSession";
import {
  STATE_POLL_INTERVAL_MS,
  browserSessionStorage,
  clearResume,
  confirmResume,
  isResumeConfirmed,
  msUntilInactive,
  onSessionCode,
  sessieMeldingReden,
  type SessieMeldingReden,
} from "@/lib/barSessie";
import { BarSessieContext, type BarSessie, type BarSessieFase, type SessieMelding } from "./BarSessieContext";
import { SessieMeldingOverlay } from "./SessieMeldingOverlay";

const MELDING_GEZIEN_PREFIX = "abas.bar.melding.";
const TOAST_DURATION_MS = 4000;

/**
 * De centrale afhandeling van de bar-sessie (docs/features/dienst-per-sessie.md
 * → Schermflow, Inactiviteit): één provider rond `/` en `/beheer` die
 *
 * - bijhoudt of er een Supabase-sessie is en wat `my_bar_state()` zegt;
 * - bepaalt in welke fase de browser staat (zie `BarSessieFase`), inclusief
 *   het hervatscherm na "browser dicht en weer open" (een vlag in
 *   `sessionStorage`);
 * - de hartslag zet (elke tik of toets, hooguit één per minuut) en de
 *   toestand elke 30 seconden stil ververst, zodat "Je dienst is
 *   overgenomen" en nieuwe beheerdermeldingen ook verschijnen zonder dat
 *   iemand iets aanraakt;
 * - elke sessiecode van een RPC (`notifySessionCode`) oppakt en de toestand
 *   ververst — de database is de waarheid, de client is alleen UX;
 * - bij een gesloten sessie de melding met de reden toont, lokaal uitlogt en
 *   het scherm in de juiste toestand zet (uitgelogd, of "geen eigen dienst").
 */
export function BarSessieProvider({ children }: { children: ReactNode }) {
  const auth = useBarAuth();
  const dienst = useMijnDienst(auth.status === "signed-in");
  const eindeSessie = useEndBarSession();

  const [bevestigd, setBevestigd] = useState<boolean>(() => isResumeConfirmed(browserSessionStorage()));
  // Na het lezen van sessionStorage in de eerste render kan de server-render
  // afwijken (geen storage): synchroniseer één keer na mount.
  useEffect(() => {
    setBevestigd(isResumeConfirmed(browserSessionStorage()));
  }, []);

  const [melding, setMelding] = useState<SessieMelding | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const toonToast = useCallback((tekst: string) => setToast(tekst), []);
  const mandjeGevuld = useRef(false);
  const opgeruimd = useRef(false);
  const hadSessie = useRef(false);
  const gezienMeldingen = useRef<Set<string>>(new Set());

  const zetMandjeGevuld = useCallback((gevuld: boolean) => {
    mandjeGevuld.current = gevuld;
  }, []);

  const toonMelding = useCallback((reden: SessieMeldingReden) => {
    setMelding({ reden, mandjeVerloren: mandjeGevuld.current });
  }, []);

  // ── Afgeleide toestand ─────────────────────────────────────────────────

  const state = dienst.status === "ready" ? dienst.state : null;
  const session = state?.session ?? null;

  let fase: BarSessieFase;
  if (auth.status === "loading") {
    fase = "laden";
  } else if (auth.status === "signed-out") {
    fase = "uitgelogd";
  } else if (dienst.status === "loading" || dienst.status === "idle") {
    fase = "laden";
  } else if (dienst.status === "error") {
    fase = "fout";
  } else if (!session) {
    // Was er zojuist nog een sessie? Dan is ze weg (geen bar-sessie meer): de
    // effect hieronder toont de melding en logt lokaal uit.
    fase = hadSessie.current ? "laden" : "geen_bar_sessie";
  } else if (session.status !== "active") {
    fase = "laden";
  } else if (!bevestigd) {
    // Een beheersessie wordt niet hervat (ADR 0016 → Beslissing 8): de effect
    // hieronder sluit haar. Tot dan een neutrale laadstand.
    fase = session.mode === "bar" ? "hervatten" : "laden";
  } else {
    fase = "actief";
  }

  // ── Lokaal uitloggen ───────────────────────────────────────────────────

  const { signOutLocal } = auth;
  const lokaalUitloggen = useCallback(async () => {
    clearResume(browserSessionStorage());
    setBevestigd(false);
    hadSessie.current = false;
    await signOutLocal();
  }, [signOutLocal]);

  // ── Gesloten sessie: melding, lokaal uitloggen ─────────────────────────

  const geslotenSessie = session && session.status !== "active" ? session : null;
  useEffect(() => {
    if (!geslotenSessie || opgeruimd.current) return;
    opgeruimd.current = true;
    const reden = sessieMeldingReden({
      status: geslotenSessie.status,
      endReason: geslotenSessie.endReason,
      leftShiftOpen: geslotenSessie.leftShiftOpen,
    });
    if (reden) toonMelding(reden);
    void lokaalUitloggen().finally(() => {
      opgeruimd.current = false;
    });
  }, [geslotenSessie, toonMelding, lokaalUitloggen]);

  // Er was een sessie en nu niet meer (bv. `no_bar_session` na een vernieuwing):
  // ook dat is een gesloten sessie, met de neutrale melding.
  const sessieWeg = state !== null && session === null && hadSessie.current;
  useEffect(() => {
    if (!sessieWeg || opgeruimd.current) return;
    opgeruimd.current = true;
    toonMelding("geen_sessie");
    void lokaalUitloggen().finally(() => {
      opgeruimd.current = false;
    });
  }, [sessieWeg, toonMelding, lokaalUitloggen]);

  useEffect(() => {
    if (session && session.status === "active") hadSessie.current = true;
  }, [session]);

  // ── Een beheersessie wordt niet hervat ─────────────────────────────────

  const nietHervatten = session?.status === "active" && session.mode === "beheer" && !bevestigd;
  const { endBarSession } = eindeSessie;
  useEffect(() => {
    if (!nietHervatten || opgeruimd.current) return;
    opgeruimd.current = true;
    void (async () => {
      const resultaat = await endBarSession(false, "niet_hervat");
      if (!resultaat.ok) await lokaalUitloggen();
      opgeruimd.current = false;
    })();
  }, [nietHervatten, endBarSession, lokaalUitloggen]);

  // ── Melding "overgenomen" / "afgesloten door beheerder" ────────────────
  // De sessie blijft ingelogd; de melding hoort één keer bij die dienst.

  const lastLeft = fase === "actief" && state?.session ? state.lastLeft : null;
  useEffect(() => {
    if (!lastLeft) return;
    const sleutel = MELDING_GEZIEN_PREFIX + lastLeft.shiftId;
    const storage = browserSessionStorage();
    let gezien = gezienMeldingen.current.has(sleutel);
    try {
      gezien = gezien || storage?.getItem(sleutel) === "1";
    } catch {
      // Storage geblokkeerd: dan alleen het geheugen.
    }
    if (gezien) return;
    gezienMeldingen.current.add(sleutel);
    try {
      storage?.setItem(sleutel, "1");
    } catch {
      // Zie hierboven.
    }
    toonMelding(lastLeft.reason);
  }, [lastLeft, toonMelding]);

  // ── Hartslag, poll, sessiecodes, inactiviteitstimer ────────────────────

  useBarHartslag(fase === "actief");

  const { poll, refetch } = dienst;
  const lopend = fase === "actief" || fase === "hervatten";

  useEffect(() => {
    if (!lopend) return;
    const timer = setInterval(poll, STATE_POLL_INTERVAL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [lopend, poll]);

  useEffect(() => onSessionCode(() => poll()), [poll]);

  // UX-spiegel van de inactiviteitstijd: net na het verwachte einde de
  // toestand verversen, ook als niemand iets aanraakt. De server bepaalt.
  const laatsteActiviteit = session?.lastActivityAt ?? null;
  useEffect(() => {
    if (!lopend || !laatsteActiviteit) return;
    const wacht = Math.min(msUntilInactive(Date.parse(laatsteActiviteit), Date.now()) + 1000, 2 ** 31 - 1);
    const timer = setTimeout(poll, wacht);
    return () => clearTimeout(timer);
  }, [lopend, laatsteActiviteit, poll]);

  // ── Acties ─────────────────────────────────────────────────────────────

  const { refresh } = auth;
  const naLogin = useCallback(async () => {
    confirmResume(browserSessionStorage());
    setBevestigd(true);
    await refresh();
    refetch();
  }, [refresh, refetch]);

  const naRegistratie = useCallback(() => {
    confirmResume(browserSessionStorage());
    setBevestigd(true);
    refetch();
  }, [refetch]);

  const bevestig = useCallback(() => {
    confirmResume(browserSessionStorage());
    setBevestigd(true);
  }, []);

  const uitloggen = useCallback(
    async (sluitDienst: boolean) => {
      const resultaat = await endBarSession(sluitDienst);
      if (!resultaat.ok) return false;
      clearResume(browserSessionStorage());
      setBevestigd(false);
      hadSessie.current = false;
      // Geen melding: dit is de eigen actie.
      await refresh();
      return true;
    },
    [endBarSession, refresh]
  );

  const actief = session && (fase === "actief" || fase === "hervatten") ? session : null;
  const foutMelding = dienst.status === "error" ? dienst.message : null;

  const waarde: BarSessie = useMemo(
    () => ({
      fase,
      foutMelding,
      session: actief,
      shift: actief && state?.session ? state.shift : null,
      otherShift: actief && state?.session ? state.otherShift : null,
      lastLeft: actief && state?.session ? state.lastLeft : null,
      notifications: actief && state?.session ? state.notifications : [],
      admin: actief && state?.session ? state.admin : null,
      herlaad: refetch,
      ververs: poll,
      naLogin,
      naRegistratie,
      bevestig,
      uitloggen,
      lokaalUitloggen,
      zetMandjeGevuld,
      toonToast,
      melding,
      sluitMelding: () => setMelding(null),
    }),
    [
      fase,
      foutMelding,
      actief,
      state,
      refetch,
      poll,
      naLogin,
      naRegistratie,
      bevestig,
      uitloggen,
      lokaalUitloggen,
      zetMandjeGevuld,
      toonToast,
      melding,
    ]
  );

  return (
    <BarSessieContext.Provider value={waarde}>
      {children}
      {melding && <SessieMeldingOverlay melding={melding} onClose={() => setMelding(null)} />}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center"
        >
          <span className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-lg">
            {toast}
          </span>
        </div>
      )}
    </BarSessieContext.Provider>
  );
}

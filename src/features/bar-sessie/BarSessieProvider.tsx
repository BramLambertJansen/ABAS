"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBarAuth } from "@/hooks/queries/useBarAuth";
import { EerdereGeldActie } from "@/components/EerdereGeldActie";
import { useMijnDienst } from "@/hooks/queries/useMijnDienst";
import { useBarHartslag } from "@/hooks/queries/useBarHartslag";
import { useEndBarSession } from "@/hooks/queries/useEndBarSession";
import {
  STATE_POLL_INTERVAL_MS,
  browserCookies,
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
 *   het hervatscherm na "browser dicht en weer open": het sessiecookie
 *   `abas_bar_bevestigd` met het `session_id` geldt voor alle tabbladen van
 *   deze browser (ADR 0017, docs/features/beheer-tweede-factor.md → B), en
 *   een sessie die niet te hervatten is (`resumable = false`) sluit de
 *   provider met `niet_hervat`;
 * - de hartslag zet (elke tik of toets, hooguit één per minuut) en de
 *   toestand elke 30 seconden stil ververst, zodat "Je dienst is
 *   overgenomen" en nieuwe beheerdermeldingen ook verschijnen zonder dat
 *   iemand iets aanraakt;
 * - elke sessiecode van een RPC (`notifySessionCode`) oppakt en de toestand
 *   ververst — de database is de waarheid, de client is alleen UX; bij
 *   `aal2_required` (beheer zonder tweede factor) logt hij lokaal uit, zodat
 *   de beheerlogin volgt;
 * - bij een gesloten sessie de melding met de reden toont, lokaal uitlogt en
 *   het scherm in de juiste toestand zet (uitgelogd, of "geen eigen dienst").
 */
export function BarSessieProvider({ children }: { children: ReactNode }) {
  const auth = useBarAuth();
  // Een andere login krijgt een nieuwe schermboom, ook als beide accounts
  // signed-in zijn. Mandje, modus-keuze, MFA-stap en lopende reads horen nooit
  // bij de volgende gebruiker. De afsluitmelding blijft buiten deze grens:
  // die moet juist na het lokaal uitloggen nog zichtbaar zijn.
  const sleutel = auth.status === "signed-in" ? `${auth.userId}:${auth.sessionId}` : auth.status;
  const [melding, setMelding] = useState<SessieMelding | null>(null);
  const [, setLoginVersie] = useState(0);
  const { refresh } = auth;
  // Een namenlijstlogin verandert juist de identiteit en ontkoppelt de oude
  // scope. Alleen deze expliciete login-bevestiging leeft buiten die scope.
  const bevestigLogin = useCallback(async () => {
    const id = await refresh();
    if (id) confirmResume(browserCookies(), id);
    setLoginVersie((v) => v + 1);
  }, [refresh]);
  return (
    <BarSessieScope key={sleutel} auth={auth} melding={melding} setMelding={setMelding} bevestigLogin={bevestigLogin}>
      {children}
    </BarSessieScope>
  );
}

function BarSessieScope({ children, auth, melding, setMelding, bevestigLogin }: {
  children: ReactNode;
  auth: ReturnType<typeof useBarAuth>;
  melding: SessieMelding | null;
  setMelding: (melding: SessieMelding | null) => void;
  bevestigLogin: () => Promise<void>;
}) {
  const dienst = useMijnDienst(auth.status === "signed-in");
  const eindeSessie = useEndBarSession();
  const leeft = useRef(true);
  useEffect(() => {
    const scope = leeft;
    scope.current = true;
    return () => { scope.current = false; };
  }, []);

  // Bevestigd: het hervat-cookie bestaat en hoort bij deze sessie. Elke render
  // leest het cookie opnieuw (goedkoop); `cookieVersie` dwingt een render af
  // na het zetten of wissen ervan. Buiten de browser en zolang de sessie nog
  // laadt is het `false`, dus server- en eerste client-render zijn gelijk.
  const sessionId = auth.status === "signed-in" ? auth.sessionId : null;
  const [, setCookieVersie] = useState(0);
  const bevestigd = isResumeConfirmed(browserCookies(), sessionId);
  const zetBevestigd = useCallback((id: string | null) => {
    if (!leeft.current) return;
    if (id) confirmResume(browserCookies(), id);
    else clearResume(browserCookies());
    setCookieVersie((v) => v + 1);
  }, []);

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
  }, [setMelding]);

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
    // Een sessie die niet te hervatten is (modus beheer, ADR 0016 → Beslissing
    // 8; of de bar-sessie van een beheerder zonder tweede factor, ADR 0017):
    // de effect hieronder sluit haar. Tot dan een neutrale laadstand.
    fase = session.resumable ? "hervatten" : "laden";
  } else {
    fase = "actief";
  }

  // ── Lokaal uitloggen ───────────────────────────────────────────────────

  const { signOutLocal } = auth;
  const lokaalUitloggen = useCallback(async () => {
    zetBevestigd(null);
    hadSessie.current = false;
    await signOutLocal();
  }, [signOutLocal, zetBevestigd]);

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

  // ── Een niet te hervatten sessie wordt gesloten ────────────────────────

  // Per sessie hooguit één keer: tussen het antwoord van de RPC en het
  // uitloggen kan de effect nog eens draaien met de oude toestand.
  const nietHervatSessie = session?.status === "active" && !session.resumable && !bevestigd ? session.id : null;
  const nietHervatGesloten = useRef<string | null>(null);
  const { endBarSession } = eindeSessie;
  useEffect(() => {
    if (!nietHervatSessie || nietHervatGesloten.current === nietHervatSessie || opgeruimd.current) return;
    nietHervatGesloten.current = nietHervatSessie;
    opgeruimd.current = true;
    void (async () => {
      const resultaat = await endBarSession(false, "niet_hervat");
      if (!resultaat.ok) await lokaalUitloggen();
      opgeruimd.current = false;
    })();
  }, [nietHervatSessie, endBarSession, lokaalUitloggen]);

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

  // `aal2_required`: een beheersessie zonder tweede factor. De sessie staat
  // voor de server nog, dus verversen verandert niets: lokaal uitloggen, en
  // daarna de beheerlogin (docs/features/beheer-tweede-factor.md).
  useEffect(
    () =>
      onSessionCode((code) => {
        if (code === "aal2_required") void lokaalUitloggen();
        else poll();
      }),
    [poll, lokaalUitloggen]
  );

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
    await bevestigLogin();
    if (leeft.current) refetch();
  }, [bevestigLogin, refetch]);

  const naRegistratie = useCallback(() => {
    zetBevestigd(sessionId);
    refetch();
  }, [refetch, sessionId, zetBevestigd]);

  const bevestig = useCallback(() => {
    zetBevestigd(sessionId);
  }, [sessionId, zetBevestigd]);

  const uitloggen = useCallback(
    async (sluitDienst: boolean) => {
      const resultaat = await endBarSession(sluitDienst);
      if (!resultaat.ok) return false;
      zetBevestigd(null);
      hadSessie.current = false;
      // Geen melding: dit is de eigen actie.
      await refresh();
      return true;
    },
    [endBarSession, refresh, zetBevestigd]
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
      setMelding,
    ]
  );

  return (
    <BarSessieContext.Provider value={waarde}>
      {children}
      {fase === "actief" && <EerdereGeldActie />}
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

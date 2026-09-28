"use client";

import { useEffect, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { useOpenOverlayCount } from "@/components/OverlayPresence";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import type { OpenShift } from "@/hooks/queries/useOpenShift";
import { openHours, shouldWarn } from "@/lib/dienstTeLangOpen";

/** Zelfde waarde als `DURATION_TICK_MS` in DienstActief.tsx (spec → Tijdbron
 *  en timer). */
const TICK_MS = 30_000;

type View = null | "melding" | "afsluiten";

/**
 * "Dienst staat nog open": herinnering zodra een dienst 6 uur of langer
 * openstaat, met een uur rust na "Nog bezig". Zie
 * docs/features/dienst-te-lang-open.md. Altijd gemount in `DienstTabs`
 * (sibling van de tabpanelen), dus over Verkoop én Dienst heen.
 *
 * Wacht tot er geen andere `Overlay` open is (ADR 0012): `view` gaat alleen
 * van `null` naar `"melding"` als de teller 0 is, en klikt daarna vast — de
 * eigen `Overlay` (en daarna `DienstAfsluitenOverlay`) telt zelf mee.
 */
export function DienstTeLangOpenMelding({
  shift,
  onShiftEnded,
}: {
  shift: OpenShift;
  onShiftEnded: () => void;
}) {
  const openOverlayCount = useOpenOverlayCount();
  const [now, setNow] = useState(() => Date.now());
  // Samen met het shift.id waarvoor hij gezet is: een snooze van een
  // eerdere dienst telt nooit mee (spec → Snooze-staat). Alleen geheugen,
  // geen web-opslag.
  const [snooze, setSnooze] = useState<{ shiftId: string; atMs: number } | null>(null);
  const [view, setView] = useState<View>(null);

  const snoozedAtMs = snooze && snooze.shiftId === shift.id ? snooze.atMs : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Browsers vertragen of pauzeren intervallen in de slaapstand; wie het
  // tablet openklapt, moet de melding direct zien (besluit 5).
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") setNow(Date.now());
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (view !== null || openOverlayCount > 0) return;
    if (shouldWarn({ startedAtIso: shift.startedAt, nowMs: now, snoozedAtMs })) {
      setView("melding");
    }
  }, [view, openOverlayCount, now, snoozedAtMs, shift.startedAt]);

  // "Nog bezig", Escape/achtergrond (besluit 10) en annuleren in het
  // afsluitoverzicht (besluit 8) zijn allemaal dezelfde keuze. Snooze vanaf
  // de tik zelf, niet vanaf de laatste tick (besluit 6).
  function snoozeNow() {
    const tappedAt = Date.now();
    setSnooze({ shiftId: shift.id, atMs: tappedAt });
    setNow(tappedAt);
    setView(null);
  }

  if (view === "afsluiten") {
    return (
      <DienstAfsluitenOverlay
        shift={shift}
        onClose={snoozeNow}
        onShiftEnded={onShiftEnded}
      />
    );
  }

  if (view !== "melding") return null;

  return (
    <Overlay
      title="Dienst staat nog open"
      description={`Deze dienst staat al ${openHours(shift.startedAt, now)} uur open. Klopt dat?`}
      onClose={snoozeNow}
    >
      <div className="mt-0.5 flex gap-2.5">
        <button
          type="button"
          onClick={snoozeNow}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Nog bezig
        </button>
        <button
          type="button"
          onClick={() => setView("afsluiten")}
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
        >
          Dienst afsluiten
        </button>
      </div>
    </Overlay>
  );
}

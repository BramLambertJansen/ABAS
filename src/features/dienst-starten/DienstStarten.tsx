"use client";

import { useState } from "react";
import { useOpenShift } from "@/hooks/queries/useOpenShift";
import { useBarStaff, type BarStaffMember } from "@/hooks/queries/useBarStaff";
import { useStartShift } from "@/hooks/queries/useStartShift";
import { StaffPicker } from "./StaffPicker";
import { PinPad, PIN_LENGTH } from "./PinPad";
import { DienstTabs } from "@/features/verkoop/DienstTabs";
import type { StartShiftErrorCode } from "@/hooks/queries/useStartShift";

/** "invalid_pin" also covers a bar-role member who never had a PIN set
 *  (pin_hash null) — same message either way, see
 *  docs/features/dienst-starten.md → Randgevallen (doesn't leak whether a
 *  PIN exists). no_bar_role/member_not_found shouldn't happen in practice
 *  (the staff picker is pre-filtered) but could if a role/archive change
 *  landed between loading the list and submitting — different message so
 *  it doesn't read as "you typed the PIN wrong" when the account itself
 *  changed. */
function pinErrorMessage(code: StartShiftErrorCode): string {
  switch (code) {
    case "invalid_pin":
      return "onjuiste pincode";
    case "no_bar_role":
    case "member_not_found":
      return "dit account kan geen dienst starten — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * Bar-shell entry screen — start a shift with your own PIN, or (if one's
 * already running on this shared tablet session) hand off to DienstTabs
 * (src/features/verkoop/), which owns the Verkoop/Dienst navigation added
 * by #8 — Verkoop (default) plus the existing DienstActief/bezetting-
 * beheren content (#7) under the Dienst tab. See
 * docs/features/dienst-starten.md for the start-shift spec and
 * docs/features/verkoop.md for the navigation this hands off to.
 */
export function DienstStarten() {
  const openShift = useOpenShift();
  const barStaff = useBarStaff();
  const startShiftMutation = useStartShift();

  const [selectedStaff, setSelectedStaff] = useState<BarStaffMember | null>(
    null
  );
  const [pin, setPin] = useState("");

  function selectStaff(member: BarStaffMember) {
    setSelectedStaff(member);
    setPin("");
    startShiftMutation.reset();
  }

  function backToStaffPicker() {
    setSelectedStaff(null);
    setPin("");
    startShiftMutation.reset();
  }

  async function pressDigit(digit: string) {
    if (startShiftMutation.status === "pending") return;

    // A previous attempt's 4 dots + error message stay on screen (matches
    // the design) until the next keypress — which starts a fresh PIN
    // rather than appending to the rejected one.
    const base = startShiftMutation.errorCode ? "" : pin;
    if (base.length >= PIN_LENGTH) return;
    if (startShiftMutation.errorCode) startShiftMutation.reset();

    const next = base + digit;
    setPin(next);

    if (next.length === PIN_LENGTH && selectedStaff) {
      const ok = await startShiftMutation.startShift(selectedStaff.id, next);
      if (ok) {
        openShift.refetch();
      }
    }
  }

  function backspace() {
    if (startShiftMutation.status === "pending") return;
    if (startShiftMutation.errorCode) {
      startShiftMutation.reset();
      setPin("");
      return;
    }
    setPin((p) => p.slice(0, -1));
  }

  // An open shift hands off to the Verkoop/Dienst tab navigation entirely
  // — its own full-page layout (light canvas, per docs/features/verkoop.md
  // → Navigatie), not another branch inside this dark PIN-entry screen.
  if (openShift.status === "ready" && openShift.shift) {
    return <DienstTabs shift={openShift.shift} />;
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-rail px-6 py-10 font-sans text-white">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-[0_10px_26px_-6px_rgba(238,90,36,0.7)]">
          A
        </div>
        <span className="text-[10.5px] font-bold tracking-[0.15em] text-rail-muted">
          AURORA MUZIEKVERENIGING
        </span>
      </div>

      {openShift.status === "loading" && (
        <p className="text-sm font-semibold text-rail-muted" role="status">
          Bezig met laden…
        </p>
      )}

      {openShift.status === "error" && (
        <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
          {openShift.message}
        </p>
      )}

      {openShift.status === "ready" && !openShift.shift && (
        <>
          {barStaff.status === "loading" && (
            <p className="text-sm font-semibold text-rail-muted" role="status">
              Bardienst-lijst laden…
            </p>
          )}

          {barStaff.status === "error" && (
            <p
              className="max-w-xs text-center text-sm font-semibold text-rail-error"
              role="alert"
            >
              {barStaff.message}
            </p>
          )}

          {barStaff.status === "ready" && !selectedStaff && (
            <>
              <h1 className="text-xl font-extrabold tracking-tight">
                Wie start de dienst?
              </h1>
              <StaffPicker staff={barStaff.staff} onSelect={selectStaff} />
            </>
          )}

          {barStaff.status === "ready" && selectedStaff && (
            <PinPad
              staffName={selectedStaff.name}
              pin={pin}
              errorMessage={
                startShiftMutation.errorCode
                  ? pinErrorMessage(startShiftMutation.errorCode)
                  : null
              }
              pending={startShiftMutation.status === "pending"}
              onDigit={pressDigit}
              onBackspace={backspace}
              onBack={backToStaffPicker}
            />
          )}
        </>
      )}
    </main>
  );
}

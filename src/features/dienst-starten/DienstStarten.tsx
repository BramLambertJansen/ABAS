"use client";

import Link from "next/link";
import { useState } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { useOpenShift } from "@/hooks/queries/useOpenShift";
import { useBarStaff, type BarStaffMember } from "@/hooks/queries/useBarStaff";
import {
  useActiviteitTypes,
  type ActiviteitType,
} from "@/hooks/queries/useActiviteitTypes";
import { useStartShift, isActivityTypeErrorCode } from "@/hooks/queries/useStartShift";
import { StaffPicker } from "./StaffPicker";
import { ActiviteitKeuze } from "./ActiviteitKeuze";
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
    case "shift_already_open":
      // Komt hier in de praktijk nooit: pressDigit haalt dan meteen de al
      // open dienst op, en dat scherm vervangt dit scherm.
      return "er ging iets mis, probeer het opnieuw";
    case "invalid_activity_type":
    case "activity_type_not_found":
    case "activity_type_archived":
      // Komt hier in de praktijk nooit — isActivityTypeErrorCode stuurt de
      // UI terug naar de activiteitkeuze-stap zodra een van deze drie
      // codes terugkomt (zie pressDigit/activityErrorMessage hieronder),
      // vóór dit scherm ooit met die fout rendert. Alleen hier om de switch
      // exhaustief te houden.
      return "er ging iets mis, probeer het opnieuw";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/** Foutmelding voor de activiteitkeuze-stap (stap 2) — de tegenhanger van
 *  pinErrorMessage voor stap 3. Zie docs/features/activiteittypes.md →
 *  Schermflow §2 stap 5 / Randgevallen. */
function activityErrorMessage(code: StartShiftErrorCode): string {
  switch (code) {
    case "invalid_activity_type":
      return "kies een activiteit";
    case "activity_type_not_found":
      return "dit activiteittype bestaat niet meer — kies opnieuw";
    case "activity_type_archived":
      return "dit activiteittype is niet meer actief — kies opnieuw";
    default:
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
  const activiteitTypes = useActiviteitTypes();
  const startShiftMutation = useStartShift();

  const [selectedStaff, setSelectedStaff] = useState<BarStaffMember | null>(
    null
  );
  const [selectedActivityType, setSelectedActivityType] =
    useState<ActiviteitType | null>(null);
  // Expliciete stap, niet afgeleid uit selectedStaff/selectedActivityType
  // zijn — stap 3 ("terug") gaat terug naar stap 2 zónder
  // selectedActivityType te wissen (spec → Schermflow §2 stap 3), dus
  // nullability van die twee velden alleen kan de stap niet meer eenduidig
  // bepalen zodra de gebruiker heen en weer navigeert.
  const [step, setStep] = useState<"staff" | "activity" | "pin">("staff");
  const [pin, setPin] = useState("");

  function selectStaff(member: BarStaffMember) {
    setSelectedStaff(member);
    setSelectedActivityType(null);
    setPin("");
    startShiftMutation.reset();
    setStep("activity");
  }

  function backToStaffPicker() {
    setSelectedStaff(null);
    setSelectedActivityType(null);
    setPin("");
    startShiftMutation.reset();
    setStep("staff");
  }

  function selectActivityType(activityType: ActiviteitType) {
    setSelectedActivityType(activityType);
    setPin("");
    startShiftMutation.reset();
    setStep("pin");
  }

  function backToActivityKeuze() {
    setPin("");
    startShiftMutation.reset();
    setStep("activity");
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

    if (next.length === PIN_LENGTH && selectedStaff && selectedActivityType) {
      const result = await startShiftMutation.startShift(
        selectedStaff.id,
        next,
        selectedActivityType.id
      );
      // `shift_already_open` (#29): intussen heeft iemand anders een
      // dienst gestart, bv. een tweede tabblad. Geen fout voor deze
      // gebruiker: gewoon die open dienst ophalen, net als na een geslaagde
      // start.
      if (result.ok || result.code === "shift_already_open") {
        openShift.refetch();
        return;
      }

      // activity_type_*-fouten (race: gearchiveerd tussen kiezen en PIN
      // bevestigen, of — puur defensief — een inmiddels niet-bestaand id)
      // horen niet bij een foute PIN. UI navigeert terug naar de
      // activiteitkeuze-stap met de foutmelding daar, lijst ververst — zie
      // docs/features/activiteittypes.md → Schermflow §2 stap 5 /
      // Randgevallen.
      if (isActivityTypeErrorCode(result.code)) {
        setSelectedActivityType(null);
        setPin("");
        setStep("activity");
        activiteitTypes.refetch();
      }

      // `no_bar_role`/`member_not_found` kan alleen als de rol of
      // archivering van dit lid veranderd is ná het laden van de
      // stafkeuze — de lijst filtert daar juist op (useBarStaff.ts). De
      // getoonde melding zegt al "dit account kan geen dienst starten";
      // deze refetch zorgt dat de tegel ook echt uit de keuze verdwijnt
      // in plaats van te blijven staan tot een herlaadactie. `invalid_pin`
      // blijft bewust ongemoeid: dat zegt niets over de lijst. Disjunct met
      // de activity_type_*-tak hierboven — start_shift retourneert per
      // aanroep precies één foutcode.
      if (result.code === "no_bar_role" || result.code === "member_not_found") {
        barStaff.refetch();
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
    return (
      <DienstTabs shift={openShift.shift} onShiftEnded={openShift.refetch} />
    );
  }

  return (
    <main className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-auto bg-rail px-6 py-8 font-sans text-white">
      {/* Oranje gloed bovenin, zoals het prototype (`noLogin`). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(238,90,36,0.16),transparent_60%)]"
      />
      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Bar openen</h1>
        <p className="text-[12.5px] font-semibold leading-normal text-rail-muted">
          Wie opent de bar vanavond?
        </p>
      </AuroraMerk>

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

          {barStaff.status === "ready" && step === "staff" && (
            <>
              <StaffPicker staff={barStaff.staff} onSelect={selectStaff} />
              {/* Universele voordeur, niet een noodpad — sinds #42
                  (docs/features/auth-methode-per-lid.md, ADR 0005) is
                  e-mail/wachtwoord de gegarandeerde inlogmethode voor élk
                  bardienst/beheerder-lid, en voor een lid zonder PIN (niet
                  meer in de StaffPicker-grid hierboven, zie
                  useBarStaff.ts) is dit de enige deur. Secundair gestileerd
                  (outline, geen accent-vulling) zodat de dagelijkse
                  PIN-flow het zwaarste gewicht houdt — zie de spec →
                  Definitieve keuzes punt 2 voor de volledige afweging. */}
              <Link
                href="/beheer"
                className="flex h-12 w-full max-w-[500px] items-center justify-center rounded-[15px] border border-rail-border text-sm font-bold text-rail-muted transition-colors hover:border-accent hover:text-rail-light"
              >
                Inloggen met e-mail
              </Link>
            </>
          )}

          {barStaff.status === "ready" && step === "activity" && selectedStaff && (
            <ActiviteitKeuze
              staffName={selectedStaff.name}
              activityTypes={
                activiteitTypes.status === "ready"
                  ? activiteitTypes.activityTypes
                  : []
              }
              loading={activiteitTypes.status === "loading"}
              loadErrorMessage={
                activiteitTypes.status === "error"
                  ? activiteitTypes.message
                  : null
              }
              errorMessage={
                startShiftMutation.errorCode &&
                isActivityTypeErrorCode(startShiftMutation.errorCode)
                  ? activityErrorMessage(startShiftMutation.errorCode)
                  : null
              }
              pending={startShiftMutation.status === "pending"}
              onSelect={selectActivityType}
              onBack={backToStaffPicker}
            />
          )}

          {barStaff.status === "ready" && step === "pin" && selectedStaff && (
            <PinPad
              staffName={selectedStaff.name}
              pin={pin}
              errorMessage={
                startShiftMutation.errorCode &&
                !isActivityTypeErrorCode(startShiftMutation.errorCode)
                  ? pinErrorMessage(startShiftMutation.errorCode)
                  : null
              }
              pending={startShiftMutation.status === "pending"}
              onDigit={pressDigit}
              onBackspace={backspace}
              onBack={backToActivityKeuze}
              backLabel="← andere activiteit"
            />
          )}
        </>
      )}
    </main>
  );
}

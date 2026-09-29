"use client";

import { PinToetsenbord, PIN_LENGTH } from "@/components/PinToetsenbord";
import { StaffHeader } from "./StaffHeader";

/**
 * PIN-stap van dienst starten: `StaffHeader` plus het gedeelde
 * `PinToetsenbord` (donkere `rail`-variant) plus de terug-link. Het
 * puntjes-en-toetsen-deel staat sinds docs/features/portal-profiel.md (#17)
 * in src/components/, zodat de portal het hergebruikt.
 */
export function PinPad({
  staffName,
  pin,
  errorMessage,
  pending,
  onDigit,
  onBackspace,
  onBack,
  backLabel = "← andere bardienst",
}: {
  staffName: string;
  pin: string;
  errorMessage: string | null;
  pending: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-[18px]">
      <StaffHeader name={staffName} />

      <PinToetsenbord
        tone="rail"
        pin={pin}
        errorMessage={errorMessage}
        pending={pending}
        onDigit={onDigit}
        onBackspace={onBackspace}
      />

      <button
        type="button"
        disabled={pending}
        onClick={onBack}
        className="text-xs font-semibold text-rail-muted hover:text-rail-light disabled:opacity-50"
      >
        {backLabel}
      </button>
    </div>
  );
}

export { PIN_LENGTH };

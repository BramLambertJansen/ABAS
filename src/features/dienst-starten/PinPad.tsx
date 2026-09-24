"use client";

import { StaffHeader } from "./StaffHeader";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

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

      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-colors ${
              i < pin.length
                ? errorMessage
                  ? "bg-rail-error"
                  : "bg-accent"
                : "bg-rail-border"
            }`}
          />
        ))}
      </div>
      <span className="sr-only" role="status">
        {`Pincode: ${pin.length} van ${PIN_LENGTH} cijfers ingevoerd`}
      </span>

      <p className="h-5 text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      <div className="grid w-full grid-cols-3 gap-2.5">
        {KEYS.map((key, i) =>
          key === "" ? (
            <div key={`empty-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={key === "⌫" ? onBackspace : () => onDigit(key)}
              aria-label={key === "⌫" ? "Wis laatste cijfer" : `Cijfer ${key}`}
              className="flex h-14 items-center justify-center rounded-[14px] border border-rail-border bg-rail-card text-lg font-bold text-white transition-colors hover:border-accent hover:bg-[#262a31] disabled:opacity-50"
            >
              {key}
            </button>
          )
        )}
      </div>

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

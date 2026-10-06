"use client";

export const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

/**
 * Vier puntjes plus een 12-toetsenraster voor een 4-cijferige pincode.
 * Getild uit `src/features/dienst-starten/PinPad.tsx` toen de portal de
 * tweede plek werd (docs/features/portal-profiel.md → Schermflow §3,
 * "Toetsenbord, geen twee invoervelden"). `PinPad` is nu een dunne schil
 * hieromheen (`StaffHeader` plus terug-link).
 *
 * `tone` volgt de ondergrond: "rail" op de donkere bar-tablet-schermen,
 * "light" in de lichte portal-sheet (prototype `designs/Lid App.dc.html`,
 * `pad()`: witte toetsen met een lichte rand).
 *
 * A11y: de puntjes zijn `aria-hidden`, de voortgang staat in een sr-only
 * `role="status"`; de foutregel is een `role="alert"` die altijd in de DOM
 * staat, zodat een nieuwe melding wordt voorgelezen.
 *
 * `length` en `statusLabel` zijn instelbaar voor de 6-cijferige code van de
 * tweede factor (docs/features/beheer-tweede-factor.md → "eerst nagaan of
 * PinPad een instelbare lengte kan krijgen"); standaard de 4-cijferige PIN.
 */
export function PinToetsenbord({
  pin,
  errorMessage,
  pending,
  onDigit,
  onBackspace,
  tone,
  length = PIN_LENGTH,
  statusLabel = "Pincode",
}: {
  pin: string;
  errorMessage: string | null;
  pending: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  tone: "rail" | "light";
  /** Aantal cijfers (standaard 4, de PIN). */
  length?: number;
  /** Wat er ingevoerd wordt, voor de sr-only voortgang. */
  statusLabel?: string;
}) {
  const dark = tone === "rail";
  const dotFilled = errorMessage ? (dark ? "bg-rail-error" : "bg-danger") : "bg-accent";
  const dotEmpty = dark ? "bg-rail-border" : "bg-border";
  const keyClasses = dark
    ? "h-14 rounded-[14px] border-rail-border bg-rail-card text-white hover:bg-rail-key-hover"
    : "h-[54px] rounded-control border-border bg-white text-ink";

  return (
    <>
      <div className="flex justify-center gap-3" aria-hidden="true">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-colors ${
              i < pin.length ? dotFilled : dotEmpty
            }`}
          />
        ))}
      </div>
      <span className="sr-only" role="status">
        {`${statusLabel}: ${pin.length} van ${length} cijfers ingevoerd`}
      </span>

      <p
        className={`h-5 text-center text-sm font-bold ${dark ? "text-rail-error" : "text-danger"}`}
        role="alert"
      >
        {errorMessage ?? ""}
      </p>

      <div className={`grid w-full grid-cols-3 ${dark ? "gap-2.5" : "gap-[10px]"}`}>
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
              className={`flex items-center justify-center border text-lg font-bold transition-colors hover:border-accent disabled:opacity-50 ${keyClasses}`}
            >
              {key}
            </button>
          )
        )}
      </div>
    </>
  );
}

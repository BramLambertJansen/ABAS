import { VERVERS_TEKSTEN } from "@/lib/verversen";

const TONES = {
  light: {
    text: "text-danger",
    knop: "border-border bg-white text-ink hover:border-ink focus-visible:outline-accent",
  },
  rail: {
    text: "text-rail-error",
    knop: "border-rail-border bg-rail-card text-rail-light hover:border-accent focus-visible:outline-accent",
  },
} as const;

/**
 * Een leesfout met een herstelactie (docs/features/
 * leesfouten-herstel-actuele-data.md → Gedeelde onderdelen 4): de foutregel
 * (`role="alert"`, de tekst komt uit `loadErrorMessage`) en "Opnieuw
 * proberen". De knop is `aria-disabled` tijdens `bezig`, niet `disabled`: een
 * disabled knop verliest de focus (zelfde reden als `BeheerLogin`, #77), en
 * bij een mislukte retry moet de focus op de knop blijven. Minstens 44px
 * hoog. Een retry roept alleen de `refetch` van de betreffende hook aan, dus
 * er gaat geen invoer verloren.
 *
 * Alleen voor leesfouten zonder bruikbare data: bij blijvende data (de
 * portal toont dan de oude gegevens) is `VerversStatus` de plek en is de
 * melding `role="status"`.
 */
export function LeesFout({
  message,
  onRetry,
  bezig = false,
  tone,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  bezig?: boolean;
  tone: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`flex flex-col items-center gap-3 text-center ${className}`}>
      <p className={`text-sm font-bold ${t.text}`} role="alert">
        {message}
      </p>
      <button
        type="button"
        aria-disabled={bezig}
        onClick={() => {
          if (!bezig) onRetry();
        }}
        className={`flex h-11 items-center rounded-control border px-4 text-sm font-bold transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${t.knop}`}
      >
        {bezig ? VERVERS_TEKSTEN.opnieuwProberenBezig : VERVERS_TEKSTEN.opnieuwProberen}
      </button>
    </div>
  );
}

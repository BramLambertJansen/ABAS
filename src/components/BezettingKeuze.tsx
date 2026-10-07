import type { ShiftMember } from "@/hooks/queries/useShiftMembers";

/**
 * "Wie geeft uit?" / "Wie draait terug?": één persoon kiezen uit de actieve
 * bezetting, voor de attributie die een geld-RPC server-side tegen die
 * bezetting controleert (CLAUDE.md → "served_by komt uit de bezetting").
 * Gebruikt door AfrekenenOverlay, OpwaarderenOverlay en TerugdraaienOverlay
 * — stond eerst twee keer bijna letterlijk gekopieerd, de derde consument
 * (bestelling terugdraaien) was de aanleiding om het te delen.
 *
 * Alleen tonen bij twee of meer personen in de bezetting: bij één persoon
 * kiest de aanroeper die zelf (`effectiveId` in de overlays), er valt dan
 * niets te kiezen.
 */
export function BezettingKeuze({
  legend,
  crew,
  selectedId,
  onSelect,
  disabled = false,
}: {
  legend: string;
  crew: ShiftMember[];
  selectedId: string | null;
  onSelect: (memberId: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 rounded-card bg-canvas p-3">
      <legend className="float-left flex w-full items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
          {legend}
        </span>
        <span className={`text-[10.5px] font-bold ${selectedId ? "text-muted" : "text-danger"}`}>
          {selectedId ? "gekozen" : "verplicht"}
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {crew.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selectedId === option.id}
            onClick={() => { if (!disabled) onSelect(option.id); }}
            className={`min-h-control rounded-full border px-4 text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selectedId === option.id
                ? "border-accent bg-accent-active text-white"
                : "border-border bg-white text-ink hover:border-accent"
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

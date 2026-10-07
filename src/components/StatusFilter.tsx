"use client";

export type StatusFilterOptie = {
  id: string;
  label: string;
  aantal: number;
  actief: boolean;
  onKies: () => void;
};

/**
 * Statuschips met tellers, uit `LedenLijst` getild
 * (docs/features/beheerformulieren-catalogus.md, besluit 10). De aanroeper
 * houdt de gekozen waarde en de tellers bij; dit component tekent alleen.
 */
export function StatusFilter({
  opties,
  ariaLabel = "Status",
}: {
  opties: StatusFilterOptie[];
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-none flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {opties.map((optie) => (
        <button
          key={optie.id}
          type="button"
          aria-pressed={optie.actief}
          onClick={optie.onKies}
          className={`flex h-control items-center gap-2 whitespace-nowrap rounded-full border px-[18px] text-detail font-bold transition-colors ${
            optie.actief
              ? "border-ink bg-ink text-white"
              : "border-border bg-white text-muted-strong hover:border-ink"
          }`}
        >
          {optie.label}
          <span
            className={`text-[11px] font-extrabold ${optie.actief ? "text-white/70" : "text-muted"}`}
          >
            {optie.aantal}
          </span>
        </button>
      ))}
    </div>
  );
}

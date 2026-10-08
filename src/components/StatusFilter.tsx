"use client";

import { Chip } from "./Chip";

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
        <Chip
          key={optie.id}
          geselecteerd={optie.actief}
          onClick={optie.onKies}
        >
          {optie.label}
          <span className={`text-xs font-extrabold ${optie.actief ? "text-rail" : "text-muted"}`}>
            {optie.aantal}
          </span>
        </Chip>
      ))}
    </div>
  );
}

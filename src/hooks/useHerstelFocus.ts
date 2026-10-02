"use client";

import { useEffect, useState } from "react";

/**
 * Zet de focus ná de eerstvolgende render op een element. Tijdens pending is
 * de knop of het veld van de actie disabled/readOnly en de focus naar de
 * dialoogcontainer gegaan (Overlay, T05); na het antwoord hoort de focus terug
 * bij de sectie met het resultaat, niet op `body`
 * (docs/features/opslaan-sluiten-pending.md → Randgevallen → Focus).
 */
export function useHerstelFocus(): (el: HTMLElement | null) => void {
  const [doel, setDoel] = useState<{ el: HTMLElement | null } | null>(null);
  useEffect(() => {
    doel?.el?.focus();
  }, [doel]);
  return (el) => setDoel({ el });
}

"use client";

import { Overlay } from "@/components/Overlay";
import type { SessieMelding } from "./BarSessieContext";
import { MELDING_MANDJE, MELDING_OK, SESSIE_MELDINGEN } from "./teksten";
import { KNOP_ACCENT_WIT } from "@/components/knopStijlen";

/**
 * De melding bij een gesloten sessie of een dienst die is overgenomen of
 * afgesloten (docs/features/dienst-per-sessie.md → Schermflow punt 6, Teksten
 * → Meldingen bij een gesloten sessie): één overlay met titel, uitleg en de
 * knop "OK". Bij een half ingevuld mandje komt er een regel bij. Escape en
 * een tik ernaast doen hetzelfde als "OK": er valt niets te kiezen.
 */
export function SessieMeldingOverlay({
  melding,
  onClose,
}: {
  melding: SessieMelding;
  onClose: () => void;
}) {
  const tekst = SESSIE_MELDINGEN[melding.reden];
  return (
    <Overlay
      title={tekst.titel}
      description={melding.mandjeVerloren ? `${tekst.uitleg} ${MELDING_MANDJE}` : tekst.uitleg}
      onClose={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className={`flex h-[50px] items-center justify-center rounded-2xl text-sm font-bold ${KNOP_ACCENT_WIT}`}
      >
        {MELDING_OK}
      </button>
    </Overlay>
  );
}

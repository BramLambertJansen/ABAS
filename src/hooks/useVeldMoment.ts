"use client";

import { useState } from "react";

/**
 * Het moment waarop een veld zijn fout toont (docs/features/invoerfeedback-
 * zoeken-filters.md → Veldfeedback): niet tijdens het eerste typen, wel na
 * `blur` (`aangeraakt`) of na een tik op de primaire knop (`pogingGedaan`).
 * Een ongewijzigd, nooit aangeraakt formulier toont niets. De aanroeper
 * beslist met deze vlaggen of de melding zichtbaar is; herstel is direct
 * omdat de fout zelf uit de huidige invoer volgt, niet uit deze state.
 * `pogingAlert` is alleen waar direct na een poging (tot de volgende
 * wijziging), zodat `role="alert"` niet bij elke toetsaanslag voorleest.
 */
export function useVeldMoment() {
  const [aangeraakt, setAangeraakt] = useState(false);
  const [pogingGedaan, setPogingGedaan] = useState(false);
  const [pogingAlert, setPogingAlert] = useState(false);
  return {
    aangeraakt,
    pogingGedaan,
    pogingAlert,
    reset: () => {
      setAangeraakt(false);
      setPogingGedaan(false);
      setPogingAlert(false);
    },
    bijBlur: () => setAangeraakt(true),
    bijWijzig: () => setPogingAlert(false),
    bijPoging: () => {
      setPogingGedaan(true);
      setPogingAlert(true);
    },
  };
}

"use client";

import type { ReactNode } from "react";
import { WACHT_OP_ANDERE_WIJZIGING_TEKST } from "@/lib/opslaan";

/**
 * Eén actiesectie in een beheerdialoog (docs/features/opslaan-sluiten-pending.md,
 * F10/F11). Draagt de drie dingen die per sectie hetzelfde zijn:
 *
 * - `aria-busy` zolang de eigen actie loopt (de knop toont dan "Opslaan…");
 * - de uitleg "wacht tot de lopende wijziging klaar is" als een andere
 *   sectie bezig is: een disabled knop zonder reden is een F10-fout;
 * - de eigen foutregel (`role="alert"`) bij de plek waar de gebruiker keek,
 *   zodat een fout van de ene actie niet door een andere wordt verdrongen
 *   (F11). De regel bestaat alleen zolang er een fout is, zodat er per
 *   scherm hooguit de actuele fouten als `role="alert"` staan.
 *
 * `chrome={false}` laat de omlijsting weg voor secties die zelf een knop zijn
 * (archiveren), zodat daar alleen hint en fout eronder komen.
 */
export function OpslaanSectie({
  pending,
  wachtOpAnder,
  fout,
  chrome = true,
  children,
}: {
  pending: boolean;
  wachtOpAnder: boolean;
  fout: string | null;
  chrome?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={pending || undefined}
      className={
        chrome
          ? "flex flex-col gap-2 rounded-control border border-border p-3.5"
          : "flex flex-col gap-1.5"
      }
    >
      {children}
      {wachtOpAnder && !pending && (
        <p className="text-xs font-medium text-muted">{WACHT_OP_ANDERE_WIJZIGING_TEKST}</p>
      )}
      {fout && (
        <p className="text-sm font-bold text-danger" role="alert">
          {fout}
        </p>
      )}
    </div>
  );
}

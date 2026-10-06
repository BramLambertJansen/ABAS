"use client";

import type { ReactNode } from "react";
import { WACHT_OP_ANDERE_WIJZIGING_TEKST, type SectieStatus } from "@/lib/opslaan";

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
  label,
  kop,
  status,
  statusTekst,
  children,
}: {
  pending: boolean;
  wachtOpAnder: boolean;
  fout: string | null;
  chrome?: boolean;
  /** Maakt de sectie een benoemde groep (`role="group"`). */
  label?: string;
  /** Sectiekop (titel en uitleg), boven de statusregel. */
  kop?: ReactNode;
  /** Zichtbare opslagstatus (docs/features/beheerformulieren-catalogus.md,
   *  besluit 5). `undefined`: geen statusregel (ongewijzigd gedrag). `null`:
   *  regel gereserveerd maar leeg. Zie `sectieStatus` in `src/lib/opslaan.ts`. */
  status?: SectieStatus;
  /** Tekst bij `opgeslagen` als "Opgeslagen" te algemeen is. */
  statusTekst?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      aria-busy={pending || undefined}
      className={
        chrome
          ? "flex flex-col gap-2 rounded-control border border-border p-3.5"
          : "flex flex-col gap-1.5"
      }
    >
      {kop}
      {status !== undefined && (
        // Altijd gemount en met gereserveerde hoogte: geen layoutsprong en
        // een schermlezer kondigt de wisseling aan. Tekstlabel, nooit alleen kleur.
        <p role="status" className="flex min-h-[18px] items-center gap-1 text-xs font-bold text-muted">
          {status === "onopgeslagen" && "Niet opgeslagen"}
          {status === "opgeslagen" && (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="flex-none">
                <path d="M2 6.5l2.7 2.7L10 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {statusTekst ?? "Opgeslagen"}
            </>
          )}
        </p>
      )}
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

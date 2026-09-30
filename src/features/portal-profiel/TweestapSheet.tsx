"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { CodeInvoer } from "@/components/CodeInvoer";
import { FOUT_OVERIG, TWEESTAP_TEKSTEN, type CodeFout } from "@/lib/mfa";
import type { TweestapStart } from "@/hooks/queries/usePortalTweestap";

type Stap =
  | { soort: "laden" }
  | { soort: "fout" }
  | { soort: "scannen"; factorId: string; qrCode: string; secret: string }
  | { soort: "code"; factorId: string };

/**
 * Sheet "Tweestapsverificatie instellen" (docs/features/
 * beheer-tweede-factor.md → Schermflow → Portal, tabblad Account; ADR 0017).
 * Drie stappen:
 *
 * 1. `mfa.enroll`: de QR-code en de geheime sleutel als tekst, om over te
 *    typen ("Volgende").
 * 2. De 6-cijferige code (`challenge` + `verify`), met "Bevestigen".
 * 3. De sheet sluit; de aanroeper toont de toast.
 *
 * Een niet-afgemaakte factor van een eerdere poging ruimt `start()` eerst
 * op. De teksten staan letterlijk in de spec → Teksten.
 */
export function TweestapSheet({
  start,
  bevestig,
  onClose,
  onIngesteld,
}: {
  start: () => Promise<TweestapStart>;
  bevestig: (factorId: string, code: string) => Promise<CodeFout | null>;
  onClose: () => void;
  onIngesteld: () => void;
}) {
  const [stap, setStap] = useState<Stap>({ soort: "laden" });
  const gestart = useRef(false);

  async function begin() {
    setStap({ soort: "laden" });
    const resultaat = await start();
    setStap(
      resultaat.ok
        ? { soort: "scannen", factorId: resultaat.factorId, qrCode: resultaat.qrCode, secret: resultaat.secret }
        : { soort: "fout" }
    );
  }

  useEffect(() => {
    // Eén keer per geopende sheet, ook onder React StrictMode.
    if (gestart.current) return;
    gestart.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij openen
  }, []);

  async function verifieer(code: string): Promise<CodeFout | null> {
    if (stap.soort !== "code") return "unknown";
    const fout = await bevestig(stap.factorId, code);
    if (!fout) onIngesteld();
    return fout;
  }

  const annuleer = (
    <button
      type="button"
      onClick={onClose}
      className="flex h-[52px] w-full items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
    >
      Annuleer
    </button>
  );

  return (
    <Overlay
      title={stap.soort === "code" ? TWEESTAP_TEKSTEN.stap2Titel : TWEESTAP_TEKSTEN.stap1Titel}
      onClose={onClose}
    >
      <div className="flex flex-col gap-[14px]">
        {stap.soort === "laden" && (
          <p className="py-6 text-center text-sm font-bold text-muted" role="status">
            Bezig met laden…
          </p>
        )}

        {stap.soort === "fout" && (
          <>
            <p className="text-sm font-bold text-danger" role="alert">
              {FOUT_OVERIG}
            </p>
            <button
              type="button"
              onClick={() => void begin()}
              className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
            >
              Opnieuw proberen
            </button>
            {annuleer}
          </>
        )}

        {stap.soort === "scannen" && (
          <>
            <p className="text-sm font-medium leading-relaxed text-muted">{TWEESTAP_TEKSTEN.stap1Uitleg}</p>
            <div className="flex justify-center rounded-2xl border border-border bg-white p-4">
              <Image src={stap.qrCode} alt="QR-code" width={180} height={180} unoptimized />
            </div>
            <code className="select-all break-all rounded-control border border-border bg-white px-3 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-ink">
              {stap.secret}
            </code>
            <div className="flex gap-[10px]">
              <button
                type="button"
                onClick={onClose}
                className="flex h-[52px] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
              >
                Annuleer
              </button>
              <button
                type="button"
                onClick={() => setStap({ soort: "code", factorId: stap.factorId })}
                className="flex h-[52px] flex-1 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
              >
                {TWEESTAP_TEKSTEN.stap1Knop}
              </button>
            </div>
          </>
        )}

        {stap.soort === "code" && (
          <>
            <p className="text-sm font-medium leading-relaxed text-muted">{TWEESTAP_TEKSTEN.stap2Uitleg}</p>
            <CodeInvoer tone="light" onVerifieer={verifieer} submitLabel={TWEESTAP_TEKSTEN.stap2Knop} />
            {annuleer}
          </>
        )}
      </div>
    </Overlay>
  );
}

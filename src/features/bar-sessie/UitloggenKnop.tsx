"use client";

import { useState, type ReactNode } from "react";
import { Overlay } from "@/components/Overlay";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { DienstAfsluitenOverlay } from "@/features/dienst-afsluiten/DienstAfsluitenOverlay";
import { useBarSessie } from "./BarSessieContext";
import { BEHEERDER_INGREEP, UITLOGGEN } from "./teksten";
import { Knop, type KnopMaat, type KnopTone, type KnopVariant } from "@/components/Knop";

/**
 * "Uitloggen" op de bar-schermen (docs/features/dienst-per-sessie.md →
 * Schermflow punt 4 en 5, besloten 17). Zonder open dienst logt het direct uit,
 * zonder vraag. Met een open dienst komt eerst de keuze "Je dienst loopt nog":
 * de dienst afsluiten (met dezelfde samenvatting als altijd,
 * `DienstAfsluitenOverlay`) of hem open laten, met een melding aan een
 * beheerder.
 *
 * `variant`, `tone`, `maat` en `children` laten de aanroeper de knop passend
 * maken (donker startscherm, smalle rail); `className` is alleen layout. De
 * logica blijft op één plek.
 */
export function UitloggenKnop({
  shift,
  variant,
  tone,
  maat,
  className,
  children,
}: {
  shift: OpenShift | null;
  variant?: KnopVariant;
  tone?: KnopTone;
  maat?: KnopMaat;
  /** Alleen layout (zie `Knop`). */
  className?: string;
  children?: ReactNode;
}) {
  const sessie = useBarSessie();
  const [keuzeOpen, setKeuzeOpen] = useState(false);
  const [afsluitenOpen, setAfsluitenOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function uitloggen(sluitDienst: boolean) {
    if (bezig) return;
    setBezig(true);
    setFout(null);
    const ok = await sessie.uitloggen(sluitDienst);
    setBezig(false);
    if (!ok) {
      setKeuzeOpen(false);
      setFout(BEHEERDER_INGREEP.foutOverig);
    }
  }

  function onClick() {
    setFout(null);
    if (shift) {
      setKeuzeOpen(true);
    } else {
      void uitloggen(false);
    }
  }

  return (
    <>
      <Knop
        variant={variant}
        tone={tone}
        maat={maat}
        className={className}
        onClick={onClick}
        aria-disabled={bezig}
      >
        {children ?? UITLOGGEN.knop}
      </Knop>
      <span role="alert" className={fout ? "text-[11px] font-semibold text-rail-error" : "sr-only"}>
        {fout ?? ""}
      </span>

      {keuzeOpen && shift && (
        <Overlay
          title={UITLOGGEN.keuzeTitel}
          description={UITLOGGEN.keuzeUitleg}
          onClose={() => !bezig && setKeuzeOpen(false)}
        >
          <div className="flex flex-col gap-2.5">
            <Knop
              variant="primair"
              maat="groot"
              disabled={bezig}
              onClick={() => {
                setKeuzeOpen(false);
                setAfsluitenOpen(true);
              }}
            >
              {UITLOGGEN.dienstAfsluiten}
            </Knop>
            <Knop maat="groot" disabled={bezig} onClick={() => void uitloggen(false)}>
              {UITLOGGEN.openLaten}
            </Knop>
            <p className="text-center text-xs font-semibold text-muted">{UITLOGGEN.openLatenHint}</p>
            <Knop variant="tekst" disabled={bezig} onClick={() => setKeuzeOpen(false)}>
              {UITLOGGEN.annuleren}
            </Knop>
          </div>
        </Overlay>
      )}

      {afsluitenOpen && shift && (
        <DienstAfsluitenOverlay
          shift={shift}
          onClose={() => setAfsluitenOpen(false)}
          // De dienst is dicht: daarna uitloggen (er is geen dienst meer om
          // open te laten).
          onShiftEnded={() => void uitloggen(false)}
        />
      )}
    </>
  );
}

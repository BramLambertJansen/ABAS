"use client";

import { useState } from "react";
import { PinToetsenbord } from "./PinToetsenbord";
import { CODE_LENGTH, codeFoutTekst, type CodeFout } from "@/lib/mfa";

/**
 * De invoer van de 6-cijferige code uit de authenticator-app
 * (docs/features/beheer-tweede-factor.md, ADR 0017): één gedeeld component
 * voor beide shells. `PinToetsenbord` met een instelbare lengte, plus de
 * afhandeling van een poging: bezig, foutmelding (letterlijk uit de spec →
 * Teksten) en na een fout opnieuw beginnen.
 *
 * De controle zelf (`challenge` + `verify`) geeft de aanroeper mee als
 * `onVerifieer`, met de client van de eigen shell (ADR 0009); die geeft
 * `null` bij succes of de `CodeFout`.
 *
 * Zonder `submitLabel` gaat de code weg zodra het zesde cijfer er staat
 * (zoals de PIN op de bar). Met `submitLabel` (de portal-sheet, "Bevestigen")
 * volgt eerst een knop; die gebruikt `aria-disabled` in plaats van
 * `disabled`, zodat hij focusbaar en voorleesbaar blijft (#77-patroon).
 */
export function CodeInvoer({
  tone,
  onVerifieer,
  submitLabel,
}: {
  tone: "rail" | "light";
  onVerifieer: (code: string) => Promise<CodeFout | null>;
  submitLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verstuur(volledig: string) {
    setPending(true);
    let uitkomst: CodeFout | null;
    try {
      uitkomst = await onVerifieer(volledig);
    } catch {
      uitkomst = "unknown";
    }
    setPending(false);
    if (uitkomst) setFout(codeFoutTekst(uitkomst));
  }

  function onDigit(cijfer: string) {
    if (pending) return;
    // Na een foutmelding begint de volgende toets een nieuwe code.
    const basis = fout ? "" : code;
    if (basis.length >= CODE_LENGTH) return;
    if (fout) setFout(null);
    const volgende = basis + cijfer;
    setCode(volgende);
    if (volgende.length === CODE_LENGTH && !submitLabel) void verstuur(volgende);
  }

  function onBackspace() {
    if (pending) return;
    if (fout) {
      setFout(null);
      setCode("");
      return;
    }
    setCode((c) => c.slice(0, -1));
  }

  const klaar = code.length === CODE_LENGTH && !fout && !pending;

  return (
    <>
      <PinToetsenbord
        tone={tone}
        pin={code}
        errorMessage={fout}
        pending={pending}
        onDigit={onDigit}
        onBackspace={onBackspace}
        length={CODE_LENGTH}
        statusLabel="Code"
      />
      {submitLabel && (
        <button
          type="button"
          aria-disabled={!klaar}
          onClick={() => {
            if (klaar) void verstuur(code);
          }}
          className={`flex h-control-lg w-full items-center justify-center text-sm font-bold text-rail transition-colors hover:bg-accent-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
            tone === "rail" ? "rounded-card bg-accent" : "rounded-card bg-accent"
          }`}
        >
          {submitLabel}
        </button>
      )}
    </>
  );
}

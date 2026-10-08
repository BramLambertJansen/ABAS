"use client";

import { Knop } from "@/components/Knop";
import { useState } from "react";
import { Overlay, OverlaySluitKnop } from "@/components/Overlay";
import { PinToetsenbord, PIN_LENGTH } from "@/components/PinToetsenbord";
import { usePortalSetOwnPin } from "@/hooks/queries/usePortalSetOwnPin";
import { setOwnPinErrorMessage } from "@/lib/ownPinErrors";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { ONBEKENDE_UITKOMST_TEKST, isNieuwOnopgeslagen } from "@/lib/opslaan";

const MISMATCH_MESSAGE = "Codes komen niet overeen";

type Step = "kies" | "herhaal";

/**
 * Sheet "Pincode instellen" → "Pincode herhalen" — docs/features/
 * portal-profiel.md → Schermflow §3. De bar-PIN (`members.pin_hash`, die
 * `start_shift` op het bar-tablet gebruikt), via de bestaande
 * `set_own_pin`; geen portal-inlogmethode (besluit 7). Twee stappen met het
 * gedeelde `PinToetsenbord` (lichte variant). De vergelijking van de twee
 * invoeren is client-side; de RPC ziet alleen de uiteindelijke PIN.
 *
 * Na elke mislukte poging (ongelijk, of een fout van de RPC) terug naar stap
 * 1 met lege invoer: geen PIN in state laten hangen (spec → Randgevallen).
 * Bij `no_bar_role`/`actor_not_found` ververst `onStale` het profiel, zodat
 * de PIN-rij verdwijnt als de rol of archiefstatus intussen veranderde.
 */
export function PincodeSheet({
  hasPin,
  onClose,
  onSet,
  onRemoved,
  onStale,
}: {
  hasPin: boolean;
  onClose: () => void;
  onSet: () => void;
  onRemoved: () => void;
  onStale: () => void;
}) {
  const [step, setStep] = useState<Step>("kies");
  const [draft, setDraft] = useState("");
  const [first, setFirst] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const mutation = usePortalSetOwnPin();
  const pending = mutation.status === "pending";
  const { closeBlocked, timedOut } = useOpslaanBlokkade(pending);
  // Ingetoetste cijfers (of de tweede stap) zijn invoer die nog niet is opgeslagen.
  const unsaved = isNieuwOnopgeslagen([draft, first]);

  function restart(nextMessage: string | null) {
    setStep("kies");
    setDraft("");
    setFirst("");
    setMessage(nextMessage);
  }

  async function submit(pin: string | null) {
    const result = await mutation.setOwnPin(pin);
    if (result.ok) {
      if (pin === null) onRemoved();
      else onSet();
      return;
    }
    restart(setOwnPinErrorMessage(result.code));
    if (result.code === "no_bar_role" || result.code === "actor_not_found") onStale();
  }

  function onDigit(digit: string) {
    if (pending || draft.length >= PIN_LENGTH) return;
    if (message) setMessage(null);
    const next = draft + digit;
    if (next.length < PIN_LENGTH) {
      setDraft(next);
      return;
    }
    if (step === "kies") {
      setFirst(next);
      setDraft("");
      setStep("herhaal");
      return;
    }
    if (next !== first) {
      restart(MISMATCH_MESSAGE);
      return;
    }
    setDraft(next);
    void submit(next);
  }

  function onBackspace() {
    if (pending) return;
    setDraft((d) => d.slice(0, -1));
  }

  return (
    <Overlay
      title={step === "kies" ? "Pincode instellen" : "Pincode herhalen"}
      onClose={onClose}
      closeBlocked={closeBlocked}
      onopgeslagen={unsaved}
    >
      <div className="flex flex-col gap-[14px]">
        <p aria-live="polite" className="text-sm font-medium leading-relaxed text-muted">
          {step === "kies"
            ? "Kies 4 cijfers om snel in te loggen op de bar-tablet. Je wachtwoord blijft altijd werken."
            : "Voer dezelfde 4 cijfers nog een keer in."}
        </p>

        <PinToetsenbord
          tone="light"
          pin={draft}
          errorMessage={timedOut ? ONBEKENDE_UITKOMST_TEKST : message}
          pending={pending}
          onDigit={onDigit}
          onBackspace={onBackspace}
        />

        {hasPin && (
          <Knop
            variant="tekst" className="self-center"
            disabled={pending}
            onClick={() => void submit(null)}
          >
            Pincode verwijderen
          </Knop>
        )}

        <OverlaySluitKnop
          maat="groot" className="w-full"
          disabled={closeBlocked}
        >
          Annuleren
        </OverlaySluitKnop>
      </div>
    </Overlay>
  );
}

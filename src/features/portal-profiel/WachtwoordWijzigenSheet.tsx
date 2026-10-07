"use client";

import { useRef, useState, type FormEvent } from "react";
import { Overlay, OverlaySluitKnop } from "@/components/Overlay";
import { CodeInvoer } from "@/components/CodeInvoer";
import { TWEESTAP_TEKSTEN, type CodeFout } from "@/lib/mfa";
import { useFocusNaWissel } from "@/hooks/useFocusNaWissel";
import { NieuwWachtwoordVelden, isPasswordReady } from "@/components/NieuwWachtwoordVelden";
import { usePortalWachtwoordWijzigen } from "@/hooks/queries/usePortalWachtwoordWijzigen";
import { passwordUpdateErrorMessage } from "@/lib/authErrors";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { ONBEKENDE_UITKOMST_TEKST, OPSLAAN_BEZIG_TEKST, isNieuwOnopgeslagen } from "@/lib/opslaan";
import { SheetKnoppen } from "./SheetKnoppen";

/**
 * Sheet "Wachtwoord wijzigen" — docs/features/portal-profiel.md →
 * Schermflow §2. Alleen Nieuw + Herhalen via het gedeelde
 * `NieuwWachtwoordVelden` (met live checklist); geen veld "Huidig
 * wachtwoord" (besluit 3). De sessie blijft actief (besluit 4).
 *
 * Voor bardienst/beheerder staat er een uitlegregel bij: het is één
 * account, dus dit wachtwoord geldt ook voor `/beheer` (besluit 7).
 * Bij `reauth_required` is de Uitloggen-knop in de header de weg terug.
 *
 * Heeft het account een tweede factor en is de sessie aal1, dan eerst de
 * code, pas daarna de velden (docs/features/beheer-tweede-factor.md →
 * Schermflow, ADR 0017).
 */
export function WachtwoordWijzigenSheet({
  isBarRole,
  onClose,
  onSaved,
}: {
  isBarRole: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const mutation = usePortalWachtwoordWijzigen();
  const pending = mutation.status === "pending";
  // De code-controle (stap voor de velden) loopt via `CodeInvoer`, dat zelf zijn
  // pending bijhoudt: hier alleen de opslag van het wachtwoord blokkeert sluiten.
  const { closeBlocked, timedOut } = useOpslaanBlokkade(pending);
  const unsaved = isNieuwOnopgeslagen([password, repeat]);
  // Na de code: de focus naar de kop van de stap met de wachtwoordvelden, de
  // titel van de sheet (besloten 12).
  const kopRef = useRef<HTMLHeadingElement>(null);
  const markeerWissel = useFocusNaWissel(mutation.codeStap, (stap) => (stap === "klaar" ? kopRef.current : null));

  async function verifieer(code: string): Promise<CodeFout | null> {
    markeerWissel();
    return mutation.verifieer(code);
  }

  const disabled = !isPasswordReady(password, repeat) || mutation.status === "pending";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const ok = await mutation.changePassword(password);
    if (ok) onSaved();
  }

  return (
    <Overlay
      title="Wachtwoord wijzigen"
      description={isBarRole ? "Dit is ook je wachtwoord voor beheer op de bar-tablet." : undefined}
      onClose={onClose}
      titleRef={kopRef}
      closeBlocked={closeBlocked}
      onopgeslagen={unsaved}
    >
      {mutation.codeStap === "controleren" && (
        <p className="py-6 text-center text-sm font-bold text-muted" role="status">
          Bezig met laden…
        </p>
      )}
      {mutation.codeStap === "nodig" && (
        <div className="flex flex-col gap-[14px]">
          <p className="text-sm font-medium leading-relaxed text-muted">{TWEESTAP_TEKSTEN.wachtwoordCodeStap}</p>
          <CodeInvoer tone="light" onVerifieer={verifieer} />
          <OverlaySluitKnop
            className="flex h-[52px] w-full items-center justify-center rounded-2xl border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
          >
            Annuleren
          </OverlaySluitKnop>
        </div>
      )}
      {mutation.codeStap === "klaar" && (
      <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
        <NieuwWachtwoordVelden
          password={password}
          repeat={repeat}
          onPasswordChange={setPassword}
          onRepeatChange={setRepeat}
          readOnly={pending}
        />

        <p className="text-sm font-bold text-danger empty:mt-[-14px]" role="alert">
          {timedOut
            ? ONBEKENDE_UITKOMST_TEKST
            : mutation.errorCode
              ? passwordUpdateErrorMessage(mutation.errorCode)
              : ""}
        </p>

        <SheetKnoppen
          submitLabel={pending ? OPSLAAN_BEZIG_TEKST : "Wijzigen"}
          disabled={disabled}
          cancelDisabled={closeBlocked}
        />
      </form>
      )}
    </Overlay>
  );
}

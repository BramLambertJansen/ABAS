"use client";

import { useState, type FormEvent } from "react";
import { Overlay } from "@/components/Overlay";
import { NieuwWachtwoordVelden, isPasswordReady } from "@/components/NieuwWachtwoordVelden";
import { usePortalWachtwoordWijzigen } from "@/hooks/queries/usePortalWachtwoordWijzigen";
import { passwordUpdateErrorMessage } from "@/lib/authErrors";
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
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
        <NieuwWachtwoordVelden
          password={password}
          repeat={repeat}
          onPasswordChange={setPassword}
          onRepeatChange={setRepeat}
        />

        <p className="text-sm font-bold text-danger empty:-mt-[14px]" role="alert">
          {mutation.errorCode ? passwordUpdateErrorMessage(mutation.errorCode) : ""}
        </p>

        <SheetKnoppen submitLabel="Wijzigen" disabled={disabled} onCancel={onClose} />
      </form>
    </Overlay>
  );
}

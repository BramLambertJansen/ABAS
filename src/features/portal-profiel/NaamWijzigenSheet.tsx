"use client";

import { useId, useState, type FormEvent } from "react";
import { Overlay } from "@/components/Overlay";
import {
  usePortalUpdateOwnName,
  type UpdateOwnNameErrorCode,
} from "@/hooks/queries/usePortalUpdateOwnName";
import { SheetKnoppen } from "./SheetKnoppen";

/** docs/features/portal-profiel.md → Schermflow §1 (goedgekeurde teksten).
 *  "vul een naam in" is letterlijk dezelfde tekst als LidBeherenOverlay.tsx
 *  voor `invalid_name`. */
function errorMessage(code: UpdateOwnNameErrorCode): string {
  switch (code) {
    case "invalid_name":
      return "vul een naam in";
    case "actor_not_found":
      return "dit account is niet (meer) gekoppeld aan een actief lid — log opnieuw in";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * Sheet "Naam wijzigen" — `update_own_name` (0026). Bij succes roept de
 * aanroeper (`AccountTab`) zowel de eigen profiel-refetch als de
 * doorgegeven `onProfileChanged` aan, zodat ook de header ("Hoi
 * {voornaam}") in `PortalShellHome` ververst (spec → Schermflow §1: geen
 * eigen `usePortalSession()` hier). Bij `actor_not_found` blijft de sheet
 * open met de melding en ververst `onStale` het profiel, zodat de rij
 * verdwijnt als het lid intussen gearchiveerd is (spec → Randgevallen).
 */
export function NaamWijzigenSheet({
  currentName,
  onClose,
  onSaved,
  onStale,
}: {
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
  onStale: () => void;
}) {
  const [name, setName] = useState(currentName);
  const mutation = usePortalUpdateOwnName();
  const inputId = useId();
  const errorId = useId();

  const trimmed = name.trim();
  const disabled = trimmed === "" || trimmed === currentName || mutation.status === "pending";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const result = await mutation.updateOwnName(trimmed);
    if (result.ok) {
      onSaved();
    } else if (result.code === "actor_not_found") {
      // Gearchiveerd of ontkoppeld terwijl de sheet open stond: profiel
      // verversen, zodat de Naam-rij verdwijnt (spec → Randgevallen).
      onStale();
    }
  }

  return (
    <Overlay
      title="Naam wijzigen"
      description="Zo staat je naam op de bar-tablet en in het dienstoverzicht."
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-bold text-muted">
            Volledige naam
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (mutation.errorCode) mutation.reset();
            }}
            aria-invalid={mutation.errorCode === "invalid_name"}
            aria-describedby={mutation.errorCode ? errorId : undefined}
            className="h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-accent"
          />
        </div>

        <p id={errorId} className="text-sm font-bold text-danger empty:-mt-[14px]" role="alert">
          {mutation.errorCode ? errorMessage(mutation.errorCode) : ""}
        </p>

        <SheetKnoppen submitLabel="Opslaan" disabled={disabled} onCancel={onClose} />
      </form>
    </Overlay>
  );
}

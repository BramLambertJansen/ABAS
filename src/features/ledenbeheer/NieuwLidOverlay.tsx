"use client";

import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import {
  useCreateMember,
  type CreateMemberErrorCode,
} from "@/hooks/queries/useCreateMember";
import type { LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { parseEuroToCents } from "@/lib/money";
import { isValidEmailFormat } from "@/lib/email";

function errorMessage(code: CreateMemberErrorCode): string {
  switch (code) {
    case "invalid_name":
      return "vul een naam in";
    case "invalid_starting_balance":
      return "vul een geldig startsaldo in (€0,00 of hoger)";
    case "invalid_email":
      return "vul een geldig e-mailadres in, of laat het veld leeg";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Nieuw lid"-overlay — naam (verplicht), startsaldo (optioneel) en
 * e-mailadres (optioneel). Zie docs/features/ledenbeheer.md → Schermflow
 * stap 2 en docs/features/ledenbeheer-email.md → Schermflow stap 1. Leeg
 * startsaldo-/e-mailveld stuurt `null`, niet een lege string — de RPC
 * behandelt beide gelijk (zie RPC's).
 */
export function NieuwLidOverlay({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: LedenbeheerLid) => void;
}) {
  const createMember = useCreateMember();
  const [name, setName] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const nameId = useId();
  const balanceId = useId();
  const emailId = useId();

  const trimmedBalanceInput = balanceInput.trim();
  const balanceCents =
    trimmedBalanceInput === "" ? null : parseEuroToCents(trimmedBalanceInput);
  const balanceValid =
    trimmedBalanceInput === "" || (balanceCents !== null && balanceCents >= 0);

  const trimmedEmailInput = emailInput.trim();
  const emailValid =
    trimmedEmailInput === "" || isValidEmailFormat(trimmedEmailInput);

  const canSubmit =
    name.trim() !== "" &&
    balanceValid &&
    emailValid &&
    createMember.status !== "pending";

  async function submit() {
    if (!canSubmit) return;
    const member = await createMember.createMember(
      name,
      trimmedBalanceInput === "" ? null : balanceCents,
      trimmedEmailInput === "" ? null : trimmedEmailInput
    );
    if (member) {
      onCreated(member);
    }
  }

  return (
    <Overlay title="Nieuw lid" onClose={onClose}>
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {createMember.errorCode ? errorMessage(createMember.errorCode) : ""}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-bold text-muted">
          Naam
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={balanceId} className="text-xs font-bold text-muted">
          Startsaldo (optioneel)
        </label>
        <div className="flex items-center gap-2 rounded-control border border-border bg-white px-3.5 focus-within:border-accent">
          <span aria-hidden="true" className="text-sm font-bold text-muted">
            €
          </span>
          <input
            id={balanceId}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={balanceInput}
            onChange={(event) => setBalanceInput(event.target.value)}
            className="h-12 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-xs font-bold text-muted">
          E-mailadres (optioneel)
        </label>
        <input
          id={emailId}
          type="email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 flex-1 items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex h-11 flex-1 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
        >
          Toevoegen
        </button>
      </div>
    </Overlay>
  );
}

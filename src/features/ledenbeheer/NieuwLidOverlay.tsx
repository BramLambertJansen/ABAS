"use client";

import { useId, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { OnbekendeUitkomstMelding } from "@/components/OnbekendeUitkomstMelding";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { ONBEKENDE_UITKOMST_GELD_TEKST, OPSLAAN_BEZIG_TEKST, isNieuwOnopgeslagen } from "@/lib/opslaan";
import {
  useCreateMember,
  type CreateMemberErrorCode,
} from "@/hooks/queries/useCreateMember";
import type { LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst, EMAIL_ONGELDIG_TEKST, emailFout } from "@/lib/veldFouten";
import { CONTACTADRES_LABEL, CONTACTADRES_UITLEG } from "./contactadresTeksten";
import { VeldFout } from "@/components/TekstVeld";
import { useVeldMoment } from "@/hooks/useVeldMoment";

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
    case "request_id_conflict":
      // 0042 (ADR 0023): hoort niet voor te komen; algemene fout, de volgende
      // poging krijgt een nieuwe sleutel.
      return "er ging iets mis, probeer het opnieuw";
    case "unknown":
      // Onbekende uitkomst van een verzoek dat een startsaldo kan schrijven:
      // geen "probeer opnieuw" (zie OnbekendeUitkomstMelding).
      return ONBEKENDE_UITKOMST_GELD_TEKST;
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const herstelFocus = useHerstelFocus();
  const pending = createMember.status === "pending";
  // Geld: geen time-out, de blokkade blijft tot het verzoek klaar is.
  const { closeBlocked } = useOpslaanBlokkade(pending, { metTimeout: false });
  const unsaved = isNieuwOnopgeslagen([name, balanceInput, emailInput]);
  // Onbekende uitkomst (netwerk/onbekende fout): pas weer toevoegen
  // nadat de gebruiker bewust "Ik heb gecontroleerd" koos (besluit C).
  const [gecontroleerd, setGecontroleerd] = useState(false);
  const uitkomstOnbekend =
    createMember.errorCode === "unknown" && !gecontroleerd;
  // Een hangend verzoek blijft in vlucht, zonder time-out (closeBlocked blijft staan).
  const inVlucht = pending;

  function wijzig() {
    if (createMember.errorCode && !uitkomstOnbekend) createMember.reset();
  }

  const trimmedBalanceInput = balanceInput.trim();
  const balanceCents =
    trimmedBalanceInput === "" ? null : parseEuroToCents(trimmedBalanceInput);
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const balanceMoment = useVeldMoment();
  const emailMoment = useVeldMoment();
  // Startsaldo en e-mail zijn optioneel; €0 is een geldig startsaldo.
  const balanceSoort = bedragFout(balanceInput, { optioneel: true, nulToegestaan: true });
  const balanceMelding =
    balanceSoort !== null && (balanceMoment.pogingGedaan || balanceMoment.aangeraakt)
      ? bedragFoutTekst(balanceSoort)
      : null;

  const trimmedEmailInput = emailInput.trim();
  const emailSoort = emailFout(emailInput);
  const emailMelding =
    emailSoort !== null && (emailMoment.pogingGedaan || emailMoment.aangeraakt)
      ? EMAIL_ONGELDIG_TEKST
      : null;

  // Een ongeldig bedrag of adres schakelt de knop niet uit: een tik toont de
  // melding. Uit blijft: geen naam, lopend verzoek, onbekende uitkomst.
  const canSubmit = name.trim() !== "" && !inVlucht && !uitkomstOnbekend;

  async function submit() {
    if (!canSubmit) return;
    // Eerste ongeldige veld (volgorde in het formulier) krijgt de focus.
    if (balanceSoort !== null) {
      balanceMoment.bijPoging();
      if (emailSoort !== null) emailMoment.bijPoging();
      balanceInputRef.current?.focus();
      return;
    }
    if (emailSoort !== null) {
      emailMoment.bijPoging();
      emailInputRef.current?.focus();
      return;
    }
    setGecontroleerd(false);
    const member = await createMember.createMember(
      name,
      trimmedBalanceInput === "" ? null : balanceCents,
      trimmedEmailInput === "" ? null : trimmedEmailInput
    );
    if (member) {
      onCreated(member);
      return;
    }
    herstelFocus(nameInputRef.current);
  }

  return (
    <Overlay title="Nieuw lid" onClose={onClose} closeBlocked={closeBlocked} onopgeslagen={unsaved}>
      {uitkomstOnbekend ? (
        <OnbekendeUitkomstMelding
          hangend={pending}
          onGecontroleerd={() => {
            setGecontroleerd(true);
            if (!pending) createMember.reset();
            herstelFocus(nameInputRef.current);
          }}
        />
      ) : (
        <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
          {createMember.errorCode ? errorMessage(createMember.errorCode) : ""}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-bold text-muted">
          Naam
        </label>
        <input
          ref={nameInputRef}
          id={nameId}
          type="text"
          value={name}
          readOnly={inVlucht}
          onChange={(event) => {
            setName(event.target.value);
            wijzig();
          }}
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
            ref={balanceInputRef}
            id={balanceId}
            aria-invalid={balanceMelding ? true : undefined}
            aria-describedby={balanceMelding ? `${balanceId}-fout` : undefined}
            onBlur={balanceMoment.bijBlur}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={balanceInput}
            readOnly={inVlucht}
            onChange={(event) => {
              setBalanceInput(event.target.value);
              balanceMoment.bijWijzig();
              wijzig();
            }}
            className="h-12 flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
          />
        </div>
        <VeldFout id={`${balanceId}-fout`} tekst={balanceMelding} alert={balanceMoment.pogingAlert} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-xs font-bold text-muted">
          {CONTACTADRES_LABEL} (optioneel)
        </label>
        <input
          ref={emailInputRef}
          id={emailId}
          type="email"
          value={emailInput}
          readOnly={inVlucht}
          aria-invalid={emailMelding ? true : undefined}
          aria-describedby={`${emailId}-uitleg${emailMelding ? ` ${emailId}-fout` : ""}`}
          onBlur={emailMoment.bijBlur}
          onChange={(event) => {
            setEmailInput(event.target.value);
            emailMoment.bijWijzig();
            wijzig();
          }}
          className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
        <p id={`${emailId}-uitleg`} className="text-xs font-medium text-muted">
          {CONTACTADRES_UITLEG}
        </p>
        <VeldFout id={`${emailId}-fout`} tekst={emailMelding} alert={emailMoment.pogingAlert} />
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={closeBlocked}
          onClick={onClose}
          className="flex h-11 flex-1 items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="flex h-11 flex-1 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
        >
          {inVlucht ? OPSLAAN_BEZIG_TEKST : "Toevoegen"}
        </button>
      </div>
    </Overlay>
  );
}

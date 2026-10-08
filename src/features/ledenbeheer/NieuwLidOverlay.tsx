"use client";

import { Knop } from "@/components/Knop";

import { PENDING_REQUEST_MESSAGE, REQUEST_STORAGE_MESSAGE } from "@/lib/moneyRequest";
import { isSessionErrorCode, SESSION_CODE_INLINE_MESSAGE } from "@/lib/barSessie";
import { useId, useRef, useState } from "react";
import { Overlay, OverlaySluitKnop } from "@/components/Overlay";
import { OnbekendeUitkomstMelding } from "@/components/OnbekendeUitkomstMelding";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { ONBEKENDE_UITKOMST_GELD_TEKST, OPSLAAN_BEZIG_TEKST, isNieuwOnopgeslagen } from "@/lib/opslaan";
import {
  useCreateMember,
  memberFromRpc,
  type CreateMemberErrorCode,
} from "@/hooks/queries/useCreateMember";
import type { LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst, NAAM_VERPLICHT_TEKST, EMAIL_ONGELDIG_TEKST, emailFout } from "@/lib/veldFouten";
import { CONTACTADRES_LABEL, CONTACTADRES_UITLEG } from "./contactadresTeksten";
import { TekstVeld, VeldFout } from "@/components/TekstVeld";
import { useVeldMoment } from "@/hooks/useVeldMoment";

function errorMessage(code: CreateMemberErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "pending_request":
    case "request_id_conflict":
    case "invalid_request_id":
      return PENDING_REQUEST_MESSAGE;
    case "request_cancelled":
      return "Deze eerdere actie is definitief geannuleerd. Er is geen lid aangemaakt onder deze sleutel.";
    case "request_storage_unavailable":
      return REQUEST_STORAGE_MESSAGE;
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
  const [geannuleerd, setGeannuleerd] = useState(false);
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
  // Herstel is expliciet en blijft gekoppeld aan de oorspronkelijke sleutel.
  const uitkomstOnbekend =
    createMember.errorCode === "unknown";
  // Een hangend verzoek blijft in vlucht, zonder time-out (closeBlocked blijft staan).
  const inVlucht = pending;

  function wijzig() {
    setGeannuleerd(false);
    if (createMember.errorCode && !uitkomstOnbekend) createMember.reset();
  }

  const trimmedBalanceInput = balanceInput.trim();
  const balanceCents =
    trimmedBalanceInput === "" ? null : parseEuroToCents(trimmedBalanceInput);
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const naamMoment = useVeldMoment();
  const naamMelding = !name.trim() && (naamMoment.aangeraakt || naamMoment.pogingGedaan) ? NAAM_VERPLICHT_TEKST : null;
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
  // melding. Uit blijft: lopend verzoek of onbekende uitkomst.
  const canSubmit = !inVlucht && !uitkomstOnbekend;

  async function submit() {
    if (!canSubmit) return;
    if (!name.trim()) {
      naamMoment.bijPoging();
      if (balanceSoort !== null) balanceMoment.bijPoging();
      if (emailSoort !== null) emailMoment.bijPoging();
      nameInputRef.current?.focus();
      return;
    }
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
          operation="create_member"
          context={`Nieuw lid: ${name} · Startsaldo ${formatCents(balanceCents ?? 0)}`}
          onResolved={(resolution) => {
            if (resolution.status === "completed") onCreated(memberFromRpc(resolution.result));
            else {
              createMember.reset();
              setName(""); setBalanceInput(""); setEmailInput("");
              naamMoment.reset(); balanceMoment.reset(); emailMoment.reset();
              setGeannuleerd(true);
              herstelFocus(nameInputRef.current);
            }
          }}
        />
      ) : (
        <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
          {createMember.errorCode ? errorMessage(createMember.errorCode) : ""}
        </p>
      )}

      {geannuleerd && <p role="status" className="text-sm font-bold text-ink">De onbevestigde actie is definitief geannuleerd. Er is geen boeking teruggedraaid.</p>}

      <div className="flex flex-col gap-1.5">
        <TekstVeld tone="light" maat="52" label="Naam"
          inputRef={nameInputRef}
          id={nameId}
          required
          aria-invalid={naamMelding ? true : undefined}
          aria-describedby={naamMelding ? `${nameId}-fout` : undefined}
          onBlur={naamMoment.bijBlur}
          type="text"
          value={name}
          readOnly={inVlucht || uitkomstOnbekend}
          onChange={(event) => {
            naamMoment.bijWijzig();
            setName(event.target.value);
            wijzig();
          }}
         />
        <VeldFout id={`${nameId}-fout`} tekst={naamMelding} alert={naamMoment.pogingAlert} />
      </div>

      <div className="flex flex-col gap-1.5">
        <TekstVeld tone="light" maat="52" prefix="€" label="Startsaldo (optioneel)"
            inputRef={balanceInputRef}
            id={balanceId}
            aria-invalid={balanceMelding ? true : undefined}
            aria-describedby={balanceMelding ? `${balanceId}-fout` : undefined}
            onBlur={balanceMoment.bijBlur}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={balanceInput}
            readOnly={inVlucht || uitkomstOnbekend}
            onChange={(event) => {
              setBalanceInput(event.target.value);
              balanceMoment.bijWijzig();
              wijzig();
            }}
           />
        <VeldFout id={`${balanceId}-fout`} tekst={balanceMelding} alert={balanceMoment.pogingAlert} />
      </div>

      <div className="flex flex-col gap-1.5">
        <TekstVeld tone="light" maat="52" label={`${CONTACTADRES_LABEL} (optioneel)`}
          inputRef={emailInputRef}
          id={emailId}
          type="email"
          value={emailInput}
          readOnly={inVlucht || uitkomstOnbekend}
          aria-invalid={emailMelding ? true : undefined}
          aria-describedby={`${emailId}-uitleg${emailMelding ? ` ${emailId}-fout` : ""}`}
          onBlur={emailMoment.bijBlur}
          onChange={(event) => {
            setEmailInput(event.target.value);
            emailMoment.bijWijzig();
            wijzig();
          }}
         />
        <p id={`${emailId}-uitleg`} className="text-xs font-medium text-muted">
          {CONTACTADRES_UITLEG}
        </p>
        <VeldFout id={`${emailId}-fout`} tekst={emailMelding} alert={emailMoment.pogingAlert} />
      </div>

      <div className="flex gap-2.5">
        <OverlaySluitKnop
          className="flex-1"
          disabled={closeBlocked}
        >
          Annuleren
        </OverlaySluitKnop>
        <Knop
          variant="primair" className="flex-1"
          disabled={!canSubmit}
          onClick={submit}
        >
          {inVlucht ? OPSLAAN_BEZIG_TEKST : "Toevoegen"}
        </Knop>
      </div>
    </Overlay>
  );
}

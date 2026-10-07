"use client";

import { useId, useRef, useState } from "react";
import { VeldFout } from "@/components/TekstVeld";
import { useVeldMoment } from "@/hooks/useVeldMoment";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { Overlay } from "@/components/Overlay";
import { BezettingKeuze } from "@/components/BezettingKeuze";
import { OnbekendeUitkomstMelding } from "@/components/OnbekendeUitkomstMelding";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst } from "@/lib/veldFouten";
import { useTopUp, type TopUpErrorCode } from "@/hooks/queries/useTopUp";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import {
  AMOUNT_CHIPS_CENTS,
  SELF_TOP_UP_MESSAGE,
  TOP_UP_CONFIRM_THRESHOLD_CENTS,
  TOP_UP_MAX_CENTS,
  topUpAmountTooHighMessage,
  topUpConfirmQuestion,
  topUpErrorMessage,
} from "./messages";
import { KNOP_ACCENT_WIT } from "@/components/knopStijlen";

/**
 * Opwaardeer-overlay (modal, `src/components/Overlay.tsx` — de derde
 * consument, geen nieuwe overlay-beslissing). Zie
 * docs/features/opwaarderen.md → Schermflow §2 / Randgevallen. De
 * "Wie geeft uit?"-keuze is het gedeelde BezettingKeuze-component (stond
 * eerst als kopie uit AfrekenenOverlay.tsx hier; gedeeld sinds bestelling
 * terugdraaien er een derde consument van werd).
 */
export function OpwaarderenOverlay({
  shiftId,
  member,
  crew,
  lowBalanceThresholdCents,
  onClose,
  onSuccess,
  onMemberNotFound,
  onRefetchMembers,
  onRefetchShiftMembers,
}: {
  shiftId: string;
  member: MemberOption;
  crew: ShiftMember[];
  lowBalanceThresholdCents: number;
  onClose: () => void;
  onSuccess: (amountCents: number) => void;
  onMemberNotFound: () => void;
  onRefetchMembers: () => void;
  onRefetchShiftMembers: () => void;
}) {
  const topUpMutation = useTopUp();
  const sessie = useBarSessie();
  const amountLimitId = useId();
  const [servedBy, setServedBy] = useState<string | null>(null);
  const [selectedChipCents, setSelectedChipCents] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [submitErrorCode, setSubmitErrorCode] = useState<TopUpErrorCode | null>(
    null
  );
  // Bevestigingsstap boven TOP_UP_CONFIRM_THRESHOLD_CENTS (app-review
  // 2026-09-21). Bewust een state-vlag binnen déze overlay en geen tweede,
  // gestapelde Overlay: een dialog bovenop een dialog zou de focus-trap van
  // Overlay.tsx dubbel opzetten (twee keydown-listeners die allebei op
  // Escape sluiten), en er is niets te tonen wat niet in deze dialog past.
  const [confirming, setConfirming] = useState(false);

  const needsPicker = crew.length >= 2;
  const effectiveServedBy = crew.length === 1 ? (crew[0]?.id ?? null) : servedBy;

  // Een vrij ingetikt bedrag overschrijft een eerder gekozen chip en
  // omgekeerd — nooit allebei tegelijk als bron van waarheid. `null` bij
  // een leeg/ongeldig invoerveld (parseEuroToCents, src/lib/money.ts).
  const customAmountCents =
    customAmount.trim() === "" ? null : parseEuroToCents(customAmount);
  const amountCents = customAmount.trim() !== "" ? customAmountCents : selectedChipCents;
  // Veldmelding (docs/features/invoerfeedback-zoeken-filters.md): welke soort
  // fout het bedrag heeft, zonder iets te berekenen — `parseEuroToCents`
  // beslist de waarde. Zonder chip en zonder tekst is het veld `leeg`.
  const customBlank = customAmount.trim() === "";
  const veldFout =
    !customBlank
      ? bedragFout(customAmount, { maxCents: TOP_UP_MAX_CENTS })
      : selectedChipCents === null
        ? "leeg"
        : null;
  // Boven de harde grens: direct inline uitleg. `top_up` weigert dit ook
  // server-side met `amount_exceeds_max` (0016_top_up_maximumbedrag.sql) —
  // dit is de UX-helft, niet de afdwinging.
  const amountTooHigh = veldFout === "tehoog";
  const amountBookable = veldFout === null && amountCents !== null;
  // Moment van tonen: tehoog direct; de rest na blur of een poging; "leeg"
  // alleen na een poging. Herstel is direct (de fout volgt de invoer).
  const { aangeraakt, pogingGedaan, pogingAlert, bijBlur, bijWijzig, bijPoging } =
    useVeldMoment();
  const toonFout =
    veldFout !== null &&
    (amountTooHigh || pogingGedaan || (aangeraakt && veldFout !== "leeg"));
  const veldMelding =
    !toonFout || veldFout === null
      ? null
      : veldFout === "tehoog"
        ? topUpAmountTooHighMessage()
        : bedragFoutTekst(veldFout);
  const bedragInputRef = useRef<HTMLInputElement>(null);
  const needsConfirmation =
    amountCents !== null && amountCents > TOP_UP_CONFIRM_THRESHOLD_CENTS;

  const herstelFocus = useHerstelFocus();
  const knopRef = useRef<HTMLButtonElement>(null);
  const pending = topUpMutation.status === "pending";
  // Geld: geen time-out, de blokkade blijft tot het verzoek klaar is.
  const { closeBlocked } = useOpslaanBlokkade(pending, { metTimeout: false });
  // Een tweede geldopdracht blijft geblokkeerd zolang de eerste kan slagen.
  // Herstel is expliciet en blijft gekoppeld aan de oorspronkelijke sleutel.
  const uitkomstOnbekend = submitErrorCode === "unknown";
  const inVlucht = pending || uitkomstOnbekend;
  // A4 (besloten, alle standen): nooit een opwaardering naar het lid van de
  // ingelogde sessie. De regel staat er al vóór het boeken, zodat de weigering
  // niet pas na de RPC zichtbaar wordt (zelfde verdeling als de €500): `top_up`
  // weigert het ook zelf (`self_top_up_forbidden`).
  const isSelf = sessie.session !== null && member.id === sessie.session.memberId;
  // Een ongeldig bedrag schakelt de knop niet uit: een tik toont de melding
  // (veldverklaring). Uit blijft alleen wat het veld niet verklaart.
  const bookDisabled = !effectiveServedBy || inVlucht || isSelf || uitkomstOnbekend;

  // Elke bedragswijziging trekt een openstaande bevestiging in: anders zou
  // een bevestigd bedrag blijven staan terwijl er inmiddels een ander bedrag
  // geboekt zou worden — precies de vergissing die deze stap moet vangen.
  function chooseChip(cents: number) {
    if (inVlucht) return;
    setSelectedChipCents(cents);
    setCustomAmount("");
    bijWijzig();
    setConfirming(false);
  }

  // Zelfde reden als AfrekenenOverlay.tsx: Escape/backdrop-click/
  // "annuleren" mogen niet sluiten terwijl top_up onderweg is — anders kan
  // de operator dezelfde opwaardering dubbel indienen vóórdat de eerste
  // aanroep klaar is.
  async function handleBook() {
    if (!effectiveServedBy || inVlucht || isSelf || uitkomstOnbekend) return;

    // Poging met een ongeldig bedrag: toon de melding en zet de focus op het veld.
    if (!amountBookable || amountCents === null) {
      bijPoging();
      setConfirming(false);
      bedragInputRef.current?.focus();
      return;
    }

    // Eerste tik op een groot bedrag boekt niet, maar vraagt na. Pas de
    // tweede tik ("ja, … boeken") komt hier voorbij.
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      setSubmitErrorCode(null);
      return;
    }

    const result = await topUpMutation.topUp(
      shiftId,
      member.id,
      amountCents,
      effectiveServedBy
    );

    if (result.ok) {
      onSuccess(result.amountCents);
      return;
    }

    switch (result.code) {
      case "served_by_not_on_shift":
        setServedBy(null);
        onRefetchShiftMembers();
        setSubmitErrorCode(result.code);
        break;
      case "member_not_found":
        onRefetchMembers();
        onMemberNotFound();
        break;
      case "unknown":
        // Uitkomst onbekend: ververs het saldo zodat de gebruiker kan controleren.
        onRefetchMembers();
        setSubmitErrorCode(result.code);
        break;
      default:
        setSubmitErrorCode(result.code);
    }
  }

  const lowBalance = member.balanceCents < lowBalanceThresholdCents;
  const chipSelected = (cents: number) =>
    selectedChipCents === cents && customAmount.trim() === "";

  // Indeling naar designs/Bar App.dc.html → `topupOpen`: naam/saldo als één
  // regel, "betaald met" als label, chips, invoerveld met "boeken" ernaast,
  // "annuleren" als tekstlink. Afwijkingen van het prototype die de spec
  // vastlegt (docs/features/opwaarderen.md §2): titel mét ledennaam, geen
  // methode-toggle (MVP is alleen contant), chips kiezen een bedrag in
  // plaats van direct te boeken, en de "Wie geeft uit?"-picker.
  return (
    <Overlay
      title={`Saldo opwaarderen bij ${member.name}`}
      onClose={onClose}
      closeBlocked={closeBlocked}
    >
      <div className="-mt-1 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-muted">
        <span className="min-w-0 truncate">
          saldo{lowBalance ? " — laag saldo" : ""}
        </span>
        <span className={`font-extrabold ${lowBalance ? "text-danger" : "text-ink"}`}>
          {formatCents(member.balanceCents)}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted">
          betaald met
        </span>
        <span className="text-[13px] font-extrabold text-ink">contant</span>
      </div>

      {isSelf && (
        <p className="text-sm font-bold text-danger" role="alert">
          {SELF_TOP_UP_MESSAGE}
        </p>
      )}

      {needsPicker && (
        <BezettingKeuze
          legend="Wie geeft uit?"
          crew={crew}
          selectedId={servedBy}
          onSelect={setServedBy}
          disabled={inVlucht}
        />
      )}

      <div className="grid grid-cols-4 gap-2">
        {AMOUNT_CHIPS_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            disabled={inVlucht}
            aria-pressed={chipSelected(cents)}
            onClick={() => chooseChip(cents)}
            className={`flex h-12 items-center justify-center rounded-[13px] border text-sm font-extrabold transition-colors ${
              chipSelected(cents)
                ? "border-accent bg-accent-active text-white"
                : "border-border bg-white text-ink hover:border-accent hover:bg-canvas hover:text-accent-active"
            }`}
          >
            {formatCents(cents)}
          </button>
        ))}
      </div>

      {confirming && amountCents !== null && (
        <p
          className="rounded-xl bg-warning-bg px-3 py-2 text-xs font-bold text-warning-fg"
          role="status"
        >
          {topUpConfirmQuestion(amountCents, member.name)}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <label htmlFor="opwaarderen-bedrag" className="sr-only">
            Ander bedrag
          </label>
          <input
            ref={bedragInputRef}
            id="opwaarderen-bedrag"
            type="text"
            inputMode="decimal"
            placeholder="ander bedrag"
            value={customAmount}
            readOnly={inVlucht}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedChipCents(null);
              bijWijzig();
              setConfirming(false);
            }}
            onBlur={bijBlur}
            aria-describedby={veldMelding ? amountLimitId : undefined}
            aria-invalid={veldMelding ? true : undefined}
            className="h-12 min-w-0 flex-1 rounded-[13px] border border-border bg-white px-3.5 text-detail font-semibold text-ink focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
          />
          <button
            type="button"
            ref={knopRef}
            disabled={bookDisabled}
            onClick={handleBook}
            className={`flex h-12 flex-none items-center justify-center rounded-[13px] px-[18px] text-detail font-extrabold ${KNOP_ACCENT_WIT}`}
          >
            {pending
              ? "bezig…"
              : confirming && amountCents !== null
                ? `ja, ${formatCents(amountCents)} boeken`
                : "boeken"}
          </button>
        </div>
        <VeldFout
          id={amountLimitId}
          tekst={veldMelding}
          alert={amountTooHigh || pogingAlert}
        />
      </div>

      {/* Geen min-hoogte: leeg neemt deze regel geen ruimte in (het lege
          vlak onder de titel in de vorige versie). */}
      {uitkomstOnbekend ? (
        <OnbekendeUitkomstMelding
          operation="top_up"
          context={`Opwaardering voor ${member.name} · ${formatCents(amountCents ?? 0)}`}
          onResolved={(resolution) => {
            if (resolution.status === "completed") onSuccess(Number(resolution.result.amount_cents));
            else { setSubmitErrorCode("request_cancelled"); onRefetchMembers(); herstelFocus(knopRef.current); }
          }}
        />
      ) : (
        <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
          {submitErrorCode ? topUpErrorMessage(submitErrorCode) : ""}
        </p>
      )}

      <button
        type="button"
        disabled={closeBlocked}
        // In de bevestigingsstap is dit "terug" naar het bedrag, niet
        // "annuleren" van de hele overlay — anders is een verkeerd
        // ingetikt bedrag corrigeren alleen mogelijk door opnieuw te
        // beginnen, precies op het moment dat de operator al twijfelt.
        onClick={confirming ? () => setConfirming(false) : onClose}
        className="-mt-1 self-center px-3 py-1 text-[13px] font-bold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {confirming ? "terug" : "annuleren"}
      </button>
    </Overlay>
  );
}

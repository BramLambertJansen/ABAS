"use client";

import { useEffect, useId, useRef, useState } from "react";
import { VeldFout } from "@/components/TekstVeld";
import { LeesFout } from "@/components/LeesFout";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { useVeldMoment } from "@/hooks/useVeldMoment";
import { useAppSettings } from "@/hooks/queries/useAppSettings";
import {
  useUpdateNegativeLimit,
  type UpdateNegativeLimitErrorCode,
} from "@/hooks/queries/useUpdateNegativeLimit";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { bedragFout, bedragFoutTekst } from "@/lib/veldFouten";

const TOAST_DURATION_MS = 3500;

// Letterlijk `[0,10,25,50]` uit het ontwerp (designs/Bar App.dc.html, regel
// 2967 — `negativeLimitPresets`), zie docs/features/negatieve-saldolimiet.md
// → Schermflow stap 4.
const PRESET_CENTS = [0, 1000, 2500, 5000];

function errorMessage(code: UpdateNegativeLimitErrorCode): string {
  switch (code) {
    case "invalid_negative_limit":
      return "vul een geldig bedrag in (€0 of hoger)";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan instellingen niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * Instellingen-tab (issue #11, docs/features/negatieve-saldolimiet.md) —
 * de systeembrede negatieflimiet instellen. Volgt het ontwerp (designs/
 * Bar App.dc.html, regel 575–608, 2967–3273) letterlijk voor de eerste bouw
 * (CLAUDE.md → Designbestanden). Geen bevestigingsstap op de chips — de
 * actieve beheer-sessie zelf is al de bevestiging, zelfde redenering als
 * assortimentbeheer's archiveer-toggle.
 */
export function NegatieveLimietInstellingen() {
  const appSettings = useAppSettings();
  const kopRef = useRef<HTMLHeadingElement>(null);
  const herstel = useLeesHerstel(appSettings, kopRef);
  const mutation = useUpdateNegativeLimit();
  const [customAmount, setCustomAmount] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const moment = useVeldMoment();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (herstel.toonFout) {
    return (
      <LeesFout
        tone="light"
        className="items-start text-left"
        message={herstel.message}
        onRetry={herstel.retry}
        bezig={herstel.bezig}
      />
    );
  }

  if (appSettings.status !== "ready") {
    return (
      <p className="text-sm font-semibold text-muted" role="status">
        Instellingen laden…
      </p>
    );
  }

  const currentCents = appSettings.settings.negativeLimitCents;
  const pending = mutation.status === "pending";

  // Vijfde chip als de huidige waarde niet in de vaste lijst voorkomt (bv.
  // een eerder handmatig ingevuld bedrag als €15), opnieuw oplopend
  // gesorteerd — zie spec → Schermflow stap 4.
  const chipValues = Array.from(new Set([...PRESET_CENTS, currentCents])).sort(
    (a, b) => a - b
  );

  const parsedCustomCents =
    customAmount.trim() === "" ? null : parseEuroToCents(customAmount);
  // €0 ("geen") is geldig. Een ongeldig bedrag schakelt de knop niet uit: een
  // tik toont de melding. Uit blijft: niets ingevuld of een lopend verzoek.
  const customSoort = bedragFout(customAmount, { optioneel: true, nulToegestaan: true });
  const customMelding =
    customSoort !== null && (moment.pogingGedaan || moment.aangeraakt)
      ? bedragFoutTekst(customSoort)
      : null;
  const canSaveCustom = customAmount.trim() !== "" && !pending;

  async function apply(cents: number) {
    if (pending) return;
    const result = await mutation.updateNegativeLimit(cents);
    if (result !== null) {
      setCustomAmount("");
      appSettings.refetch();
      setToast(`Limiet ingesteld op ${result > 0 ? formatCents(result) : "geen"}`);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 ref={kopRef} tabIndex={-1} className="text-base font-extrabold tracking-tight">
            Negatief saldo toestaan
          </h2>
          <p className="text-xs font-semibold text-muted">
            Tot dit bedrag mag een lid in het rood staan. Erboven blokkeert de
            bar bestellen — het lid moet eerst opwaarderen.
          </p>
        </div>
        {/* Tekst is zelf al het onderscheid (niet kleur-only), zie spec →
            Schermflow stap 1. bg-warning-bg/text-warning-fg — al
            AA-gevalideerd (zie Mandje.tsx's laag-saldo-banner), geen nieuwe
            kleurcombinatie. */}
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
            currentCents > 0
              ? "bg-warning-bg text-warning-fg"
              : "bg-border-subtle text-muted"
          }`}
        >
          {currentCents > 0 ? "actief" : "uit"}
        </span>
      </div>

      <div aria-live="polite" role="status" className="empty:-mt-4">
        {toast && (
          <p className="w-fit rounded-control border border-border bg-white px-3.5 py-2 text-sm font-bold text-ink">
            {toast}
          </p>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tracking-tight text-ink">
          {currentCents > 0 ? formatCents(currentCents) : "geen"}
        </span>
        <span className="text-xs font-bold text-muted">huidige limiet</span>
      </div>

      <div className="flex flex-col gap-1 rounded-control bg-canvas p-3.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
          Wat dit betekent
        </span>
        <p className="text-xs font-semibold text-ink">
          {currentCents > 0
            ? `Een lid met €0 op de rekening kan nog voor ${formatCents(
                currentCents
              )} bestellen. Daarna weigert de kassa tot er is opgewaardeerd.`
            : "Leden kunnen alleen bestellen met saldo op hun rekening. Bij €0 weigert de kassa meteen."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
          Snel instellen
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Snel instellen">
          {chipValues.map((cents) => (
            <button
              key={cents}
              type="button"
              disabled={pending}
              aria-pressed={cents === currentCents}
              onClick={() => apply(cents)}
              className={`flex h-11 min-w-[62px] flex-1 items-center justify-center rounded-control border px-3 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                cents === currentCents
                  ? "border-accent bg-accent-active text-white"
                  : "border-border bg-white text-ink hover:border-accent"
              }`}
            >
              {cents === 0 ? "geen" : formatCents(cents)}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {mutation.errorCode ? errorMessage(mutation.errorCode) : ""}
      </p>

      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Ander bedrag
        </label>
        <input
          ref={inputRef}
          id={inputId}
          aria-invalid={customMelding ? true : undefined}
          aria-describedby={customMelding ? `${inputId}-fout` : undefined}
          onBlur={moment.bijBlur}
          type="text"
          inputMode="decimal"
          placeholder="ander bedrag"
          value={customAmount}
          onChange={(event) => {
            setCustomAmount(event.target.value);
            moment.bijWijzig();
          }}
          className="h-12 flex-1 min-w-0 rounded-control border border-border px-3.5 text-sm font-semibold text-ink focus-visible:outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          disabled={!canSaveCustom}
          onClick={() => {
            if (customSoort !== null || parsedCustomCents === null) {
              moment.bijPoging();
              inputRef.current?.focus();
              return;
            }
            apply(parsedCustomCents);
          }}
          className="flex h-12 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
        >
          opslaan
        </button>
      </div>
      <VeldFout id={`${inputId}-fout`} tekst={customMelding} alert={moment.pogingAlert} />

      <div className="h-px bg-border-subtle" />

      {/* Geen "Wijzigingen komen met je naam in het logboek" — er bestaat
          geen logboek/audit-trail, zie spec → Schermflow stap 8 / Expliciet
          buiten scope. */}
      <p className="text-xs font-semibold text-muted">Geldt voor alle leden.</p>
    </div>
  );
}

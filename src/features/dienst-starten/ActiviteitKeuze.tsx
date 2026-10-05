"use client";

import { useRef } from "react";
import { LeesFout } from "@/components/LeesFout";
import { Select } from "@/components/Select";
import { useFocusNaHerstel } from "@/hooks/useFocusNaHerstel";
import { StaffHeader } from "./StaffHeader";
import type { ActiviteitType } from "@/hooks/queries/useActiviteitTypes";

/**
 * De activiteitkeuze in `DienstStarten.tsx` — een dienst kiest, verplicht,
 * één activiteittype. Sinds dienst-per-sessie is dit de enige stap: na de
 * login op de namenlijst start één tik de dienst, zonder PIN-stap. Zie
 * docs/features/activiteittypes.md → Schermflow §2. Volledige-schermstap
 * binnen de bestaande donkere PIN-flow, geen overlay (spec →
 * `useShell()`-contract): één dropdown (`Select`), geen lijst kandidaten die
 * `useShell().columns` nodig heeft.
 */
export function ActiviteitKeuze({
  staffName,
  activityTypes,
  loading,
  loadErrorMessage,
  onRetryLoad,
  retryLoadBezig,
  errorMessage,
  pending,
  onSelect,
  onBack,
}: {
  staffName: string;
  activityTypes: ActiviteitType[];
  loading: boolean;
  loadErrorMessage: string | null;
  /** `refetch` van de activiteittypes (herstelknop bij een leesfout). */
  onRetryLoad: () => void;
  retryLoadBezig: boolean;
  errorMessage: string | null;
  pending: boolean;
  onSelect: (activityType: ActiviteitType) => void;
  /** Sinds dienst-per-sessie is de starter de ingelogde persoon en is er geen
   *  namenlijst om naar terug te gaan: zonder `onBack` staat er geen terugknop. */
  onBack?: () => void;
}) {
  function handleChange(id: string) {
    const activityType = activityTypes.find((a) => a.id === id);
    if (activityType) onSelect(activityType);
  }

  const kopRef = useRef<HTMLHeadingElement>(null);
  useFocusNaHerstel(
    loadErrorMessage ? "error" : loading ? "loading" : "ready",
    kopRef
  );

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-5">
      <StaffHeader name={staffName} />

      <h2
        ref={kopRef}
        tabIndex={-1}
        className="text-center text-lg font-extrabold tracking-tight text-white outline-none"
      >
        Voor welke activiteit is deze dienst?
      </h2>

      {loading && !loadErrorMessage && (
        <p className="text-sm font-semibold text-rail-muted" role="status">
          Activiteittypes laden…
        </p>
      )}

      {loadErrorMessage && (
        <LeesFout
          tone="rail"
          className="max-w-xs"
          message={loadErrorMessage}
          onRetry={onRetryLoad}
          bezig={retryLoadBezig}
        />
      )}

      {!loading && !loadErrorMessage && activityTypes.length === 0 && (
        <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
          Geen actieve activiteittypes — vraag een beheerder er een toe te
          voegen.
        </p>
      )}

      {!loading && !loadErrorMessage && activityTypes.length > 0 && (
        // Rand kleurt via `invalid` zolang er een fout is (race: type
        // gearchiveerd tussen kiezen en PIN bevestigen) — zelfde soort
        // verplicht-markering als het ontwerp (chat37.md: oranje rand zolang
        // niets gekozen is).
        <Select
          label="Activiteit"
          placeholder="Kies een activiteit…"
          options={activityTypes.map((a) => ({ value: a.id, label: a.name }))}
          value={null}
          disabled={pending}
          invalid={errorMessage !== null}
          onChange={handleChange}
        />
      )}

      <p className="h-5 text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      {onBack && (
        <button
          type="button"
          disabled={pending}
          onClick={onBack}
          className="text-xs font-semibold text-rail-muted hover:text-rail-light disabled:opacity-50"
        >
          ← andere bardienst
        </button>
      )}
    </div>
  );
}

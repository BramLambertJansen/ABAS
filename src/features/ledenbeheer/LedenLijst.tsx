"use client";

import { useEffect, useMemo, useState } from "react";
import { useAlleLeden, type LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { useAppSettings } from "@/hooks/queries/useAppSettings";
import { formatCents } from "@/lib/money";
import { NieuwLidOverlay } from "./NieuwLidOverlay";
import { LidBeherenOverlay } from "./LidBeherenOverlay";

const TOAST_DURATION_MS = 3500;

type StatusFilter = "actief" | "laag" | "archief";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "actief", label: "Actief" },
  { id: "laag", label: "Saldo laag" },
  { id: "archief", label: "Archief" },
];

function matchesFilter(
  member: LedenbeheerLid,
  filter: StatusFilter,
  lowBalanceThresholdCents: number
): boolean {
  if (filter === "archief") return member.archived;
  if (member.archived) return false;
  if (filter === "laag") return member.balanceCents < lowBalanceThresholdCents;
  return true;
}

/**
 * Ledenlijst — de Leden-tab in `BeheerTabs.tsx`, zodra er een actieve
 * beheerder-sessie is (zie Assortimentbeheer.tsx). Zie
 * docs/features/ledenbeheer.md → Schermflow stap 1 t/m 4. Geen eigen
 * sessie-header — die (Ingelogd als.../uitloggen, terug naar bardienst)
 * hoort bij `BeheerTabs.tsx`, zelfde patroon als `ProductenLijst.tsx`.
 */
export function LedenLijst() {
  const members = useAlleLeden();
  const appSettings = useAppSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("actief");
  const [overlay, setOverlay] = useState<
    { kind: "new" } | { kind: "manage"; member: LedenbeheerLid } | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message: string) {
    setToast(message);
  }

  const lowBalanceThresholdCents =
    appSettings.status === "ready" ? appSettings.settings.lowBalanceThresholdCents : 0;

  const trimmedQuery = query.trim().toLowerCase();

  const searchedMembers = useMemo(() => {
    if (members.status !== "ready") return [];
    if (!trimmedQuery) return members.members;
    return members.members.filter((m) => m.name.toLowerCase().includes(trimmedQuery));
  }, [members, trimmedQuery]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { actief: 0, laag: 0, archief: 0 };
    for (const f of STATUS_FILTERS) {
      result[f.id] = searchedMembers.filter((m) =>
        matchesFilter(m, f.id, lowBalanceThresholdCents)
      ).length;
    }
    return result;
  }, [searchedMembers, lowBalanceThresholdCents]);

  const visibleMembers = useMemo(
    () => searchedMembers.filter((m) => matchesFilter(m, filter, lowBalanceThresholdCents)),
    [searchedMembers, filter, lowBalanceThresholdCents]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">Leden</h1>
        <button
          type="button"
          onClick={() => setOverlay({ kind: "new" })}
          className="flex h-11 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          nieuw lid
        </button>
      </div>

      <div aria-live="polite" role="status" className="min-h-[1.5rem]">
        {toast && (
          <p className="w-fit rounded-control border border-border bg-white px-3.5 py-2 text-sm font-bold text-ink">
            {toast}
          </p>
        )}
      </div>

      <div className="flex-none">
        <label htmlFor="ledenbeheer-search" className="sr-only">
          Zoek lid op naam
        </label>
        <input
          id="ledenbeheer-search"
          type="search"
          placeholder="Zoek lid op naam"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm font-medium text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="flex flex-none flex-wrap gap-2" role="group" aria-label="Status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors ${
              filter === f.id
                ? "border-ink bg-ink text-white"
                : "border-border bg-white text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {f.label}
            <span
              className={`text-[11px] font-extrabold ${
                filter === f.id ? "text-white/60" : "text-muted"
              }`}
            >
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {members.status === "loading" && (
        <p className="text-sm font-semibold text-muted" role="status">
          Ledenlijst laden…
        </p>
      )}

      {members.status === "error" && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {members.message}
        </p>
      )}

      {members.status === "ready" && members.members.length === 0 && (
        <p className="text-sm font-semibold text-muted">
          Nog geen leden — voeg het eerste toe.
        </p>
      )}

      {members.status === "ready" && members.members.length > 0 && visibleMembers.length === 0 && (
        <p className="text-sm font-semibold text-muted">geen leden gevonden</p>
      )}

      {members.status === "ready" && visibleMembers.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-2">
          {visibleMembers.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setOverlay({ kind: "manage", member })}
                className="flex w-full min-h-[44px] items-center gap-3 rounded-control px-3.5 py-3 text-left transition-colors hover:bg-canvas"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`truncate text-sm font-bold ${
                      member.archived ? "text-muted" : "text-ink"
                    }`}
                  >
                    {member.name}
                  </span>
                  {member.role === "bardienst" && (
                    <span className="flex-none rounded-full bg-border-subtle px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                      BAR
                    </span>
                  )}
                  {member.role === "beheerder" && (
                    <span className="flex-none rounded-full bg-danger-bg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-danger">
                      BEHEER
                    </span>
                  )}
                  {member.archived && (
                    <span className="flex-none rounded-full border border-border bg-canvas px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                      GEARCHIVEERD
                    </span>
                  )}
                </span>
                <span
                  className={`flex-none text-sm font-extrabold ${
                    !member.archived && member.balanceCents < lowBalanceThresholdCents
                      ? "text-danger"
                      : "text-muted"
                  }`}
                >
                  {formatCents(member.balanceCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {overlay?.kind === "new" && (
        <NieuwLidOverlay
          onClose={() => setOverlay(null)}
          onCreated={(member) => {
            members.refetch();
            setOverlay(null);
            showToast(`${member.name} toegevoegd`);
          }}
        />
      )}

      {overlay?.kind === "manage" && (
        <LidBeherenOverlay
          member={overlay.member}
          onClose={() => setOverlay(null)}
          onChanged={() => {
            members.refetch();
          }}
        />
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { useAlleLeden, type LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { useAppSettings } from "@/hooks/queries/useAppSettings";
import { formatCents } from "@/lib/money";
import { ZoekVeld } from "@/components/ZoekVeld";
import { StatusFilter as StatusChips } from "@/components/StatusFilter";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { NieuwLidOverlay } from "./NieuwLidOverlay";
import { LidBeherenOverlay } from "./LidBeherenOverlay";
import { LidBestellingenOverlay } from "@/features/bestelling-terugdraaien/LidBestellingenOverlay";

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
  const kopRef = useRef<HTMLHeadingElement>(null);
  const herstel = useLeesHerstel(members, kopRef);
  const appSettings = useAppSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("actief");
  const [overlay, setOverlay] = useState<
    | { kind: "new" }
    | { kind: "manage"; member: LedenbeheerLid }
    | { kind: "orders"; member: LedenbeheerLid }
    | null
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
        <h1 ref={kopRef} tabIndex={-1} className="text-dialog-title font-extrabold tracking-[-0.02em]">
          Leden
        </h1>
        <button
          type="button"
          onClick={() => setOverlay({ kind: "new" })}
          className="flex h-[42px] items-center gap-1.5 rounded-control bg-accent px-[18px] text-[13px] font-extrabold text-rail transition-colors hover:bg-accent-hover"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          nieuw lid
        </button>
      </div>

      <div aria-live="polite" role="status" className="empty:-mt-5">
        {toast && (
          <p className="w-fit rounded-control border border-border bg-white px-3.5 py-2 text-sm font-bold text-ink">
            {toast}
          </p>
        )}
      </div>

      <ZoekVeld
        id="ledenbeheer-search"
        label="Zoek lid op naam"
        placeholder="Zoek lid op naam"
        waarde={query}
        onChange={setQuery}
      />

      <StatusChips
        opties={STATUS_FILTERS.map((f) => ({
          id: f.id,
          label: f.label,
          aantal: counts[f.id],
          actief: filter === f.id,
          onKies: () => setFilter(f.id),
        }))}
      />

      {members.status === "loading" && !herstel.toonFout && (
        <p className="text-sm font-semibold text-muted" role="status">
          Ledenlijst laden…
        </p>
      )}

      {herstel.toonFout && (
        <LeesFout
          tone="light"
          className="items-start text-left"
          message={herstel.message}
          onRetry={herstel.retry}
          bezig={herstel.bezig}
        />
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
        <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-white">
          <p className="flex-none border-b border-border-subtle px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
            {`${visibleMembers.length} van ${members.members.length} leden`}
          </p>
        <ul className="flex flex-col overflow-auto px-1.5 py-1">
          {visibleMembers.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setOverlay({ kind: "manage", member })}
                className="flex w-full min-h-[44px] items-center gap-3 rounded-control px-2.5 py-[11px] text-left transition-colors hover:bg-canvas"
              >
                <InitialsAvatar name={member.name} size="sm" tone="light" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`truncate text-sm font-bold ${
                      member.archived ? "text-muted" : "text-ink"
                    }`}
                  >
                    {member.name}
                  </span>
                  {member.role === "bardienst" && (
                    <span className="flex-none rounded-full bg-track px-[9px] py-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-muted-strong">
                      BAR
                    </span>
                  )}
                  {member.role === "beheerder" && (
                    <span className="flex-none rounded-full bg-accent-soft px-[9px] py-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-danger">
                      BEHEER
                    </span>
                  )}
                  {member.archived && (
                    <span className="flex-none rounded-full bg-track px-[9px] py-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-muted-strong">
                      GEARCHIVEERD
                    </span>
                  )}
                </span>
                <span
                  className={`min-w-16 flex-none text-right text-[13px] font-extrabold ${
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
        </div>
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
          onOpenOrders={() => setOverlay({ kind: "orders", member: overlay.member })}
        />
      )}

      {/* Sluiten gaat terug naar de (ververste) ledenlijst, niet naar "Lid
          beheren": die overlay houdt een momentopname van het lid vast en
          zou het oude saldo tonen. */}
      {overlay?.kind === "orders" && (
        <LidBestellingenOverlay
          memberId={overlay.member.id}
          memberName={overlay.member.name}
          onClose={() => setOverlay(null)}
          onChanged={() => {
            members.refetch();
          }}
        />
      )}
    </>
  );
}

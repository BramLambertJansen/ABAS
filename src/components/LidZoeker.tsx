"use client";

import { ZoekIcoon } from "@/components/ZoekIcoon";

import { useEffect, useMemo, type KeyboardEvent } from "react";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { LeesFout } from "@/components/LeesFout";
import { useListbox } from "@/hooks/useListbox";
import { formatCents } from "@/lib/money";

export type ZoekLid = { id: string; name: string; balanceCents: number };

export const GEEN_LEDEN_GEVONDEN_TEKST = "geen leden gevonden";
export const LEDEN_LADEN_TEKST = "Leden laden…";

/** Status voor de schermlezer: het aantal gevonden leden (enkelvoud is
 *  grammatica, geen andere formulering). */
export function ledenGevondenTekst(aantal: number): string {
  return `${aantal} ${aantal === 1 ? "lid" : "leden"} gevonden`;
}

/**
 * Kies-een-lid-zoeker (autocomplete): tekstinvoer met een resultatenlijst.
 * Docs/features/invoerfeedback-zoeken-filters.md → §3.
 *
 * ARIA-combobox met `aria-autocomplete="list"`; de focus blijft in de invoer
 * en de actieve optie loopt via `aria-activedescendant`. De lijstlogica
 * (id's, open/actief, buitenklik, scroll) is `useListbox`, gedeeld met
 * `Select`. Gedrag: resultaten vanaf 1 teken en geen lijst bij lege invoer;
 * het eerste resultaat is meteen actief; ↑/↓ lopen (stoppen aan de randen),
 * Enter kiest; Escape sluit eerst de lijst (tekst blijft) en wist daarna de
 * tekst; Tab, blur en een klik buiten sluiten zonder te kiezen. De lijst
 * opent bij typen of ↓, niet bij het terugkeren naar een bewaarde zoekterm.
 * Een naam wrapt (nooit afgekapt, ook niet na twee regels: twee gelijkende
 * lange namen moeten tot het einde leesbaar blijven), saldo staat
 * rechts met de laag-saldo-markering; geen limiet op het aantal leden, de
 * lijst scrolt. Geen `title`- of hover-only informatie.
 */
export function LidZoeker({
  query,
  onQueryChange,
  members,
  status,
  errorMessage,
  onRetry,
  retryBezig,
  lowBalanceThresholdCents,
  onSelect,
  inputId = "verkoop-member-search",
}: {
  query: string;
  onQueryChange: (query: string) => void;
  members: ZoekLid[];
  status: "loading" | "error" | "ready";
  errorMessage: string | null;
  /** Herstelknop bij een leesfout: alleen de `refetch` van de ledenlijst. */
  onRetry: () => void;
  retryBezig: boolean;
  lowBalanceThresholdCents: number;
  onSelect: (id: string) => void;
  inputId?: string;
}) {
  const { listboxId, optionId, rootRef, listRef, open, setOpen, activeIndex, setActiveIndex } =
    useListbox(0);
  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      trimmed && status === "ready"
        ? members.filter((m) => m.name.toLowerCase().includes(trimmed))
        : [],
    [members, trimmed, status]
  );
  const listVisible = open && matches.length > 0;
  const zeroResults = status === "ready" && trimmed !== "" && matches.length === 0;
  // Actieve optie blijft binnen de resultaten (de lijst kan krimpen of herladen).
  const active = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  // Eén vaste live-regio: leden laden en nul resultaten zijn zichtbaar, het
  // aantal alleen voor de schermlezer. Dezelfde tekst bij hetzelfde aantal
  // verandert niets in de DOM, dus geen aankondiging per toets.
  let statusTekst = "";
  let statusZichtbaar = false;
  if (status === "loading" && trimmed) {
    statusTekst = LEDEN_LADEN_TEKST;
    statusZichtbaar = true;
  } else if (zeroResults) {
    statusTekst = GEEN_LEDEN_GEVONDEN_TEKST;
    statusZichtbaar = true;
  } else if (listVisible) {
    statusTekst = ledenGevondenTekst(matches.length);
  }

  // Een herlading van de ledenlijst behoudt de actieve optie niet.
  useEffect(() => {
    if (status !== "ready") setActiveIndex(0);
  }, [status, setActiveIndex]);

  function choose(index: number) {
    const member = matches[index];
    setOpen(false);
    if (member) onSelect(member.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (matches.length === 0) return;
        event.preventDefault();
        if (!listVisible) {
          setActiveIndex(0);
          setOpen(true);
        } else {
          setActiveIndex(Math.min(active + 1, matches.length - 1));
        }
        return;
      case "ArrowUp":
        if (!listVisible) return;
        event.preventDefault();
        setActiveIndex(Math.max(active - 1, 0));
        return;
      case "Enter":
        if (!listVisible) return;
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        // Eerst de lijst, dan pas de tekst. Altijd zelf afhandelen: de
        // browser wist een zoekveld bij Escape anders in één keer.
        if (listVisible) {
          event.preventDefault();
          setOpen(false);
        } else if (query !== "") {
          event.preventDefault();
          onQueryChange("");
        }
        return;
    }
  }

  return (
    <div ref={rootRef} className="relative flex-none">
      <ZoekIcoon className="pointer-events-none absolute left-[18px] top-[17px]" />
      <label htmlFor={inputId} className="sr-only">
        Zoek lid op naam
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listboxId}
        aria-activedescendant={listVisible ? optionId(active) : undefined}
        autoComplete="off"
        placeholder="Zoek lid op naam"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActiveIndex(0);
          setOpen(e.target.value.trim() !== "");
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        className="h-control-lg w-full rounded-card border border-border bg-surface pl-[46px] pr-[18px] text-[14.5px] font-medium text-ink shadow-surface focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
      />

      <p
        role="status"
        className={statusZichtbaar ? "mt-1 text-xs font-semibold text-muted" : "sr-only"}
      >
        {statusTekst}
      </p>

      {status === "error" && (
        <LeesFout
          tone="light"
          className="mt-2 items-start text-left"
          message={errorMessage ?? ""}
          onRetry={onRetry}
          bezig={retryBezig}
        />
      )}

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Gevonden leden"
        // De invoer houdt de focus bij klikken, tikken en slepen aan de scrollbalk.
        onMouseDown={(event) => event.preventDefault()}
        // `hidden` als klasse, niet als attribuut: `flex` zou het attribuut
        // overschrijven (zelfde patroon als Select).
        className={`absolute inset-x-0 top-14 z-30 ${listVisible ? "flex" : "hidden"} max-h-[300px] flex-col overflow-auto rounded-card border border-border bg-surface p-[7px] shadow-dropdown`}
      >
        {matches.map((member, index) => {
          const low = member.balanceCents < lowBalanceThresholdCents;
          const isActive = index === active;
          return (
            // Muisinteractie op een listbox-optie; het toetsenbord loopt via
            // de combobox-invoer (aria-activedescendant), zoals bij Select.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={member.id}
              id={optionId(index)}
              role="option"
              aria-selected={isActive}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              className={`flex min-h-control cursor-pointer items-center gap-3 rounded-control p-2.5 text-left transition-colors ${
                isActive ? "bg-canvas" : ""
              }`}
            >
              <InitialsAvatar name={member.name} size="sm" tone="light" />
              <span className="min-w-0 flex-1 wrap-break-word text-sm font-bold text-ink">
                {member.name}
              </span>
              <span
                className={`flex flex-none items-center gap-1 text-[13px] font-extrabold ${
                  low ? "text-danger" : "text-muted"
                }`}
              >
                {low && (
                  <>
                    <span aria-hidden="true">⚠</span>
                    <span className="sr-only">laag saldo,</span>
                  </>
                )}
                {formatCents(member.balanceCents)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

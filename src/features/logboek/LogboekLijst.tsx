"use client";

import { useId, useMemo, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { LOGBOEK_LIMIT, useLogboek, type LogboekEntry } from "@/hooks/queries/useLogboek";
import { logboekKey } from "@/hooks/queries/logboekSamenvoegen";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import {
  LOGBOEK_FILTERS,
  clockLabel,
  countLabel,
  describeRow,
  filterLogboek,
  groepeerPerDag,
  logboekEmptyState,
  reikwijdteTekst,
  type LogboekFilterId,
} from "./logboek";

// Stabiele referentie voor de loading-/foutstaat, zodat `entries` hieronder
// niet bij elke render een nieuwe `[]` teruggeeft — anders ziet de
// useMemo-dependency hieronder telkens een "gewijzigde" waarde.
const NO_ENTRIES: LogboekEntry[] = [];

/**
 * Logboek — de vierde tab in `BeheerTabs.tsx` (docs/features/logboek.md).
 * Leesscherm: org-brede gebeurtenissen (verkoop, opwaardering,
 * terugdraaiing) per dag in Nederlandse tijd, doorzoekbaar en filterbaar
 * (docs/features/logboek-chronologisch-reikwijdte.md). Assortiment/Leden
 * hebben geen databron — hun chip zegt dat eerlijk, geen foutmelding. Het
 * scherm meldt altijd welke historie het toont en of die beperkt is.
 */
export function LogboekLijst() {
  const logboek = useLogboek();
  const kopRef = useRef<HTMLHeadingElement>(null);
  const herstel = useLeesHerstel(logboek, kopRef);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LogboekFilterId>("alles");

  const entries = logboek.status === "ready" ? logboek.entries : NO_ENTRIES;
  const beperkt = logboek.status === "ready" && logboek.beperkt;
  const reikwijdte = { beperkt, limit: LOGBOEK_LIMIT };
  const dagId = useId();
  // Bij render bepaald: de dagkop volgt de rijen, niet de klok.
  const nu = new Date();
  const filtered = useMemo(
    () => filterLogboek(entries, { query, filter }),
    [entries, query, filter]
  );
  const emptyState = logboekEmptyState(filter, filtered.length, entries.length, reikwijdte);

  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <h1 ref={kopRef} tabIndex={-1} className="text-dialog-title font-extrabold tracking-[-0.02em]">
          Logboek
        </h1>
        {logboek.status === "ready" && (
          <span className="whitespace-nowrap text-metadata font-bold text-muted">
            {countLabel(filtered.length, entries.length, reikwijdte)}
          </span>
        )}
      </div>
      {logboek.status === "ready" && (
        <p className="text-metadata font-semibold text-muted">{reikwijdteTekst(reikwijdte)}</p>
      )}

      <div className="flex flex-none flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <svg
            width="17"
            height="17"
            viewBox="0 0 17 17"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2 text-muted-light"
          >
            <circle cx="7.2" cy="7.2" r="5" stroke="currentColor" strokeWidth="1.7" />
            <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <label htmlFor="logboek-search" className="sr-only">
            Zoek op naam, product of handeling
          </label>
          <input
            id="logboek-search"
            type="search"
            placeholder="Zoek op naam, product of handeling"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-control w-full rounded-control border border-border bg-white pl-[42px] pr-4 text-detail font-medium text-ink focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/12"
          />
        </div>
        <div
          role="group"
          aria-label="Filter"
          className="flex flex-none flex-wrap gap-[3px] rounded-control bg-canvas p-[3px]"
        >
          {LOGBOEK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-9 whitespace-nowrap rounded-[9px] px-3 text-[11.5px] font-bold transition-colors ${
                filter === f.id
                  ? "bg-ink text-white"
                  : "text-muted-strong hover:bg-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-[180px] flex-1 flex-col overflow-auto rounded-card border border-border bg-white px-1.5 py-1">
        {logboek.status === "loading" && !herstel.toonFout && (
          <p className="py-11 text-center text-detail font-bold text-muted" role="status">
            Logboek laden…
          </p>
        )}
        {herstel.toonFout && (
          <LeesFout
            tone="light"
            className="py-11"
            message={herstel.message}
            onRetry={herstel.retry}
            bezig={herstel.bezig}
          />
        )}
        {logboek.status === "ready" && emptyState && (
          <div className="flex flex-col gap-[5px] px-[30px] py-10 text-center">
            <span className="text-detail font-extrabold text-muted-strong">
              {emptyState.title}
            </span>
            <span className="text-xs font-semibold text-muted">{emptyState.hint}</span>
          </div>
        )}
        {logboek.status === "ready" && !emptyState && (
          <div>
            {groepeerPerDag(filtered, nu).map((dag) => (
              <section key={dag.key} aria-labelledby={`${dagId}-${dag.key}`}>
                <h2
                  id={`${dagId}-${dag.key}`}
                  className="px-2.5 pb-1 pt-3 text-[12px] font-extrabold text-muted-strong"
                >
                  {dag.label}
                </h2>
                <ul>
                  {dag.entries.map((entry) => (
                    <LogboekRow key={logboekKey(entry)} entry={entry} nu={nu} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function LogboekRow({ entry, nu }: { entry: LogboekEntry; nu: Date }) {
  const { tag, action, detail, statusLabel } = describeRow(entry, nu);
  const flagged = tag === "LET OP";

  return (
    <li
      className={`flex items-center gap-[11px] rounded-control border-b border-border-subtle px-2.5 py-3 ${
        flagged ? "border-l-[3px] border-l-danger bg-accent-soft" : "border-l-[3px] border-l-transparent"
      }`}
    >
      <span className="min-w-[42px] flex-none text-metadata font-bold text-muted">
        {clockLabel(entry.createdAt)}
      </span>
      <span
        className={`min-w-[76px] flex-none rounded-full px-2 py-1 text-center text-[9px] font-extrabold uppercase tracking-[0.09em] ${
          // Zelfde bg-accent-soft/text-danger-paar als LedenLijst.tsx's
          // BEHEER-badge — kleur is hier niet het enige onderscheid, de
          // tekst "LET OP" zelf is dat (a11y, spec → Schermflow §3).
          flagged ? "bg-white text-danger" : "bg-track text-success"
        }`}
      >
        {tag}
      </span>
      <span className="flex-none" title={entry.actorName}>
        <InitialsAvatar name={entry.actorName} size="chip" tone="light" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span
          className={`truncate text-detail ${flagged ? "font-extrabold text-danger" : "font-bold text-ink"} ${
            statusLabel ? "line-through" : ""
          }`}
        >
          {action}
        </span>
        <span
          className={`text-[11.5px] font-semibold text-muted ${flagged ? "wrap-break-word" : "truncate"}`}
        >
          {detail}
          {statusLabel && <span className="font-extrabold text-muted-strong"> · {statusLabel}</span>}
          <span className="sr-only">, door {entry.actorName}</span>
        </span>
      </div>
    </li>
  );
}

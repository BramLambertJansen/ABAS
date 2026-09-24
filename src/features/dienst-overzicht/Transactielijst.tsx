"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LedgerEntry } from "@/hooks/queries/useShiftLedger";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { formatCents } from "@/lib/money";
import {
  ALL_PEOPLE,
  clockLabel,
  filterLedger,
  groupByHour,
  peopleWithCounts,
} from "./ledger";

type LedgerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: LedgerEntry[] };

/**
 * Alleen-lezen transactielijst van de dienst: zoeken, filteren op wie het
 * boekte, gegroepeerd per uur (ontwerp regel 152–210). Zie
 * docs/features/dienst-overzicht.md → Transactielijst voor wat er bewust
 * niet in zit (Alles/Geld/Assortiment-filter, terugdraaien).
 */
export function Transactielijst({
  ledger,
  showServedBy,
  onReverse,
}: {
  ledger: LedgerState;
  /** Initialen van wie de boeking deed — alleen zinvol met meer dan één
   *  persoon in de bezetting, zelfde regel als het ontwerp. */
  showServedBy: boolean;
  /** Opent de terugdraai-overlay voor een verkoop die nog niet is
   *  teruggedraaid (docs/features/bestelling-terugdraaien.md → Bar). */
  onReverse: (entry: LedgerEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState(ALL_PEOPLE);

  const entries = ledger.status === "ready" ? ledger.entries : [];
  const people = peopleWithCounts(entries);
  const activePersonId = people.some((p) => p.id === personId)
    ? personId
    : ALL_PEOPLE;
  const groups = groupByHour(
    filterLedger(entries, { query, personId: activePersonId })
  );
  const trimmedQuery = query.trim();

  return (
    <>
      <div className="flex flex-none flex-wrap items-center gap-2.5">
        <div className="relative min-w-[110px] flex-[1_1_120px]">
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
          <label htmlFor="dienst-ledger-search" className="sr-only">
            Zoek op naam of product
          </label>
          <input
            id="dienst-ledger-search"
            type="search"
            placeholder="Zoek op naam of product"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[52px] w-full rounded-[14px] border border-border bg-white pl-[42px] pr-[18px] text-[14.5px] font-semibold text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/[0.12]"
          />
        </div>
        {people.length > 0 && (
          <PersonFilter
            people={people}
            total={entries.length}
            activeId={activePersonId}
            onChange={setPersonId}
          />
        )}
      </div>

      <div className="flex min-h-[180px] flex-[1_1_auto] flex-col overflow-auto rounded-card border border-border bg-white px-4 pb-1.5">
        {ledger.status === "loading" && (
          <p className="py-11 text-center text-[13.5px] font-bold text-muted" role="status">
            Boekingen laden…
          </p>
        )}
        {ledger.status === "error" && (
          <p className="py-11 text-center text-[13.5px] font-bold text-danger" role="alert">
            {ledger.message}
          </p>
        )}
        {ledger.status === "ready" && groups.length === 0 && (
          <div className="flex flex-col gap-[5px] px-[34px] py-11 text-center">
            <span className="text-[13.5px] font-extrabold text-muted">
              {trimmedQuery
                ? `Niets gevonden voor “${trimmedQuery}”`
                : "Nog niets geboekt deze dienst"}
            </span>
            <span className="text-xs font-semibold text-muted">
              {trimmedQuery
                ? "Probeer een naam of productnaam"
                : "Elke bestelling en opwaardering komt hier te staan"}
            </span>
          </div>
        )}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="sticky top-0 z-[2] flex items-baseline justify-between gap-3 bg-white pb-[7px] pt-3.5">
              <h2 className="text-[10px] font-extrabold tracking-[0.12em] text-muted">
                {group.label}
              </h2>
              <span className="text-[10.5px] font-bold text-muted">
                {group.orderCount > 0
                  ? `${formatCents(group.turnoverCents)} omzet · ${group.orderCount} ${
                      group.orderCount === 1 ? "bestelling" : "bestellingen"
                    }`
                  : `${group.entries.length} ${
                      group.entries.length === 1 ? "boeking" : "boekingen"
                    }`}
              </span>
            </div>
            <ul>
              {group.entries.map((entry) => (
                <LedgerRow
                  key={entry.id}
                  entry={entry}
                  showServedBy={showServedBy}
                  onReverse={onReverse}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function LedgerRow({
  entry,
  showServedBy,
  onReverse,
}: {
  entry: LedgerEntry;
  showServedBy: boolean;
  onReverse: (entry: LedgerEntry) => void;
}) {
  const isSale = entry.kind === "verkoop";
  const reversed = entry.reversal !== null;
  const detail = isSale
    ? `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "items"}${
        entry.reversal ? ` · teruggedraaid · ${entry.reversal.reason}` : ""
      }`
    : `opgewaardeerd · ${entry.method ?? ""}`;

  return (
    <li className="-mx-2.5 flex flex-none items-center gap-3.5 rounded-control border-b border-border-subtle px-2.5 py-[13px]">
      <span className="min-w-[42px] flex-none text-[12.5px] font-bold text-muted">
        {clockLabel(entry.createdAt)}
      </span>
      <span
        className={`flex-none rounded-full bg-canvas px-[9px] py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${
          isSale ? "text-ink" : "text-success"
        }`}
      >
        {entry.kind}
      </span>
      {showServedBy && (
        <span className="flex-none" title={entry.servedByName}>
          <InitialsAvatar name={entry.servedByName} size="chip" tone="light" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm font-bold">
          {entry.memberName ?? "Losse verkoop"}
        </span>
        <span className="truncate text-[11.5px] font-semibold text-muted">
          {detail}
          {showServedBy && <span className="sr-only">, door {entry.servedByName}</span>}
        </span>
      </div>
      <div className="flex min-w-[84px] flex-none flex-col items-end gap-px">
        <span
          className={`whitespace-nowrap text-right text-sm font-extrabold ${
            reversed ? "text-muted line-through" : isSale ? "text-ink" : "text-success"
          }`}
        >
          {isSale ? "− " : "+ "}
          {formatCents(entry.amountCents)}
          {reversed && <span className="sr-only"> (teruggedraaid)</span>}
        </span>
        <span className="text-[10px] font-bold tracking-[0.07em] text-muted">
          {reversed ? "TERUG" : "SALDO"}
        </span>
      </div>
      {isSale && !reversed ? (
        <button
          type="button"
          onClick={() => onReverse(entry)}
          aria-label={`Bestelling terugdraaien: ${entry.memberName ?? "losse verkoop"}, ${clockLabel(
            entry.createdAt
          )}, ${formatCents(entry.amountCents)}`}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-control text-base font-extrabold text-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <span aria-hidden="true">⤺</span>
        </button>
      ) : (
        <span aria-hidden="true" className="w-10 flex-none" />
      )}
    </li>
  );
}

function PersonFilter({
  people,
  total,
  activeId,
  onChange,
}: {
  people: { id: string; name: string; count: number }[];
  total: number;
  activeId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Buiten de lijst klikken sluit hem, net als de scrim in het ontwerp —
  // via document-listeners i.p.v. een klikbare overlay-div, zodat er geen
  // niet-focusbaar klikdoel bijkomt. Escape sluit hem ook en zet de focus
  // terug op de knop.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const options = [{ id: ALL_PEOPLE, name: "Iedereen", count: total }, ...people];
  const active = options.find((o) => o.id === activeId) ?? options[0];
  const dark = activeId !== ALL_PEOPLE || open;

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative flex-none">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Geboekt door: ${active.name}, ${active.count}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[52px] select-none items-center gap-[9px] rounded-[14px] border pl-[15px] pr-[13px] transition-colors ${
          dark ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
        }`}
      >
        <span className="whitespace-nowrap text-[13.5px] font-bold">{active.name}</span>
        <span
          className={`flex-none rounded-full px-[7px] py-0.5 text-[11px] font-extrabold ${
            dark ? "bg-white/[0.16] text-white" : "bg-border-subtle text-muted-strong"
          }`}
        >
          {active.count}
        </span>
        <span
          aria-hidden="true"
          className={`inline-block text-[11px] font-extrabold leading-none opacity-[.55] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          className="absolute right-0 top-12 z-[21] flex min-w-[200px] origin-top-right flex-col gap-0.5 rounded-card border border-border bg-white p-1.5 shadow-[0_16px_40px_rgba(27,30,35,0.14)]"
        >
          {options.map((option) => {
            const selected = option.id === activeId;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose(option.id)}
                  className={`flex h-[42px] w-full items-center gap-2.5 rounded-[11px] px-[13px] text-left text-[13.5px] font-bold transition-colors ${
                    selected ? "bg-ink text-white" : "text-ink hover:bg-canvas"
                  }`}
                >
                  <span className="flex-1 truncate">{option.name}</span>
                  <span
                    className={`flex-none rounded-full px-[7px] py-0.5 text-[11px] font-extrabold ${
                      selected ? "bg-white/[0.16] text-white" : "bg-border-subtle text-muted-strong"
                    }`}
                  >
                    {option.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

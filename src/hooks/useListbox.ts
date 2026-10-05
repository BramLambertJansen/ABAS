"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Gedeelde lijstlogica van `Select` (knop-combobox) en `LidZoeker`
 * (tekst-combobox): id's voor `aria-controls`/`aria-activedescendant`, de
 * open/dicht-state, de actieve optie, sluiten bij een `pointerdown` buiten de
 * component en de actieve optie in beeld houden als de lijst scrolt. De
 * toetsen en de opmaak blijven bij het component zelf, want die verschillen
 * (select-only versus autocomplete).
 */
export function useListbox(initialActive = 0) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialActive);

  // Klik buiten de component sluit de lijst.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Houd de actieve optie in beeld als de lijst scrolt.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(activeIndex))}`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  return {
    listboxId,
    optionId,
    rootRef,
    listRef,
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
  };
}

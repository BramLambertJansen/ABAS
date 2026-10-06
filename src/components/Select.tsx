"use client";

import type { KeyboardEvent } from "react";
import { useListbox } from "@/hooks/useListbox";

export type SelectOption = { value: string; label: string };

/**
 * Eigen dropdown in plaats van een native `<select>`, waarvan het uitgeklapte
 * menu door het OS/de browser getekend wordt en niet te stylen is. Visueel
 * naar designs/Bar App.dc.html → "VOOR WELKE ACTIVITEIT" (trigger met draaiend
 * caret, zwevend menu met afgeronde rijen en een ✓ bij de gekozen optie),
 * vertaald naar de donkere `rail`-tokens.
 *
 * Toegankelijkheid volgt het WAI-ARIA "select-only combobox"-patroon: de
 * trigger is een `role="combobox"`-knop die de focus houdt, het menu een
 * `role="listbox"`; de actieve optie loopt via `aria-activedescendant`.
 * De lijstlogica (id's, open/actief, buitenklik, scroll) staat in
 * `useListbox`, gedeeld met `LidZoeker`. Toetsen: ↓/↑/Enter/Spatie openen, ↓/↑/Home/End bewegen, Enter/Spatie
 * kiezen, Escape sluit, Tab kiest niets en sluit, letters springen naar de
 * eerste optie met die beginletter.
 */
export function Select({
  label,
  options,
  value,
  placeholder,
  onChange,
  disabled = false,
  invalid = false,
}: {
  /** Toegankelijke naam; niet zichtbaar (de omringende UI geeft context). */
  label: string;
  options: SelectOption[];
  value: string | null;
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const selectedIndex = options.findIndex((o) => o.value === value);
  const {
    listboxId,
    optionId,
    rootRef,
    listRef,
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
  } = useListbox(Math.max(selectedIndex, 0));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function openMenu() {
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    if (option) onChange(option.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || options.length === 0) return;
    const last = options.length - 1;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, last));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        return;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
    }

    if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLocaleLowerCase("nl");
      const count = options.length;
      for (let step = 1; step <= count; step++) {
        const index = (activeIndex + step) % count;
        if (options[index].label.toLocaleLowerCase("nl").startsWith(letter)) {
          setActiveIndex(index);
          return;
        }
      }
    }
  }

  const triggerBorder = open
    ? "border-accent ring-[3px] ring-accent/20 focus-visible:outline-none"
    : invalid
      ? "border-rail-error"
      : "border-rail-border hover:border-rail-muted focus-visible:outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20";

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className={`flex h-12 w-full items-center gap-2.5 rounded-control border bg-rail-card px-3.5 text-left text-sm font-bold transition-[border-color,box-shadow] duration-150 disabled:opacity-50 ${triggerBorder}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selected ? "text-white" : "font-semibold text-rail-muted"
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <span
          aria-hidden="true"
          className={`size-2 flex-none border-b-2 border-r-2 border-rail-muted transition-transform duration-150 ${
            open ? "translate-y-0.5 rotate-[225deg]" : "-translate-y-0.5 rotate-45"
          }`}
        />
      </button>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={label}
        // `hidden` als klasse, niet als attribuut: `flex` zou het attribuut
        // overschrijven.
        className={`absolute inset-x-0 top-[calc(100%+6px)] z-10 ${open ? "flex" : "hidden"} max-h-60 flex-col gap-0.5 overflow-auto rounded-card border border-rail-border bg-rail-card p-1.5 shadow-[0_22px_48px_-16px_rgba(0,0,0,0.7)]`}
      >
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const isActive = open && index === activeIndex;
          return (
            // Muisinteractie op een listbox-optie; het toetsenbord loopt via
            // de combobox-trigger (aria-activedescendant), zie hierboven.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={isSelected}
              onPointerEnter={() => setActiveIndex(index)}
              // Voorkomt dat de trigger focus verliest bij klikken.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-sm font-bold ${
                isSelected ? "text-accent-hover" : "text-white"
              } ${isActive ? "bg-white/[0.07]" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span
                aria-hidden="true"
                className={`flex-none text-[13px] font-extrabold text-accent ${
                  isSelected ? "" : "invisible"
                }`}
              >
                ✓
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useShell } from "@/lib/shell/ShellProvider";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * First shared overlay primitive (src/components/ was empty until this
 * spec — see docs/features/bezetting-beheren.md → useShell()-contract).
 * Renders a secondary view according to useShell().overlay: a centered
 * modal dialog (bar-shell) or a bottom sheet (portal-shell, first built for
 * docs/features/portal-profiel.md → useShell()-contract). Both variants
 * share one code path for everything below; only layout/position differ.
 *
 * Wit, zoals elke dialoog in designs/Bar App.dc.html (`background:#fff`,
 * radius 20, padding 26) — ook boven de donkere rail-schermen. Inhoud
 * gebruikt dus de lichte tokens (`text-ink`, `text-muted`, `border-border`,
 * `text-danger`), niet de `rail-*`-familie.
 *
 * Sheet (prototype designs/Lid App.dc.html, `sheetWrapStyle`): onderaan
 * verankerd, volle breedte, afgeronde bovenhoeken, lichte `canvas`-
 * achtergrond, en een inschuifanimatie die alleen draait zonder
 * `prefers-reduced-motion` (`motion-safe:`, plus de globale reductie in
 * globals.css). Bewust geen sleepgebaar om te sluiten (spec →
 * useShell()-contract, WCAG 2.5.1): sluiten gaat via de eigen knoppen,
 * Escape en backdrop.
 *
 * Required regardless of variant: role="dialog", aria-modal="true", labelled
 * by `title`, focus moves into the dialog on mount and returns to whatever
 * was focused before on unmount, a focus trap while open, and Escape /
 * backdrop-click both call `onClose`.
 */
export function Overlay({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const shell = useShell();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Move focus in on mount, return it to whatever triggered the overlay on
  // unmount (parent conditionally mounts/unmounts this, never toggles a
  // hidden prop — so mount/unmount is the open/close lifecycle).
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Backdrop-tap-to-close, done via a document-level listener rather than
  // an onClick on the backdrop <div> itself — the backdrop is decorative,
  // not a focusable/interactive element, so attaching a click handler to it
  // directly would need a fake interactive role (jsx-a11y flags exactly
  // that). This gets the same UX without pretending a plain div is a
  // button; the dialog's own controls (Escape, "Klaar") are the real
  // keyboard-accessible ways to close.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const container = dialogRef.current;
      if (container && !container.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  const isSheet = shell.overlay === "sheet";

  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      className={
        isSheet
          ? "flex max-h-[88vh] w-full flex-col gap-[14px] overflow-auto rounded-t-[28px] bg-canvas px-[22px] pb-7 pt-[22px] text-ink focus:outline-none motion-safe:animate-sheet-in"
          : "flex max-h-[88vh] w-full max-w-[460px] flex-col gap-4 overflow-auto rounded-[20px] bg-white p-[26px] text-ink shadow-[0_30px_70px_-20px_rgba(0,0,0,0.55)] focus:outline-none"
      }
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-[19px] font-extrabold tracking-tight text-ink">
          {title}
        </h2>
        {description && (
          <p
            id={descriptionId}
            className={
              isSheet
                ? "text-sm font-medium leading-relaxed text-muted"
                : "text-[12.5px] font-semibold leading-relaxed text-muted"
            }
          >
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );

  switch (shell.overlay) {
    case "modal":
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/55 p-4">
          {dialog}
        </div>
      );
    case "sheet":
      return <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40">{dialog}</div>;
    default: {
      const _exhaustive: never = shell.overlay;
      return _exhaustive;
    }
  }
}

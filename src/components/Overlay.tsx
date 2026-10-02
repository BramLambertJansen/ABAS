"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useShell } from "@/lib/shell/ShellProvider";
import { useRegisterOverlay } from "./OverlayPresence";
import { acquireOverlay } from "./overlayShield";
import { WEGGOOIEN_KNOP, WEGGOOIEN_TERUG_KNOP, WEGGOOIEN_VRAAG } from "@/lib/opslaan";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const DEFAULT_CLOSE_BLOCKED_MESSAGE = "Even wachten, de actie wordt nog verwerkt.";

/** Elementen in de dialoog die nu echt met Tab bereikbaar zijn: zichtbaar,
 *  niet disabled, niet `tabindex="-1"`, niet in een hidden/inert-tak of een
 *  disabled fieldset. */
function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.getAttribute("tabindex") !== "-1" &&
      !el.closest("[hidden], [inert], fieldset:disabled") &&
      getComputedStyle(el).visibility !== "hidden" &&
      el.getClientRects().length > 0
  );
}

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
 *
 * Met `titleRef` kan de aanroeper de focus naar de titel zetten bij een
 * nieuwe stap binnen dezelfde overlay (`useFocusNaWissel`, besloten 12 in
 * docs/features/beheer-tweede-factor.md); de titel krijgt dan
 * `tabIndex={-1}`.
 *
 * Focus, achtergrond en sluiten (docs/features/dialogen-tabs-landmarks.md):
 * - Tab/Shift+Tab verlaten de dialoog nooit: de volgorde wordt berekend over
 *   de nu bereikbare elementen; staat de focus op de container, een titel of
 *   een net disabled element, dan gaat Tab naar het eerste en Shift+Tab naar
 *   het laatste. `focusin` buiten de dialoog trekt de focus terug.
 * - Zolang de dialoog open is, is de achtergrond `inert` (siblings van de
 *   voorouderketen, geen portal) en ligt de scroll van het document vast.
 *   Beide lopen via een gedeelde teller (`overlayShield.ts`) zodat een
 *   overgang overlay A → B niets heropent. Een element dat in een sibling
 *   van de overlay-tak staat is dus niet bedienbaar zolang de dialoog open is.
 * - `closeBlocked`: zolang waar, doet elk sluitpad (Escape, backdrop) niets
 *   behalve de `role="status"`-melding `closeBlockedMessage` tonen; de dialoog
 *   krijgt `aria-busy`. De consument houdt eigen sluitknoppen `disabled`.
 * - `onopgeslagen` (docs/features/opslaan-sluiten-pending.md, besluit B):
 *   zolang waar vragen Escape en backdrop eerst om bevestiging, inline in
 *   dezelfde dialoog (ADR 0014: nooit een tweede overlay): "Weggooien" sluit,
 *   "Terug" (of nogmaals Escape/backdrop) laat de dialoog staan. De eigen
 *   Sluiten/Annuleren-knoppen van de consument gooien bewust wél direct weg
 *   en lopen dus niet via deze vraag. `closeBlocked` wint altijd.
 * - Bij sluiten gaat de focus naar de trigger als die nog bestaat en
 *   bruikbaar is; anders naar `returnFocusFallback`, het actieve tabpanel of
 *   `main`. Bij een overgang A → B blijft de oorspronkelijke trigger gelden.
 * - Een variant (bv. een bredere detailweergave) mag de layout wijzigen,
 *   niet deze regels.
 *
 * Meldt zich bij mount aan bij `OverlayPresenceProvider` en bij unmount weer
 * af (ADR 0014) — zonder provider doet dat niets.
 */
export function Overlay({
  title,
  description,
  onClose,
  titleRef,
  closeBlocked = false,
  closeBlockedMessage = DEFAULT_CLOSE_BLOCKED_MESSAGE,
  onopgeslagen = false,
  returnFocusFallback,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  /** Zolang waar worden Escape en backdrop geweigerd en wordt de melding
   *  getoond. Eigen knoppen van de consument blijven diens zaak. */
  closeBlocked?: boolean;
  closeBlockedMessage?: string;
  /** Er is invoer die nog niet is opgeslagen: Escape en backdrop vragen
   *  eerst om bevestiging. Alleen waar als de invoer afwijkt van de laatst
   *  opgeslagen waarde (zie `src/lib/opslaan.ts`). */
  onopgeslagen?: boolean;
  /** Opvolger voor de focus als de trigger bij sluiten niet meer bestaat. */
  returnFocusFallback?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const shell = useShell();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const registerOverlay = useRegisterOverlay();

  // ADR 0014: tel mee zolang deze overlay gemount is. `registerOverlay` is
  // stabiel, dus dit draait alleen bij mount en unmount. Layout-effect, niet
  // passief: de teller moet al bijgewerkt zijn voordat een passief effect
  // elders (DienstTeLangOpenMelding) hem leest, anders ziet dat nog 0 terwijl
  // deze overlay al in beeld staat.
  useLayoutEffect(() => registerOverlay(), [registerOverlay]);

  const rootRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [blockedAttempt, setBlockedAttempt] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const confirmId = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const beforeConfirmRef = useRef<HTMLElement | null>(null);
  const wasConfirmingRef = useRef(false);

  // Altijd de nieuwste waarden zonder de document-listeners te herbinden.
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(closeBlocked);
  const onopgeslagenRef = useRef(onopgeslagen);
  const confirmingRef = useRef(confirmingDiscard);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    closeBlockedRef.current = closeBlocked;
    onopgeslagenRef.current = onopgeslagen;
    confirmingRef.current = confirmingDiscard;
  });

  // Eén sluitverzoek voor Escape en backdrop: bij `closeBlocked` geen
  // `onClose`, wel de melding. De focus blijft waar hij is. Bij onopgeslagen
  // invoer eerst de inline vraag; tijdens die vraag betekent nogmaals
  // Escape/backdrop "terug", nooit stil weggooien.
  const requestCloseRef = useRef(() => {
    if (closeBlockedRef.current) setBlockedAttempt(true);
    else if (confirmingRef.current) setConfirmingDiscard(false);
    else if (onopgeslagenRef.current) setConfirmingDiscard(true);
    else onCloseRef.current();
  });

  useEffect(() => {
    if (!closeBlocked) setBlockedAttempt(false);
  }, [closeBlocked]);

  // De vraag vervalt zodra er niets meer te verliezen valt of er een opslag loopt.
  useEffect(() => {
    if (closeBlocked || !onopgeslagen) setConfirmingDiscard(false);
  }, [closeBlocked, onopgeslagen]);

  // Focus naar "Terug" als de vraag opent (veilige standaard), en bij sluiten
  // van de vraag terug naar waar hij stond.
  useEffect(() => {
    if (confirmingDiscard) {
      wasConfirmingRef.current = true;
      const active = document.activeElement as HTMLElement | null;
      beforeConfirmRef.current = active && dialogRef.current?.contains(active) ? active : null;
      backRef.current?.focus();
      return;
    }
    if (!wasConfirmingRef.current) return;
    wasConfirmingRef.current = false;
    const back = beforeConfirmRef.current;
    beforeConfirmRef.current = null;
    const container = dialogRef.current;
    if (!container) return;
    const active = document.activeElement;
    // Alleen herstellen als de focus niet al elders in de dialoog staat.
    if (active && active !== document.body && container.contains(active) && active !== container) return;
    if (back && back.isConnected && !back.matches(":disabled")) back.focus();
    else container.focus();
  }, [confirmingDiscard]);

  // Pending: een control die tijdens `closeBlocked` disabled wordt, laat de
  // browser de focus stil naar body zetten. Dan terug naar de dialoogcontainer,
  // zodat toetsenbord en schermlezer binnen de dialoog blijven. De browser doet
  // die "focus fixup" pas bij de volgende rendering, dus ook na een frame
  // nogmaals controleren.
  useLayoutEffect(() => {
    if (!closeBlocked) return;
    function herstel() {
      const container = dialogRef.current;
      if (!container) return;
      const active = document.activeElement as HTMLElement | null;
      const verloren =
        !active ||
        active === document.body ||
        active === document.documentElement ||
        !container.contains(active) ||
        active.matches(":disabled") ||
        !!active.closest("[inert], [hidden], fieldset:disabled");
      if (verloren) container.focus();
    }
    herstel();
    const frame = requestAnimationFrame(herstel);
    return () => cancelAnimationFrame(frame);
  }, [closeBlocked]);

  // Achtergrond inert + scrolllock + trigger onthouden (zie overlayShield.ts),
  // en de focus naar binnen. Layout-effect: de achtergrond mag geen frame
  // bedienbaar zijn. Mount/unmount is de open/close-lifecycle (de ouder
  // mount/unmount deze, nooit een hidden-prop). De trigger wordt hier gelezen
  // vóórdat de focus naar de dialoog gaat; teruggeven gebeurt in de shield.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const release = acquireOverlay(root, returnFocusFallback);
    dialogRef.current?.focus();
    return release;
    // returnFocusFallback is een ref-object (stabiel); alleen mount/unmount telt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const container = dialogRef.current;
      if (!container) return;
      const focusable = tabbableIn(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inList = !!active && focusable.includes(active);
      if (!inList) {
        // Container, titel, een net disabled element, of buiten de dialoog.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Vangnet: komt de focus toch buiten de dialoog (muis, programmatisch,
    // schermlezer), dan terug naar de laatst bekende plek, anders de container.
    function onFocusIn(event: FocusEvent) {
      const container = dialogRef.current;
      const target = event.target as Node | null;
      if (!container || !target) return;
      if (container.contains(target)) {
        if (target !== container) lastFocusedRef.current = target as HTMLElement;
        return;
      }
      const back = lastFocusedRef.current;
      if (back && back.isConnected && container.contains(back) && tabbableIn(container).includes(back)) {
        back.focus();
      } else {
        container.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  // Backdrop-tik sluit, via een document-listener in plaats van een onClick op
  // de backdrop-<div>: die is decoratief, geen bedienbaar element, en een
  // klikhandler erop vraagt een nep-rol (jsx-a11y). Dialoog-eigen
  // toetsenbordwegen zijn Escape en de knoppen. `mousedown` blijft: touch
  // genereert die ook, dus de tik op de telefoon-sheet werkt hetzelfde.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const container = dialogRef.current;
      if (container && !container.contains(event.target as Node)) {
        // Geen focusverlies naar body door de tik op de backdrop: ook een
        // geblokkeerde backdrop-tik laat de focus waar hij is.
        event.preventDefault();
        requestCloseRef.current();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const isSheet = shell.overlay === "sheet";

  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={closeBlocked ? true : undefined}
      tabIndex={-1}
      className={
        isSheet
          ? "flex max-h-[88vh] w-full flex-col gap-[14px] overflow-auto rounded-t-[28px] bg-canvas px-[22px] pb-7 pt-[22px] text-ink focus:outline-none motion-safe:animate-sheet-in"
          : "flex max-h-[88vh] w-full max-w-[460px] flex-col gap-4 overflow-auto rounded-[20px] bg-white p-[26px] text-ink shadow-[0_30px_70px_-20px_rgba(0,0,0,0.55)] focus:outline-none"
      }
    >
      <div className="flex flex-col gap-1">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="text-[19px] font-extrabold tracking-tight text-ink outline-none"
        >
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
      {confirmingDiscard && (
        <div
          role="group"
          aria-labelledby={confirmId}
          className="flex flex-col gap-3 rounded-control border border-border bg-canvas p-3.5"
        >
          <p id={confirmId} className="text-sm font-bold text-ink">
            {WEGGOOIEN_VRAAG}
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="flex h-11 flex-1 items-center justify-center rounded-control border border-danger bg-white text-sm font-bold text-danger transition-colors hover:bg-canvas"
            >
              {WEGGOOIEN_KNOP}
            </button>
            <button
              ref={backRef}
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
            >
              {WEGGOOIEN_TERUG_KNOP}
            </button>
          </div>
        </div>
      )}
      {/* Altijd gemount, alleen de tekst wisselt: dan kondigt een
          schermlezer hem aan. Status, geen alert: dit is geen fout. */}
      <p
        role="status"
        className={
          closeBlocked && blockedAttempt
            ? "text-center text-[12.5px] font-semibold text-muted"
            : "sr-only"
        }
      >
        {closeBlocked && blockedAttempt ? closeBlockedMessage : ""}
      </p>
    </div>
  );

  switch (shell.overlay) {
    case "modal":
      return (
        <div ref={rootRef} className="fixed inset-0 z-50 flex items-center justify-center bg-rail/55 p-4">
          {dialog}
        </div>
      );
    case "sheet":
      return (
        <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40">
          {dialog}
        </div>
      );
    default: {
      const _exhaustive: never = shell.overlay;
      return _exhaustive;
    }
  }
}

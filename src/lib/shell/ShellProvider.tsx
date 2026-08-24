"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Capabilities a shell exposes to shell-agnostic `features/` components.
 * Never branch on device (`isMobile`/`matchMedia`/`userAgent`) — read this
 * instead. See CLAUDE.md → Shells.
 *
 * The exact contract beyond these three fields is still open — see
 * docs/ARCHITECTURE.md "Shells" for what's settled vs. proposed. Extend this
 * type, don't reach around it, when a feature needs something it doesn't
 * yet expose.
 */
export type ShellCapabilities = {
  /** Layout density — how tightly components may pack. */
  density: "comfortable" | "compact";
  /** How a feature should present a secondary view: a full route, a modal,
   *  or a bottom sheet. */
  overlay: "modal" | "sheet";
  /** Hint for list/grid components: how many columns fit. */
  columns: number;
};

const ShellContext = createContext<ShellCapabilities | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellCapabilities;
  children: ReactNode;
}) {
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

/** Throws outside a ShellProvider on purpose — every shell entry point must
 *  set one explicitly (see src/app/layout.tsx and src/app/portal/layout.tsx)
 *  rather than a feature silently falling back to a device guess. */
export function useShell(): ShellCapabilities {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error(
      "useShell() called outside a ShellProvider — every shell's layout must wrap its children in one."
    );
  }
  return ctx;
}

import type { Metadata, Viewport } from "next";
import { ShellProvider } from "@/lib/shell/ShellProvider";
import { barCapabilities } from "@/shells/bar/capabilities";

/**
 * Makes `shells/bar` installable (issue #4) — manifest + icons only, no
 * service worker/offline caching (deliberately out of scope, see
 * CLAUDE.md → Shells). Scoped to this layout, not the root one, so
 * `shells/portal` (a sibling route segment, not a child of this layout)
 * stays uninvolved — it isn't a PWA target for this ticket.
 */
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's icons for "Add to Home Screen" — needs its
  // own explicit link, hence public/apple-touch-icon.png alongside the
  // manifest-referenced icons in public/icons/.
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    title: "ABAS Bar",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ee5a24",
};

/**
 * Routes `/` through the `bar` shell. Path-based routing (bar at "/",
 * portal at "/portal") is a scaffold default, not a confirmed decision —
 * flag it in a feature spec before relying on it (subdomains are a
 * plausible alternative for a real deployment).
 */
export default function BarShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShellProvider value={barCapabilities}>{children}</ShellProvider>;
}

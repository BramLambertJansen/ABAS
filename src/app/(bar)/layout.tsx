import { ShellProvider } from "@/lib/shell/ShellProvider";
import { barCapabilities } from "@/shells/bar/capabilities";

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

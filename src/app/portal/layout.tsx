import { ShellProvider } from "@/lib/shell/ShellProvider";
import { portalCapabilities } from "@/shells/portal/capabilities";

/** Routes `/portal` through the `portal` shell. See src/app/(bar)/layout.tsx
 *  for the routing-scheme caveat — applies here too. */
export default function PortalShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShellProvider value={portalCapabilities}>{children}</ShellProvider>;
}

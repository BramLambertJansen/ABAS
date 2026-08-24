import type { ShellCapabilities } from "@/lib/shell/ShellProvider";

/** shells/portal — phone-first, also usable on desktop. See CLAUDE.md →
 *  Shells. Not started as a real product surface yet, see
 *  docs/ARCHITECTURE.md scope. */
export const portalCapabilities: ShellCapabilities = {
  density: "compact",
  overlay: "sheet",
  columns: 1,
};

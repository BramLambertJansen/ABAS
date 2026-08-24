import type { ShellCapabilities } from "@/lib/shell/ShellProvider";

/** shells/bar — tablet/desktop only, never phone, no fallback, no support.
 *  See CLAUDE.md → Shells. */
export const barCapabilities: ShellCapabilities = {
  density: "comfortable",
  overlay: "modal",
  columns: 4,
};

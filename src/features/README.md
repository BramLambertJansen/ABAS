# features/

Shell-agnostic screens/flows. A file here must not know whether it's
rendering inside `shells/bar` or `shells/portal` — read `useShell()`
(`src/lib/shell/ShellProvider.tsx`) for layout hints instead of branching on
device or importing anything shell-specific. See CLAUDE.md → Shells.

Empty until the first approved spec in `docs/features/` gets built.

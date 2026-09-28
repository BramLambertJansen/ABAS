import { TabletKoppelen } from "@/features/tablet-koppelen/TabletKoppelen";
import { koppelTablet } from "./actions";

/**
 * Thin routing wrapper only — same pattern as src/app/(bar)/page.tsx. The
 * screen lives in src/features/tablet-koppelen/ and stays shell-agnostic;
 * the server action is handed in as a prop so features/ imports nothing
 * from app/ (docs/features/tablet-koppelen.md → Betrokken shell).
 */
export default function KoppelPage() {
  return <TabletKoppelen koppel={koppelTablet} />;
}

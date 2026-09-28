"use client";

import { usePortalSession } from "@/hooks/queries/usePortalSession";
import { PortalLogin } from "@/features/portal-login/PortalLogin";
import { PortalDashboard } from "@/features/portal-dashboard/PortalDashboard";

/**
 * `/portal`'s entrypoint — docs/features/portal-login.md → Betrokken shell,
 * "Gewijzigd", nu verder uitgebreid door docs/features/portal-dashboard.md
 * (#16) → Betrokken shell, "Gewijzigd". Echte branch op
 * `usePortalSession()`:
 *
 *   - geen sessie → `PortalLogin` (het inlogformulier).
 *   - sessie zonder gekoppeld `members`-record → dezelfde neutrale "niet
 *     gekoppeld"-melding, getoond via `PortalLogin`'s `deniedMessage`
 *     (zelfde vorm als `Assortimentbeheer.tsx`'s gebruik van
 *     `BeheerLogin`'s `deniedMessage`).
 *   - sessie met een `members`-record, elke rol (ADR 0012, #17) →
 *     `PortalDashboard` (eigen saldo, transacties en account).
 *     `session.refetch` gaat mee als `onProfileChanged`: dit is de
 *     instantie waar de header zijn naam vandaan haalt.
 */
export default function PortalShellHome() {
  const session = usePortalSession();

  if (session.status === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
        <p className="text-sm font-medium text-muted" role="status">
          Bezig met laden…
        </p>
      </main>
    );
  }

  if (session.status === "signed-in") {
    return (
      <PortalDashboard
        name={session.name}
        email={session.email}
        onSignOut={() => session.signOut()}
        onProfileChanged={session.refetch}
      />
    );
  }

  return (
    <PortalLogin deniedMessage={session.status === "denied" ? session.message : undefined} />
  );
}

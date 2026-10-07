"use client";

import { useRef } from "react";
import { usePortalSession } from "@/hooks/queries/usePortalSession";
import { PortalLogin } from "@/features/portal-login/PortalLogin";
import { PortalDashboard } from "@/features/portal-dashboard/PortalDashboard";
import { LeesFout } from "@/components/LeesFout";
import { useFocusNaHerstel } from "@/hooks/useFocusNaHerstel";

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
 *   - sessielookup mislukt (netwerk, 5xx, schemafout) → `LeesFout` met
 *     "Opnieuw proberen" en "Uitloggen"; nooit de "niet gekoppeld"-melding
 *     (docs/features/portal-sessielookup-laadfout.md, #115).
 *   - sessie met een `members`-record, elke rol (ADR 0012, #17) →
 *     `PortalDashboard` (eigen saldo, transacties en account).
 *     `session.refetch` gaat mee als `onProfileChanged`: dit is de
 *     instantie waar de header zijn naam vandaan haalt.
 */
export default function PortalShellHome() {
  const session = usePortalSession();
  const kopRef = useRef<HTMLHeadingElement>(null);
  const meldingRef = useRef<HTMLParagraphElement>(null);
  // Na een geslaagde retry verdwijnt de foutknop; de focus gaat naar de
  // dashboardkop, nooit naar body (T06). `denied` krijgt een eigen aanroep (meldingsregel).
  useFocusNaHerstel(
    session.status === "error" ? "error" : session.status === "signed-in" ? "ready" : "loading",
    kopRef,
  );
  // Herstel dat `denied` oplevert: focus naar de meldingsregel van PortalLogin.
  useFocusNaHerstel(
    session.status === "error" ? "error" : session.status === "denied" ? "ready" : "loading",
    meldingRef,
  );

  if (session.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center gap-3 bg-canvas p-6 text-center sm:border-x sm:border-border">
        <p className="text-sm font-medium text-muted" role="status">
          Bezig met laden…
        </p>
      </main>
    );
  }

  if (session.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center gap-3 bg-canvas p-6 text-center sm:border-x sm:border-border">
        <LeesFout
          tone="light"
          message={session.message}
          bezig={session.bezig}
          onRetry={session.refetch}
        />
        <button
          type="button"
          onClick={() => session.signOut()}
          className="flex h-11 items-center rounded-control px-4 text-sm font-bold text-muted underline underline-offset-2 hover:text-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Uitloggen
        </button>
      </main>
    );
  }

  if (session.status === "signed-in") {
    return (
      <PortalDashboard
        key={session.userId}
        kopRef={kopRef}
        name={session.name}
        email={session.email}
        onSignOut={() => session.signOut()}
        onProfileChanged={session.refetch}
      />
    );
  }

  return (
    <PortalLogin
      deniedMessage={session.status === "denied" ? session.message : undefined}
      meldingRef={meldingRef}
    />
  );
}

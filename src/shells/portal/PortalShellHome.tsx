"use client";

import { usePortalSession } from "@/hooks/queries/usePortalSession";
import { PortalLogin } from "@/features/portal-login/PortalLogin";

/**
 * `/portal`'s entrypoint — docs/features/portal-login.md → Betrokken shell,
 * "Gewijzigd". Echte branch op `usePortalSession()`, niet langer een
 * statische placeholder:
 *
 *   - geen sessie → `PortalLogin` (het inlogformulier).
 *   - sessie die niet naar een actief `lid`-record herleidt → dezelfde
 *     neutrale "niet gekoppeld"-melding, getoond via `PortalLogin`'s
 *     `deniedMessage` (zelfde vorm als `Assortimentbeheer.tsx`'s gebruik van
 *     `BeheerLogin`'s `deniedMessage`).
 *   - actieve `lid`-sessie → minimale, nog steeds placeholder "ingelogd
 *     als {naam}" + uitlog-knop. Er is nog geen saldo-/transactiescherm
 *     (later ticket) — dit is precies genoeg om acceptatiecriterium 4 ("de
 *     portal toont geen ingelogde staat totdat het lid daadwerkelijk zelf
 *     inlogt") objectief te kunnen verifiëren.
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center font-sans text-ink">
        <h1 className="text-xl font-extrabold tracking-tight">Welkom, {session.name}</h1>
        <p className="max-w-xs text-sm font-medium text-muted">
          Ingelogd als {session.email}.
        </p>
        <button
          type="button"
          onClick={() => session.signOut()}
          className="flex h-11 items-center justify-center rounded-control border border-border bg-white px-5 text-sm font-bold text-ink transition-colors hover:border-ink"
        >
          Uitloggen
        </button>
      </main>
    );
  }

  return (
    <PortalLogin deniedMessage={session.status === "denied" ? session.message : undefined} />
  );
}

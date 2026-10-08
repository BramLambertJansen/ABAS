"use client";

import { Knop } from "@/components/Knop";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { useFocusNaWissel } from "@/hooks/useFocusNaWissel";
import { CodeInvoer } from "@/components/CodeInvoer";
import { TWEESTAP_TEKSTEN, type CodeFout } from "@/lib/mfa";
import { NieuwWachtwoordVelden, isPasswordReady } from "@/components/NieuwWachtwoordVelden";
import { passwordUpdateErrorMessage } from "@/lib/authErrors";
import { usePortalNieuwWachtwoordInstellen } from "@/hooks/queries/usePortalWachtwoordHerstellen";

/**
 * `/portal/wachtwoord-herstellen` — docs/features/portal-login.md →
 * Schermflow → "Wachtwoord vergeten". Analoog aan
 * `src/features/assortimentbeheer/WachtwoordHerstellen.tsx`, eigen bestand
 * (portalClient.ts, ADR 0009). De link uit de Reset Password-mail landt hier
 * met `?token_hash=...&type=recovery` (ADR 0008); het token wordt pas bij
 * verzenden ingewisseld. Na een geslaagde wijziging: uitgelogd en terug naar
 * `/portal?wachtwoord=gewijzigd` (bewust "terug naar inloggen, opnieuw
 * inloggen", niet chat30's "direct ingelogd" — zie de spec voor de
 * motivatie).
 */
export function PortalWachtwoordHerstellen({ tokenHash }: { tokenHash: string | null }) {
  const herstel = usePortalNieuwWachtwoordInstellen(tokenHash);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  // Focus naar de kop van de code-stap na "Wachtwoord opslaan" (besloten 12
  // in docs/features/beheer-tweede-factor.md).
  const codeKopRef = useRef<HTMLHeadingElement>(null);
  const codeStap = herstel.status === "code";
  const markeerWissel = useFocusNaWissel(codeStap, (code) => (code ? codeKopRef.current : null));

  useEffect(() => {
    if (herstel.status === "done") {
      // Volledige navigatie, geen client-side route — zelfde reden als
      // WachtwoordHerstellen.tsx (`/beheer`): na signOut() moet de
      // eerstvolgende request het inlogformulier laten zien, niet een
      // stale client-side state.
      window.location.assign("/portal?wachtwoord=gewijzigd");
    }
  }, [herstel.status]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isPasswordReady(password, repeat)) return;
    markeerWissel();
    await herstel.setNewPassword(password);
  }

  const linkInvalid = herstel.errorCode === "link_invalid";

  // Tweede factor (docs/features/beheer-tweede-factor.md, ADR 0017): heeft
  // het account een factor, dan eerst de code, dan het nieuwe wachtwoord.
  async function verifieerCode(code: string): Promise<CodeFout | null> {
    const fout = await herstel.verifieer(code);
    if (!fout) await herstel.setNewPassword(password);
    return fout;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 font-sans text-ink sm:border-x sm:border-border">
      <AuroraMerk>
        <h1 className="text-xl font-extrabold tracking-tight">Nieuw wachtwoord instellen</h1>
      </AuroraMerk>

      {codeStap ? (
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-6">
          <h2 ref={codeKopRef} tabIndex={-1} className="text-sm font-medium leading-relaxed text-muted outline-hidden">
            {TWEESTAP_TEKSTEN.wachtwoordCodeStap}
          </h2>
          <CodeInvoer tone="light" onVerifieer={verifieerCode} />
        </div>
      ) : linkInvalid ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center">
          <p className="text-sm font-bold text-danger" role="alert">
            Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.
          </p>
          <Knop
            href="/portal?wachtwoord=vergeten"
            variant="primair"
            maat="groot"
            className="w-full"
          >
            Nieuwe link aanvragen
          </Knop>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-6"
        >
          <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
            {herstel.errorCode && herstel.errorCode !== "link_invalid"
              ? passwordUpdateErrorMessage(herstel.errorCode)
              : ""}
          </p>

          <NieuwWachtwoordVelden
            password={password}
            repeat={repeat}
            onPasswordChange={setPassword}
            onRepeatChange={setRepeat}
          />

          <Knop
            variant="primair" maat="groot" className="w-full"
            type="submit"
            aria-disabled={
              !isPasswordReady(password, repeat) ||
              herstel.status === "pending" ||
              herstel.status === "done"
            }
          >
            Wachtwoord opslaan
          </Knop>

          <Link href="/portal" className="text-center text-xs font-semibold text-muted hover:text-ink">
            ← terug naar inloggen
          </Link>
        </form>
      )}
    </main>
  );
}

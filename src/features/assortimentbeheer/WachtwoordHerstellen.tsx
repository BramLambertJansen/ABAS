"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { useFocusNaWissel } from "@/hooks/useFocusNaWissel";
import { CodeInvoer } from "@/components/CodeInvoer";
import { TWEESTAP_TEKSTEN, type CodeFout } from "@/lib/mfa";
import { NieuwWachtwoordVelden, isPasswordReady } from "@/components/NieuwWachtwoordVelden";
import { passwordUpdateErrorMessage } from "@/lib/authErrors";
import { useNieuwWachtwoordInstellen } from "@/hooks/queries/useWachtwoordHerstellen";

/**
 * `/beheer/wachtwoord-herstellen` — stap 3 van docs/features/
 * wachtwoord-vergeten.md. De link uit de Reset Password-mail landt hier met
 * `?token_hash=...&type=recovery` (ADR 0008); het token wordt pas bij
 * verzenden ingewisseld, zie useNieuwWachtwoordInstellen. Na een geslaagde
 * wijziging: uitgelogd en terug naar het inlogscherm (spec → besluit 2).
 */
export function WachtwoordHerstellen({ tokenHash }: { tokenHash: string | null }) {
  const herstel = useNieuwWachtwoordInstellen(tokenHash);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  // Focus naar de kop van de code-stap na "Wachtwoord opslaan" (besloten 12
  // in docs/features/beheer-tweede-factor.md).
  const codeKopRef = useRef<HTMLHeadingElement>(null);
  const codeStap = herstel.status === "code";
  const markeerWissel = useFocusNaWissel(codeStap, (code) => (code ? codeKopRef.current : null));

  useEffect(() => {
    if (herstel.status === "done") {
      // Volledige navigatie, geen client-side route: src/middleware.ts moet
      // de gedeelde tablet-sessie opnieuw kunnen zetten na de signOut().
      window.location.assign("/beheer?wachtwoord=gewijzigd");
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
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 font-sans text-ink">
      <AuroraMerk>
        <h1 className="text-xl font-extrabold tracking-tight">Nieuw wachtwoord instellen</h1>
      </AuroraMerk>

      {codeStap ? (
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-white p-6">
          <h2 ref={codeKopRef} tabIndex={-1} className="text-sm font-medium leading-relaxed text-muted outline-none">
            {TWEESTAP_TEKSTEN.wachtwoordCodeStap}
          </h2>
          <CodeInvoer tone="light" onVerifieer={verifieerCode} />
        </div>
      ) : linkInvalid ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center">
          <p className="text-sm font-bold text-danger" role="alert">
            Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.
          </p>
          <Link
            href="/beheer?wachtwoord=vergeten"
            className="flex h-12 w-full items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
          >
            Nieuwe link aanvragen
          </Link>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-white p-6"
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

          <button
            type="submit"
            disabled={
              !isPasswordReady(password, repeat) ||
              herstel.status === "pending" ||
              herstel.status === "done"
            }
            className="flex h-12 w-full items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            Wachtwoord opslaan
          </button>

          <Link href="/beheer" className="text-center text-xs font-semibold text-muted hover:text-ink">
            ← terug naar inloggen
          </Link>
        </form>
      )}
    </main>
  );
}

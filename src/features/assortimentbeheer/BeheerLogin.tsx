"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useBeheerLogin, type BeheerLoginErrorCode } from "@/hooks/queries/useBeheerLogin";

function errorMessage(code: BeheerLoginErrorCode): string {
  switch (code) {
    case "invalid_credentials":
      return "onjuist e-mailadres of wachtwoord";
    case "rate_limited":
      return "te veel pogingen — probeer het over een paar minuten opnieuw";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * `/beheer`'s own, minimal inlogformulier (ADR 0002/0003) — e-mail +
 * magic link of wachtwoord, een keuze van de ingelogde persoon zelf.
 * Gegeneraliseerd van "beheerder-only" naar "bardienst-of-beheerder"
 * (docs/features/auth-methode-per-lid.md, #42, ADR 0004): dit formulier is
 * niet langer de beheerder-ingang alleen, het is de gegarandeerde
 * e-mail/wachtwoord-ingang voor iedereen met bardienst- of beheerrechten —
 * zie `ModusKeuze.tsx` voor de Bar/Beheer/Mijn-account-keuze die na een
 * geslaagde login volgt. Geen bar-modus-knop híer op het inlogformulier
 * zelf (ADR 0003 → "Geen zichtbare 'bar'-knop in #14's inlogflow" — dat
 * bleef zo, de keuze zit één scherm verderop). Er is hier bewust geen
 * bestaand formulier-patroon om op aan te sluiten — dit is de eerste
 * e-mail-inlogflow in deze codebase (PIN via StaffPicker/PinPad is een
 * ander mechanisme, zie src/features/dienst-starten/).
 *
 * `deniedMessage` is optioneel en komt van `useBeheerSession.ts`: er ís een
 * sessie (bv. de gedeelde device-sessie), maar die herleidt niet naar een
 * actieve bardienst/beheerder — zelfde soort boodschap als de RPC's
 * `no_admin_role`/`no_bar_role`/`actor_not_found` teruggeven, hier vóór het
 * inloggen al zichtbaar in plaats van pas na een mislukte schrijfactie.
 */
export function BeheerLogin({ deniedMessage }: { deniedMessage?: string }) {
  const login = useBeheerLogin();
  const [method, setMethod] = useState<"magic_link" | "password">("magic_link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailId = useId();
  const passwordId = useId();
  const methodLegendId = useId();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (method === "magic_link") {
      await login.signInWithMagicLink(email);
    } else {
      await login.signInWithPassword(email, password);
    }
  }

  const magicLinkSent = login.status === "magic_link_sent";

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 font-sans text-ink">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-[0_10px_26px_-6px_rgba(238,90,36,0.7)]">
          A
        </div>
        <span className="text-[10.5px] font-bold tracking-[0.15em] text-muted">
          AURORA MUZIEKVERENIGING
        </span>
        {/* Neutrale kop, geen "Beheer" meer vóór een modus gekozen is —
            docs/features/auth-methode-per-lid.md → Schermflow stap 1: dit
            formulier is de ingang voor bardienst én beheerder, niet alleen
            voor beheer. */}
        <h1 className="text-xl font-extrabold tracking-tight">Inloggen</h1>
      </div>

      {deniedMessage && !magicLinkSent && (
        <p
          role="alert"
          className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-3 text-center text-sm font-bold text-danger"
        >
          {deniedMessage}
        </p>
      )}

      {magicLinkSent ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center">
          <p className="text-sm font-bold text-ink" role="status">
            We hebben een inloglink gestuurd naar {login.magicLinkSentTo}.
          </p>
          <p className="text-xs font-medium text-muted">
            Open die link op dit apparaat om in te loggen.
          </p>
          <button
            type="button"
            onClick={() => login.reset()}
            className="text-xs font-semibold text-muted underline hover:text-ink"
          >
            Andere inlogmethode
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-white p-6"
        >
          <p className="min-h-[1.25rem] text-sm font-bold text-danger" role="alert">
            {login.errorCode ? errorMessage(login.errorCode) : ""}
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailId} className="text-xs font-bold text-muted">
              E-mailadres
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend id={methodLegendId} className="text-xs font-bold text-muted">
              Inlogmethode
            </legend>
            <div className="flex gap-2" role="group" aria-labelledby={methodLegendId}>
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-control border px-3 py-2.5 text-xs font-bold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "magic_link"
                    ? "border-accent bg-white text-ink"
                    : "border-border bg-white text-muted"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value="magic_link"
                  checked={method === "magic_link"}
                  onChange={() => setMethod("magic_link")}
                  className="sr-only"
                />
                Magic link
              </label>
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-control border px-3 py-2.5 text-xs font-bold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "password"
                    ? "border-accent bg-white text-ink"
                    : "border-border bg-white text-muted"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value="password"
                  checked={method === "password"}
                  onChange={() => setMethod("password")}
                  className="sr-only"
                />
                Wachtwoord
              </label>
            </div>
          </fieldset>

          {method === "password" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={passwordId} className="text-xs font-bold text-muted">
                Wachtwoord
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={login.status === "pending"}
            className="flex h-12 w-full items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {method === "magic_link" ? "Stuur inloglink" : "Inloggen"}
          </button>

          <Link href="/" className="text-center text-xs font-semibold text-muted hover:text-ink">
            ← terug naar bardienst
          </Link>
        </form>
      )}
    </main>
  );
}

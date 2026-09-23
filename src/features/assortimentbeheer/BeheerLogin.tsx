"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { RATE_LIMITED_MESSAGE } from "@/lib/authErrors";
import { useBeheerLogin, type BeheerLoginErrorCode } from "@/hooks/queries/useBeheerLogin";
import { useWachtwoordResetAanvragen } from "@/hooks/queries/useWachtwoordHerstellen";

function errorMessage(code: BeheerLoginErrorCode): string {
  switch (code) {
    case "invalid_credentials":
      return "onjuist e-mailadres of wachtwoord";
    case "rate_limited":
      return RATE_LIMITED_MESSAGE;
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * `/beheer`'s own, minimal inlogformulier (ADR 0002/0003) — e-mail +
 * magic link of wachtwoord, een keuze van de ingelogde persoon zelf.
 * Gegeneraliseerd van "beheerder-only" naar "bardienst-of-beheerder"
 * (docs/features/auth-methode-per-lid.md, #42, ADR 0005): dit formulier is
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
 *
 * "Wachtwoord vergeten?" (docs/features/wachtwoord-vergeten.md) is een
 * tweede weergave van dit formulier, geen eigen route: aanvragen gebeurt
 * hier, het nieuwe wachtwoord instellen op /beheer/wachtwoord-herstellen.
 * Die route stuurt terug met `?wachtwoord=gewijzigd` (melding hierboven het
 * formulier) of `?wachtwoord=vergeten` (link verlopen → direct de
 * aanvraagweergave). Gelezen uit window.location in een effect i.p.v.
 * useSearchParams(), dat een Suspense-grens rond /beheer zou vereisen, en
 * daarna meteen uit de URL gehaald: anders toont een latere remount (bv. na
 * Uitloggen) de melding opnieuw.
 *
 * Wisselen tussen weergaven verplaatst de focus expliciet (WCAG 2.4.3): de
 * aangeklikte knop verdwijnt, zonder dit viel de focus terug op <body>.
 */
export function BeheerLogin({ deniedMessage }: { deniedMessage?: string }) {
  const login = useBeheerLogin();
  const resetRequest = useWachtwoordResetAanvragen();
  const [view, setView] = useState<"login" | "forgot">("login");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [method, setMethod] = useState<"magic_link" | "password">("magic_link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailId = useId();
  const passwordId = useId();
  const methodLegendId = useId();
  const forgotHeadingId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const forgotHeadingRef = useRef<HTMLHeadingElement>(null);
  const forgotSentRef = useRef<HTMLParagraphElement>(null);
  const magicLinkSentRef = useRef<HTMLParagraphElement>(null);
  // Alleen na een wissel door de gebruiker, niet bij de eerste render.
  const focusAfterSwitch = useRef(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("wachtwoord");
    if (param === "gewijzigd") {
      setPasswordChanged(true);
      setMethod("password");
    } else if (param === "vergeten") {
      setView("forgot");
    }
    if (param !== null) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const magicLinkSent = login.status === "magic_link_sent";

  useEffect(() => {
    if (!focusAfterSwitch.current) return;
    if (view === "login") {
      if (magicLinkSent) {
        magicLinkSentRef.current?.focus();
      } else {
        emailRef.current?.focus();
      }
    } else if (resetRequest.status === "sent") {
      forgotSentRef.current?.focus();
    } else {
      forgotHeadingRef.current?.focus();
    }
  }, [view, resetRequest.status, magicLinkSent]);

  function openForgot() {
    focusAfterSwitch.current = true;
    resetRequest.reset();
    setPasswordChanged(false);
    setView("forgot");
  }

  function backToLogin() {
    focusAfterSwitch.current = true;
    resetRequest.reset();
    setView("login");
  }

  async function onSubmitForgot(event: FormEvent) {
    event.preventDefault();
    focusAfterSwitch.current = true;
    await resetRequest.requestReset(email);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (method === "magic_link") {
      focusAfterSwitch.current = true;
      await login.signInWithMagicLink(email);
    } else {
      await login.signInWithPassword(email, password);
    }
  }

  function otherLoginMethod() {
    focusAfterSwitch.current = true;
    login.reset();
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 font-sans text-ink">
      <AuroraMerk>
        {/* Neutrale kop, geen "Beheer" meer vóór een modus gekozen is —
            docs/features/auth-methode-per-lid.md → Schermflow stap 1: dit
            formulier is de ingang voor bardienst én beheerder, niet alleen
            voor beheer. */}
        <h1 className="text-xl font-extrabold tracking-tight">Inloggen</h1>
      </AuroraMerk>

      {passwordChanged && view === "login" && (
        <p
          role="status"
          className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-3 text-center text-sm font-bold text-success"
        >
          Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.
        </p>
      )}

      {deniedMessage && !magicLinkSent && !passwordChanged && view === "login" && (
        <p
          role="alert"
          className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-3 text-center text-sm font-bold text-danger"
        >
          {deniedMessage}
        </p>
      )}

      {view === "forgot" ? (
        resetRequest.status === "sent" ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center">
            <p
              ref={forgotSentRef}
              tabIndex={-1}
              className="text-sm font-bold text-ink outline-none"
              role="status"
            >
              Als er een account bij {resetRequest.sentTo} hoort, hebben we een link gestuurd
              om een nieuw wachtwoord in te stellen.
            </p>
            <p className="text-xs font-medium text-muted">De link is 1 uur geldig.</p>
            <button
              type="button"
              onClick={backToLogin}
              className="text-xs font-semibold text-muted underline hover:text-ink"
            >
              ← terug naar inloggen
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmitForgot}
            aria-labelledby={forgotHeadingId}
            className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-white p-6"
          >
            <div className="flex flex-col gap-1">
              <h2
                id={forgotHeadingId}
                ref={forgotHeadingRef}
                tabIndex={-1}
                className="text-base font-extrabold text-ink outline-none"
              >
                Wachtwoord vergeten
              </h2>
              <p className="text-xs font-medium text-muted">
                Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord in te stellen.
              </p>
            </div>

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

            <button
              type="submit"
              disabled={resetRequest.status === "pending"}
              className="flex h-12 w-full items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Stuur herstellink
            </button>

            <button
              type="button"
              onClick={backToLogin}
              className="text-center text-xs font-semibold text-muted hover:text-ink"
            >
              ← terug naar inloggen
            </button>
          </form>
        )
      ) : magicLinkSent ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center">
          <p
            ref={magicLinkSentRef}
            tabIndex={-1}
            className="text-sm font-bold text-ink outline-none"
            role="status"
          >
            We hebben een inloglink gestuurd naar {login.magicLinkSentTo}.
          </p>
          <p className="text-xs font-medium text-muted">
            Open de link in de mail om in te loggen — dat mag ook op een ander apparaat.
          </p>
          <button
            type="button"
            onClick={otherLoginMethod}
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
              ref={emailRef}
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
              <button
                type="button"
                onClick={openForgot}
                className="self-end text-xs font-semibold text-muted underline hover:text-ink"
              >
                Wachtwoord vergeten?
              </button>
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

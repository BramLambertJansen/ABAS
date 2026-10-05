"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { RATE_LIMITED_MESSAGE } from "@/lib/authErrors";
import { usePortalLogin, type PortalLoginErrorCode } from "@/hooks/queries/usePortalLogin";
import { usePortalWachtwoordHerstellen } from "@/hooks/queries/usePortalWachtwoordHerstellen";

function errorMessage(code: PortalLoginErrorCode): string {
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
 * `/portal`'s inlogscherm — docs/features/portal-login.md → Schermflow stap
 * 1. Structureel hetzelfde patroon als `BeheerLogin.tsx` (methode-keuze,
 * focusbeheer na wisselen (WCAG 2.4.3), `aria-disabled` i.p.v. `disabled` op
 * de verstuur-knop, #77-patroon) maar een eigen bestand — de twee formulieren
 * delen vorm/precedent, niet code (spec → "Herbruik"): `usePortalLogin.ts`
 * gebruikt `portalClient.ts` (ADR 0009), `useBeheerLogin.ts` gebruikt
 * `client.ts`, en de portal-only `check:arch`-regel verbiedt de eerste om de
 * tweede te importeren.
 *
 * Geen pincode-optie (spec → "Onderzocht in /designs/") — alleen magic link
 * en wachtwoord, allebei altijd actief (CLAUDE.md → Auth: voor `lid` geen
 * either/or, geen verplichting).
 *
 * `deniedMessage` komt van `usePortalSession()` (via `PortalShellHome.tsx`):
 * er ís een sessie, maar die herleidt niet naar een actief `lid`-record.
 *
 * Magic-link-melding is bewust altijd hetzelfde, ongeacht de uitkomst
 * (issue #70, geen e-mail-enumeratie) — zie `usePortalLogin.ts`.
 *
 * `?wachtwoord=gewijzigd`/`?wachtwoord=vergeten` komen van
 * `/portal/wachtwoord-herstellen` (resp. een geslaagde wijziging, resp. een
 * verlopen/gebruikte link) — zelfde patroon als `BeheerLogin.tsx`, gelezen
 * uit `window.location` in een effect i.p.v. `useSearchParams()` (die een
 * Suspense-grens rond `/portal` zou vereisen), en meteen uit de URL gehaald
 * zodat een latere remount de melding niet herhaalt.
 */
export function PortalLogin({
  deniedMessage,
  meldingRef,
}: {
  deniedMessage?: string;
  /** Focusdoel voor de meldingsregel (na een herstelde sessielookup die `denied` oplevert). */
  meldingRef?: RefObject<HTMLParagraphElement | null>;
}) {
  const login = usePortalLogin();
  const resetRequest = usePortalWachtwoordHerstellen();
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
  const loginPending = login.status === "pending";

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
    if (loginPending) return;
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
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-canvas px-6 py-8 font-sans text-ink">
      <AuroraMerk>
        <h1 className="text-xl font-extrabold tracking-tight">Jouw barsaldo</h1>
      </AuroraMerk>

      {passwordChanged && view === "login" && (
        <p
          role="status"
          className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-3 text-center text-sm font-bold text-ink"
        >
          Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.
        </p>
      )}

      {deniedMessage && !magicLinkSent && !passwordChanged && view === "login" && (
        <p
          ref={meldingRef}
          tabIndex={-1}
          role="alert"
          className="w-full max-w-sm rounded-2xl border border-border bg-white px-4 py-3 text-center text-sm font-bold text-danger outline-none"
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
              Als er een account bij {resetRequest.sentTo} hoort, hebben we een link gestuurd om
              een nieuw wachtwoord in te stellen.
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
                className="h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-accent"
              />
            </div>

            <button
              type="submit"
              aria-disabled={resetRequest.status === "pending"}
              className="flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
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
            Als er een account bij {login.magicLinkSentTo} hoort, hebben we een inloglink
            gestuurd.
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
          <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
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
              className="h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-accent"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend id={methodLegendId} className="text-xs font-bold text-muted">
              Inlogmethode
            </legend>
            {/* text-muted-strong, niet text-muted, voor de niet-actieve tab:
                text-muted op bg-track is 4.35:1 (axe/check:a11y, faalt WCAG
                AA's 4.5:1 voor 12px bold) — text-muted zelf is alleen tegen
                canvas/wit geijkt (tailwind.config.ts), niet tegen track. */}
            <div
              className="flex gap-1 rounded-2xl bg-track p-1"
              role="group"
              aria-labelledby={methodLegendId}
            >
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "magic_link" ? "bg-white text-ink" : "text-muted-strong"
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
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "password" ? "bg-white text-ink" : "text-muted-strong"
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
                className="h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-accent"
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

          {/* aria-disabled, niet disabled: een disabled knop verliest de
              focus (#77). onSubmit blokkeert dubbel versturen zelf. */}
          <button
            type="submit"
            aria-disabled={loginPending}
            className="flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {method === "magic_link" ? "Stuur mij een inloglink" : "Inloggen"}
          </button>
        </form>
      )}
    </main>
  );
}

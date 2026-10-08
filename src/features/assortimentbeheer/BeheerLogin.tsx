"use client";

import { Knop } from "@/components/Knop";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { StartScherm } from "@/components/StartScherm";
import { AuroraMerk } from "@/components/AuroraMerk";
import { TekstVeld } from "@/components/TekstVeld";
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
    <StartScherm>
      <AuroraMerk tone="dark">
        {/* Neutrale kop, geen "Beheer" meer vóór een modus gekozen is —
            docs/features/auth-methode-per-lid.md → Schermflow stap 1: dit
            formulier is de ingang voor bardienst én beheerder, niet alleen
            voor beheer. */}
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Inloggen</h1>
      </AuroraMerk>

      {passwordChanged && view === "login" && (
        <p
          role="status"
          className="w-full max-w-sm rounded-card border border-rail-border bg-surface-rail px-4 py-3 text-center text-sm font-bold text-rail-light"
        >
          Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.
        </p>
      )}

      {deniedMessage && !magicLinkSent && !passwordChanged && view === "login" && (
        <p
          role="alert"
          className="w-full max-w-sm rounded-card border border-rail-border bg-surface-rail px-4 py-3 text-center text-sm font-bold text-rail-error"
        >
          {deniedMessage}
        </p>
      )}

      {view === "forgot" ? (
        resetRequest.status === "sent" ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-rail-border bg-surface-rail p-6 text-center">
            <p
              ref={forgotSentRef}
              tabIndex={-1}
              className="text-sm font-bold text-white outline-hidden"
              role="status"
            >
              Als er een account bij {resetRequest.sentTo} hoort, hebben we een link gestuurd
              om een nieuw wachtwoord in te stellen.
            </p>
            <p className="text-xs font-medium text-rail-muted">De link is 1 uur geldig.</p>
            <Knop
              variant="tekst" tone="rail"
              onClick={backToLogin}
            >
              ← terug naar inloggen
            </Knop>
          </div>
        ) : (
          <form
            onSubmit={onSubmitForgot}
            aria-labelledby={forgotHeadingId}
            className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-rail-border bg-surface-rail p-6"
          >
            <div className="flex flex-col gap-1">
              <h2
                id={forgotHeadingId}
                ref={forgotHeadingRef}
                tabIndex={-1}
                className="text-base font-extrabold text-white outline-hidden"
              >
                Wachtwoord vergeten
              </h2>
              <p className="text-xs font-medium text-rail-muted">
                Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord in te stellen.
              </p>
            </div>

            <TekstVeld
              label="E-mailadres"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Knop
              variant="primair" tone="rail" maat="groot" className="w-full"
              type="submit"
              disabled={resetRequest.status === "pending"}
            >
              Stuur herstellink
            </Knop>

            <Knop
              variant="tekst" tone="rail"
              onClick={backToLogin}
            >
              ← terug naar inloggen
            </Knop>
          </form>
        )
      ) : magicLinkSent ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-rail-border bg-surface-rail p-6 text-center">
          <p
            ref={magicLinkSentRef}
            tabIndex={-1}
            className="text-sm font-bold text-white outline-hidden"
            role="status"
          >
            Als er een account bij {login.magicLinkSentTo} hoort, hebben we een inloglink
            gestuurd.
          </p>
          <p className="text-xs font-medium text-rail-muted">
            Open de link in de mail om in te loggen — dat mag ook op een ander apparaat.
          </p>
          <Knop
            variant="tekst" tone="rail"
            onClick={otherLoginMethod}
          >
            Andere inlogmethode
          </Knop>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-rail-border bg-surface-rail p-6"
        >
          <p className="text-sm font-bold text-rail-error empty:-mt-4" role="alert">
            {login.errorCode ? errorMessage(login.errorCode) : ""}
          </p>

          <TekstVeld
            label="E-mailadres"
            inputRef={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <fieldset className="flex flex-col gap-2">
            <legend id={methodLegendId} className="text-xs font-bold text-rail-muted">
              Inlogmethode
            </legend>
            <div className="flex gap-2" role="group" aria-labelledby={methodLegendId}>
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-control border px-3 py-2.5 text-xs font-bold focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "magic_link"
                    ? "border-accent bg-rail text-white"
                    : "border-rail-border bg-rail text-rail-muted"
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
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-control border px-3 py-2.5 text-xs font-bold focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  method === "password"
                    ? "border-accent bg-rail text-white"
                    : "border-rail-border bg-rail text-rail-muted"
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
            <TekstVeld
              label="Wachtwoord"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            >
              <Knop
                variant="tekst" tone="rail" className="self-end"
                onClick={openForgot}
              >
                Wachtwoord vergeten?
              </Knop>
            </TekstVeld>
          )}

          {/* aria-disabled, niet disabled: een disabled knop verliest de
              focus, en na een mislukte poging stond die dan op <body> (#77).
              onSubmit blokkeert dubbel versturen zelf. */}
          <Knop
            variant="primair" tone="rail" maat="groot" className="w-full"
            type="submit"
            aria-disabled={loginPending}
          >
            {method === "magic_link" ? "Stuur inloglink" : "Inloggen"}
          </Knop>

          <Knop href="/" variant="tekst" tone="rail">
            ← terug naar bardienst
          </Knop>
        </form>
      )}
    </StartScherm>
  );
}

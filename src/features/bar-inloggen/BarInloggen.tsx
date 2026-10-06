"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { StartScherm } from "@/components/StartScherm";
import { AuroraMerk } from "@/components/AuroraMerk";
import { LeesFout } from "@/components/LeesFout";
import { TekstVeld } from "@/components/TekstVeld";
import { useFocusNaWissel } from "@/hooks/useFocusNaWissel";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import { useBarNamen, type BarNaam } from "@/hooks/queries/useBarNamen";
import {
  useBarLogin,
  type PinLoginFout,
  type WachtwoordLoginFout,
} from "@/hooks/queries/useBarLogin";
import { StaffPicker } from "@/features/dienst-starten/StaffPicker";
import { StaffHeader } from "@/features/dienst-starten/StaffHeader";
import { PinPad, PIN_LENGTH } from "@/features/dienst-starten/PinPad";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { INLOGGEN, STARTSCHERM, foutPin } from "@/features/bar-sessie/teksten";

function wachtwoordFout(code: WachtwoordLoginFout): string {
  switch (code) {
    case "invalid_credentials":
      return INLOGGEN.foutWachtwoord;
    case "rate_limited":
      return INLOGGEN.foutRateLimit;
    case "no_account":
      return INLOGGEN.foutGeenAccount;
    case "not_allowed":
      return INLOGGEN.foutNietToegestaan;
    case "unknown":
      return INLOGGEN.foutOverig;
  }
}

function pinFout(code: PinLoginFout, attemptsLeft: number | undefined): string {
  switch (code) {
    case "invalid_pin":
      return foutPin(attemptsLeft);
    case "rate_limited":
      return INLOGGEN.foutRateLimit;
    case "no_account":
      return INLOGGEN.foutGeenAccount;
    case "not_allowed":
      return INLOGGEN.foutNietToegestaan;
    case "pin_locked":
      return INLOGGEN.lockout;
    case "pin_needs_mfa":
      return INLOGGEN.pinBeheerderZonderFactor;
    case "pin_not_available":
    case "unknown":
      return INLOGGEN.foutOverig;
  }
}

type Weergave = "pin" | "wachtwoord" | "vergeten";

/**
 * Het startscherm van de bar zonder sessie: de namenlijst (alle
 * bardienstleden, ook wie geen PIN heeft), en na een tik op een naam het
 * inlogscherm (docs/features/dienst-per-sessie.md → Schermflow punt 1 en 2,
 * Inloggen op de bar). Je typt geen e-mailadres: de server zoekt het op.
 *
 * - PIN mogelijk (dit apparaat is vertrouwd voor dit lid, het lid heeft een
 *   PIN, geen lockout): `PinPad`, met een toggle naar het wachtwoord. Na vier
 *   cijfers logt de app in.
 * - Anders het wachtwoordveld, met "Wachtwoord vergeten?" en, als PIN kan, een
 *   toggle terug.
 * - PIN geblokkeerd: het wachtwoordveld met de lockoutmelding.
 * - Een beheerder zonder tweede factor (`pinNeedsMfa`, ADR 0017): het
 *   wachtwoordveld met de uitleg dat de PIN pas werkt na tweestapsverificatie.
 * - "Wachtwoord vergeten" met de eigen limiet (`limited`): een eigen tekst in
 *   plaats van de bevestiging (docs/features/login-rate-limit.md).
 *
 * Een geslaagde login maakt de persoonlijke sessie aan (server-side) en geeft
 * de sessie via `naLogin()` door aan de provider. Hergebruikt `StaffPicker`,
 * `PinPad`, `StaffHeader`, `TekstVeld` en `AuroraMerk`.
 */
export function BarInloggen() {
  const sessie = useBarSessie();
  const namen = useBarNamen();
  const titelRef = useRef<HTMLHeadingElement>(null);
  const namenHerstel = useLeesHerstel(namen, titelRef);
  const login = useBarLogin();

  const [gekozen, setGekozen] = useState<BarNaam | null>(null);
  const [pinBeschikbaar, setPinBeschikbaar] = useState(false);
  const [pinGeblokkeerd, setPinGeblokkeerd] = useState(false);
  const [pinNodigFactor, setPinNodigFactor] = useState(false);
  const [weergave, setWeergave] = useState<Weergave>("wachtwoord");
  const [pin, setPin] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  // De melding bij de namenlijst nadat de login `not_allowed` gaf
  // (gearchiveerd of geen bar-rol, spec → Teksten → Gearchiveerd lid). Los
  // van `fout`, dat bij het inlogscherm hoort en bij de terugkeer naar de
  // lijst wordt gewist.
  const [lijstMelding, setLijstMelding] = useState<string | null>(null);
  const [vergetenVerstuurd, setVergetenVerstuurd] = useState(false);
  const [vergetenBeperkt, setVergetenBeperkt] = useState(false);
  const [optiesLaden, setOptiesLaden] = useState(false);

  const wachtwoordRef = useRef<HTMLInputElement>(null);
  const kopRef = useRef<HTMLHeadingElement>(null);
  const markeerWissel = useFocusNaWissel(weergave, (w) =>
    w === "wachtwoord" ? wachtwoordRef.current : w === "vergeten" ? kopRef.current : null
  );

  function wissel(naar: Weergave) {
    markeerWissel();
    setFout(null);
    setPin("");
    setWeergave(naar);
  }

  async function kiesNaam(naam: BarNaam) {
    setLijstMelding(null);
    setGekozen(naam);
    setPin("");
    setWachtwoord("");
    setFout(null);
    setVergetenVerstuurd(false);
    setVergetenBeperkt(false);
    setPinBeschikbaar(false);
    setPinGeblokkeerd(false);
    setPinNodigFactor(false);
    setOptiesLaden(true);
    setWeergave("wachtwoord");
    const opties = await login.haalOpties(naam.id);
    setOptiesLaden(false);
    setPinBeschikbaar(opties.pinAvailable);
    setPinGeblokkeerd(opties.pinLocked);
    setPinNodigFactor(opties.pinNeedsMfa);
    setWeergave(opties.pinAvailable ? "pin" : "wachtwoord");
  }

  const terugNaarNamen = useCallback(() => {
    setGekozen(null);
    setPin("");
    setWachtwoord("");
    setFout(null);
    setVergetenVerstuurd(false);
    setVergetenBeperkt(false);
  }, []);

  /** Het lid mag niet (meer) inloggen: de lijst is verouderd. Terug naar de
   *  namenlijst, met de melding daar. */
  const ververstLijst = useCallback(() => {
    namen.refetch();
    terugNaarNamen();
    setLijstMelding(INLOGGEN.foutNietToegestaan);
  }, [namen, terugNaarNamen]);

  async function drukCijfer(cijfer: string) {
    if (!gekozen || login.pending) return;
    // Een vorige poging blijft met zijn foutmelding staan tot de volgende
    // toets, die een nieuwe PIN begint (zoals het pinscherm altijd deed).
    const basis = fout ? "" : pin;
    if (basis.length >= PIN_LENGTH) return;
    if (fout) setFout(null);
    const volgende = basis + cijfer;
    setPin(volgende);
    if (volgende.length < PIN_LENGTH) return;

    const resultaat = await login.loginMetPin(gekozen.id, volgende);
    if (resultaat.ok) {
      await sessie.naLogin();
      return;
    }
    switch (resultaat.code) {
      case "pin_locked":
        setPinBeschikbaar(false);
        setPinGeblokkeerd(true);
        wissel("wachtwoord");
        return;
      case "pin_not_available":
        setPinBeschikbaar(false);
        wissel("wachtwoord");
        return;
      case "pin_needs_mfa":
        setPinBeschikbaar(false);
        setPinNodigFactor(true);
        wissel("wachtwoord");
        return;
      case "not_allowed":
        ververstLijst();
        return;
      default:
        setFout(pinFout(resultaat.code, resultaat.attemptsLeft));
    }
  }

  function wis() {
    if (login.pending) return;
    if (fout) {
      setFout(null);
      setPin("");
      return;
    }
    setPin((p) => p.slice(0, -1));
  }

  async function verstuurWachtwoord(event: FormEvent) {
    event.preventDefault();
    if (!gekozen || login.pending || wachtwoord === "") return;
    setFout(null);
    const resultaat = await login.loginMetWachtwoord(gekozen.id, wachtwoord);
    if (resultaat.ok) {
      await sessie.naLogin();
      return;
    }
    if (resultaat.code === "not_allowed") {
      ververstLijst();
      return;
    }
    setFout(wachtwoordFout(resultaat.code));
  }

  async function verstuurHerstellink(event: FormEvent) {
    event.preventDefault();
    if (!gekozen || login.pending) return;
    const resultaat = await login.vergeten(gekozen.id);
    setVergetenBeperkt(resultaat.limited);
    setVergetenVerstuurd(true);
  }

  // Universele voordeur voor beheer, en voor wie zijn account nog moet
  // activeren: e-mail/wachtwoord op /beheer. Eén keer gedefinieerd en
  // getoond bij laden, fout en de lijst zelf: een mislukte namenlijst mag de
  // alternatieve login niet afsluiten (docs/features/
  // leesfouten-herstel-actuele-data.md, besluit 7).
  const emailIngang = (
    <Link
      href="/beheer"
      className="flex h-12 w-full max-w-[500px] items-center justify-center rounded-[15px] border border-rail-border text-sm font-bold text-rail-muted transition-colors hover:border-accent hover:text-rail-light"
    >
      {STARTSCHERM.emailLink}
    </Link>
  );

  return (
    <StartScherm>
      <AuroraMerk tone="dark">
        <h1
          ref={titelRef}
          tabIndex={-1}
          className="text-[21px] font-extrabold tracking-[-0.02em] outline-none"
        >
          {STARTSCHERM.titel}
        </h1>
        {!gekozen && (
          <p className="text-metadata font-semibold leading-normal text-rail-muted">
            {STARTSCHERM.ondertitel}
          </p>
        )}
      </AuroraMerk>

      {!gekozen && lijstMelding && (
        <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
          {lijstMelding}
        </p>
      )}

      {!gekozen && namen.status === "loading" && !namenHerstel.toonFout && (
        <>
          <p className="text-sm font-semibold text-rail-muted" role="status">
            Bardienst-lijst laden…
          </p>
          {emailIngang}
        </>
      )}

      {!gekozen && namenHerstel.toonFout && (
        <>
          <LeesFout
            tone="rail"
            className="max-w-xs"
            message={namenHerstel.message}
            onRetry={namenHerstel.retry}
            bezig={namenHerstel.bezig}
          />
          {emailIngang}
        </>
      )}

      {!gekozen && namen.status === "ready" && (
        <>
          <StaffPicker staff={namen.namen} onSelect={kiesNaam} />
          {emailIngang}
        </>
      )}

      {gekozen && optiesLaden && (
        <p className="text-sm font-semibold text-rail-muted" role="status">
          Bezig met laden…
        </p>
      )}

      {gekozen && !optiesLaden && weergave === "pin" && (
        <>
          <PinPad
            staffName={gekozen.name}
            pin={pin}
            errorMessage={fout}
            pending={login.pending}
            onDigit={drukCijfer}
            onBackspace={wis}
            onBack={terugNaarNamen}
            backLabel={INLOGGEN.terug}
            instructie={INLOGGEN.pinInstructie}
          />
          <button
            type="button"
            disabled={login.pending}
            onClick={() => wissel("wachtwoord")}
            className="text-xs font-semibold text-rail-muted underline hover:text-rail-light disabled:opacity-50"
          >
            {INLOGGEN.pinToggle}
          </button>
        </>
      )}

      {gekozen && !optiesLaden && weergave === "wachtwoord" && (
        <form
          onSubmit={verstuurWachtwoord}
          className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-rail-border bg-rail-card p-6"
        >
          <div className="flex justify-center">
            <StaffHeader name={gekozen.name} />
          </div>

          {pinGeblokkeerd && (
            <p className="text-center text-xs font-semibold text-rail-muted" role="status">
              {INLOGGEN.lockout}
            </p>
          )}
          {!pinBeschikbaar && !pinGeblokkeerd && (
            <p className="text-center text-xs font-medium text-rail-muted">
              {pinNodigFactor ? INLOGGEN.pinBeheerderZonderFactor : INLOGGEN.pinNietMogelijk}
            </p>
          )}

          <p className="text-sm font-bold text-rail-error empty:-mt-4" role="alert">
            {fout ?? ""}
          </p>

          <TekstVeld
            label={INLOGGEN.wachtwoordLabel}
            inputRef={wachtwoordRef}
            type="password"
            autoComplete="current-password"
            required
            value={wachtwoord}
            onChange={(event) => setWachtwoord(event.target.value)}
          >
            <button
              type="button"
              onClick={() => wissel("vergeten")}
              className="self-end text-xs font-semibold text-rail-muted underline hover:text-rail-light"
            >
              {INLOGGEN.wachtwoordVergeten}
            </button>
          </TekstVeld>

          {/* aria-disabled, niet disabled: een disabled knop verliest de focus
              (zelfde reden als BeheerLogin, #77); onSubmit blokkeert dubbel
              versturen zelf. */}
          <button
            type="submit"
            aria-disabled={login.pending}
            className="flex h-[52px] w-full items-center justify-center rounded-[15px] bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {INLOGGEN.wachtwoordKnop}
          </button>

          {pinBeschikbaar && (
            <button
              type="button"
              onClick={() => wissel("pin")}
              className="text-center text-xs font-semibold text-rail-muted underline hover:text-rail-light"
            >
              {INLOGGEN.wachtwoordToggle}
            </button>
          )}

          <button
            type="button"
            onClick={terugNaarNamen}
            className="text-center text-xs font-semibold text-rail-muted hover:text-rail-light"
          >
            {INLOGGEN.terug}
          </button>
        </form>
      )}

      {gekozen && !optiesLaden && weergave === "vergeten" && (
        <form
          onSubmit={verstuurHerstellink}
          className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-rail-border bg-rail-card p-6"
        >
          <div className="flex justify-center">
            <StaffHeader name={gekozen.name} />
          </div>
          <h2
            ref={kopRef}
            tabIndex={-1}
            className="text-center text-base font-extrabold text-white outline-none"
          >
            {INLOGGEN.wachtwoordVergeten}
          </h2>
          {vergetenVerstuurd ? (
            <p className="text-center text-sm font-bold text-white" role="status">
              {vergetenBeperkt ? INLOGGEN.vergetenLimiet : INLOGGEN.vergetenBevestiging}
            </p>
          ) : (
            <>
              <p className="text-center text-xs font-medium text-rail-muted">
                {INLOGGEN.vergetenUitleg}
              </p>
              <button
                type="submit"
                disabled={login.pending}
                className="flex h-[52px] w-full items-center justify-center rounded-[15px] bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {INLOGGEN.vergetenKnop}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => wissel("wachtwoord")}
            className="text-center text-xs font-semibold text-rail-muted hover:text-rail-light"
          >
            {INLOGGEN.terug.replace("andere naam", "terug naar inloggen")}
          </button>
        </form>
      )}
    </StartScherm>
  );
}

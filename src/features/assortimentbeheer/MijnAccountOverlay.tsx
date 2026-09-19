"use client";

import { useEffect, useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { useSetOwnPin, type SetOwnPinErrorCode } from "@/hooks/queries/useSetOwnPin";

const TOAST_DURATION_MS = 3500;
const PIN_PATTERN = /^[0-9]{4}$/;

function errorMessage(code: SetOwnPinErrorCode): string {
  switch (code) {
    case "invalid_pin_format":
      return "een pincode is 4 cijfers";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — log opnieuw in";
    case "no_bar_role":
      return "dit account kan geen pincode instellen — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Mijn account" — zelfbedienings-PIN-toggle
 * (docs/features/auth-methode-per-lid.md → Schermflow stap 6). Uitsluitend
 * gemount vanaf `ModusKeuze.tsx`, dus altijd op een individuele
 * e-mail/wachtwoord-sessie: `set_own_pin` herleidt de aanroeper via
 * `auth.uid()`, wat alleen op zo'n sessie werkt (spec → Definitieve keuzes
 * punt 3) — de gedeelde PIN-stafkeuze/device-sessie heeft geen individuele
 * `auth.uid()` om op te herleiden.
 *
 * Zelfde "sluit niet vanzelf na een geslaagde actie"-patroon als
 * `LidBeherenOverlay.tsx`: de overlay blijft open, toont een toast en de
 * bijgewerkte status, Sluiten/Escape/backdrop is de enige weg terug.
 * `onChanged` triggert `useBeheerSession()`'s `refetch()` zodat de
 * volgende keer dit scherm opent (na sluiten/heropenen) hetzelfde
 * `hasPin` ziet als hier al lokaal bijgewerkt is.
 */
export function MijnAccountOverlay({
  hasPin: initialHasPin,
  onClose,
  onChanged,
}: {
  hasPin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const mutation = useSetOwnPin();

  const pinId = useId();
  const pinConfirmId = useId();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const pinFilledIn = PIN_PATTERN.test(pin);
  const pinsMatch = pinFilledIn && pin === pinConfirm;
  const canSubmit = pinsMatch && mutation.status !== "pending";

  async function submitPin() {
    if (!canSubmit) return;
    const ok = await mutation.setOwnPin(pin);
    if (ok) {
      setHasPin(true);
      setPin("");
      setPinConfirm("");
      onChanged();
      setToast("Pincode ingesteld");
    }
  }

  async function turnOffPin() {
    if (mutation.status === "pending") return;
    const ok = await mutation.setOwnPin(null);
    if (ok) {
      setHasPin(false);
      onChanged();
      setToast("Pincode uitgezet");
    }
  }

  return (
    <Overlay
      title="Mijn account"
      description="Je wachtwoord blijft altijd werken. Een pincode is een optionele snelkoppeling voor deze bar-tablet."
      onClose={onClose}
    >
      <div aria-live="polite" role="status" className="min-h-[1.25rem]">
        {toast && <p className="text-sm font-bold text-white">{toast}</p>}
      </div>

      <p className="min-h-[1.25rem] text-sm font-bold text-rail-error" role="alert">
        {mutation.errorCode ? errorMessage(mutation.errorCode) : ""}
      </p>

      <div className="flex items-center justify-between rounded-control bg-rail px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-rail-muted">
          Pincode
        </span>
        <span className="text-sm font-extrabold text-white">
          {hasPin ? "ingesteld" : "niet ingesteld"}
        </span>
      </div>

      {hasPin ? (
        <button
          type="button"
          disabled={mutation.status === "pending"}
          onClick={turnOffPin}
          className="flex items-center justify-between gap-3 rounded-control border border-rail-border p-3.5 text-left transition-colors hover:border-rail-error disabled:opacity-50"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-rail-error">Pincode uitzetten</span>
            <span className="text-xs font-medium text-rail-muted">
              je kunt altijd met wachtwoord blijven inloggen
            </span>
          </span>
          <span aria-hidden="true" className="text-base font-bold text-rail-muted">
            ›
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-control border border-rail-border p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Pincode instellen</span>
            <span className="text-xs font-medium text-rail-muted">
              kies 4 cijfers om snel in te loggen op deze bar-tablet
            </span>
          </div>

          <label htmlFor={pinId} className="text-xs font-bold text-rail-muted">
            Pincode
          </label>
          <input
            id={pinId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-11 rounded-control border border-rail-border bg-rail px-3.5 text-sm font-semibold text-white outline-none focus:border-accent"
          />

          <label htmlFor={pinConfirmId} className="text-xs font-bold text-rail-muted">
            Voer dezelfde 4 cijfers nog een keer in
          </label>
          <input
            id={pinConfirmId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pinConfirm}
            onChange={(event) =>
              setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
            className="h-11 rounded-control border border-rail-border bg-rail px-3.5 text-sm font-semibold text-white outline-none focus:border-accent"
          />

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submitPin}
            className="flex h-11 items-center justify-center rounded-control bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Pincode instellen
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-rail-border bg-rail text-sm font-bold text-white transition-colors hover:border-accent"
      >
        Sluiten
      </button>
    </Overlay>
  );
}

"use client";

import { useId } from "react";
import {
  checkPassword,
  PASSWORD_RULE_LABELS,
  type PasswordRule,
} from "@/lib/passwordPolicy";

const RULES: PasswordRule[] = ["length", "lowercase", "uppercase", "digit", "symbol"];

/**
 * Twee velden (nieuw + herhalen) met een live checklist van de
 * wachtwoordregels — docs/features/wachtwoord-vergeten.md. Los component
 * zodat de portal (#15, wachtwoord vergeten) en #17 (wachtwoord wijzigen)
 * het hergebruiken in plaats van dupliceren. Gecontroleerd: de aanroeper
 * houdt de waarden bij en leest `isPasswordReady()` voor de opslaan-knop.
 */
export function NieuwWachtwoordVelden({
  password,
  repeat,
  onPasswordChange,
  onRepeatChange,
}: {
  password: string;
  repeat: string;
  onPasswordChange: (value: string) => void;
  onRepeatChange: (value: string) => void;
}) {
  const passwordId = useId();
  const repeatId = useId();
  const rulesId = useId();
  const mismatchId = useId();
  const check = checkPassword(password);
  const mismatch = repeat.length > 0 && repeat !== password;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-xs font-bold text-muted">
          Nieuw wachtwoord
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={rulesId}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className="ui-field-focus h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink"
        />
        <ul id={rulesId} className="mt-1 flex flex-col gap-0.5 text-xs font-semibold">
          {RULES.map((rule) => (
            <li key={rule} className={check[rule] ? "text-success" : "text-muted"}>
              <span aria-hidden="true">{check[rule] ? "✓ " : "○ "}</span>
              <span className="sr-only">{check[rule] ? "voldaan: " : "nog niet: "}</span>
              {PASSWORD_RULE_LABELS[rule]}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={repeatId} className="text-xs font-bold text-muted">
          Herhaal wachtwoord
        </label>
        <input
          id={repeatId}
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={mismatch}
          aria-describedby={mismatch ? mismatchId : undefined}
          value={repeat}
          onChange={(event) => onRepeatChange(event.target.value)}
          className="ui-field-focus h-12 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink"
        />
        {mismatch && (
          <p id={mismatchId} className="text-xs font-bold text-danger">
            de wachtwoorden zijn niet gelijk
          </p>
        )}
      </div>
    </>
  );
}

export function isPasswordReady(password: string, repeat: string): boolean {
  return checkPassword(password).isValid && password === repeat;
}

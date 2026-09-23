/**
 * Wachtwoordregels — docs/features/wachtwoord-vergeten.md → Wachtwoordregels.
 *
 * Alleen UX: de live checklist onder een nieuw-wachtwoordveld. De echte
 * afdwinging zit in Supabase Auth (dashboard → Providers → Email: minimale
 * lengte 8, "Lowercase, uppercase letters, digits and symbols"), die voor
 * élke wachtwoordwijziging geldt. Daarom exact dezelfde leestekenset als
 * Supabase: anders toont de checklist "voldaan" voor iets wat de server
 * daarna weigert.
 */
export const MIN_PASSWORD_LENGTH = 8;

const SYMBOLS = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~";

export type PasswordRule = "length" | "lowercase" | "uppercase" | "digit" | "symbol";

export const PASSWORD_RULE_LABELS: Record<PasswordRule, string> = {
  length: `minstens ${MIN_PASSWORD_LENGTH} tekens`,
  lowercase: "een kleine letter",
  uppercase: "een hoofdletter",
  digit: "een cijfer",
  symbol: "een leesteken, zoals ! ? # of @",
};

export type PasswordCheck = Record<PasswordRule, boolean> & { isValid: boolean };

export function checkPassword(password: string): PasswordCheck {
  const rules: Record<PasswordRule, boolean> = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: [...password].some((char) => SYMBOLS.includes(char)),
  };
  return { ...rules, isValid: Object.values(rules).every(Boolean) };
}

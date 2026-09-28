/**
 * Minimale nep-`react` voor test/moneyHooksFoutlogging.test.ts: de
 * geldhooks gebruiken alleen `useState`, en de test roept de hook als
 * gewone functie aan (geen render). `setState` is een no-op; de test kijkt
 * naar het teruggegeven resultaat en de meldingen, niet naar de state.
 */
export function useState<T>(initial: T | (() => T)): [T, (next: T) => void] {
  const value = typeof initial === "function" ? (initial as () => T)() : initial;
  return [value, () => {}];
}

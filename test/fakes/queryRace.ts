// Kleine hook-lifecycle voor echte query-hooks; netwerkantwoorden worden
// afzonderlijk vrijgegeven zodat afrondingsvolgorde controleerbaar is.
import type { Dispatch, SetStateAction } from "react";
let slots: unknown[] = [];
let cursor = 0;
let effect: (() => (() => void) | void) | undefined;
let cleanup: (() => void) | void;
export const writes: unknown[] = [];
export const reports: unknown[] = [];
export const requests: { resolve: (result: unknown) => void; reject: (err: unknown) => void }[] = [];
export function reset() { slots = []; writes.length = reports.length = requests.length = 0; cleanup = undefined; }
export function render<T>(hook: () => T): T { cursor = 0; return hook(); }
export function runEffect() { cleanup?.(); cleanup = effect?.(); }
export function unmount() { cleanup?.(); cleanup = undefined; }
export function useState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
  const index = cursor++;
  if (!(index in slots)) slots[index] = initial;
  return [slots[index] as T, (value) => {
    slots[index] = typeof value === "function" ? (value as (previous: T) => T)(slots[index] as T) : value;
    writes.push(slots[index]);
  }];
}
export function useRef<T>(initial: T): { current: T } {
  const index = cursor++;
  if (!(index in slots)) slots[index] = { current: initial };
  return slots[index] as { current: T };
}
export function useCallback<T>(fn: T): T {
  const index = cursor++;
  if (!(index in slots)) slots[index] = fn;
  return slots[index] as T;
}
export function useEffect(fn: () => (() => void) | void) { effect = fn; }
export function createClient() {
  const query = () => {
      const promise = new Promise<unknown>((resolve, reject) => requests.push({ resolve, reject }));
      const chain = { select: () => chain, eq: () => chain, order: () => chain, single: () => chain, then: promise.then.bind(promise) };
      return chain;
  };
  return {
    from: query,
    rpc: query,
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "image" } }) }) },
  };
}
export function reportClientError(...args: unknown[]) { reports.push(args); }
export function loadErrorMessage(message: string) { return message; }

export function logLocalError(...args: unknown[]) { reports.push(args); }

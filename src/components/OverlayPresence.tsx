"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/**
 * Overlay-aanwezigheid (ADR 0014, docs/adr/0014-overlay-aanwezigheid-via-
 * gedeelde-context.md): elke `Overlay` meldt zich bij mount aan en bij
 * unmount weer af; `useOpenOverlayCount()` leest hoeveel er open zijn.
 *
 * Twee contexts, zodat de aanmeldfunctie stabiel blijft terwijl de teller
 * verandert: `Overlay` leest alleen de aanmeldcontext en rendert dus niet
 * opnieuw bij elke telwijziging, en zijn aanmeld-effect draait alleen bij
 * mount en unmount.
 *
 * Zonder provider (default context) doet aanmelden niets en is de teller 0.
 * De enige provider staat vandaag in `DienstTabs` (bar-modus met een open
 * dienst); portal en `/beheer` mounten er geen.
 */

type Register = () => () => void;

const noopUnregister = () => {};
const noopRegister: Register = () => noopUnregister;

const RegisterContext = createContext<Register>(noopRegister);
const CountContext = createContext<number>(0);

export function OverlayPresenceProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const register = useCallback<Register>(() => {
    setCount((c) => c + 1);
    let registered = true;
    return () => {
      // Dubbel afmelden (bv. een cleanup die twee keer loopt) mag de
      // teller nooit onder het werkelijke aantal laten zakken.
      if (!registered) return;
      registered = false;
      setCount((c) => c - 1);
    };
  }, []);

  return (
    <RegisterContext.Provider value={register}>
      <CountContext.Provider value={count}>{children}</CountContext.Provider>
    </RegisterContext.Provider>
  );
}

/** Intern voor `Overlay`: de stabiele aanmeldfunctie. Aanmelden geeft een
 *  afmeldfunctie terug. */
export function useRegisterOverlay(): Register {
  return useContext(RegisterContext);
}

/** Aantal gemounte `Overlay`s onder de dichtstbijzijnde provider (0 zonder
 *  provider). */
export function useOpenOverlayCount(): number {
  return useContext(CountContext);
}

"use client";

import { createContext, useContext, useEffect } from "react";
import type {
  AdminMelding,
  AdminOverzicht,
  BarSessionInfo,
  LastLeft,
  OpenShift,
  OtherShift,
} from "@/lib/barState";
import type { SessieMeldingReden } from "@/lib/barSessie";

/**
 * In welke fase staat deze browser ten opzichte van de bar-sessie
 * (docs/features/dienst-per-sessie.md → Schermflow)?
 *
 * - `laden`: de toestand is nog niet bekend, of wordt opgeruimd.
 * - `fout`: de toestand kon niet geladen worden.
 * - `uitgelogd`: geen Supabase-sessie → het startscherm met de namenlijst.
 * - `geen_bar_sessie`: wel een Supabase-sessie (bv. een e-maillogin op
 *   `/beheer`), maar nog geen geregistreerde bar-sessie.
 * - `hervatten`: een actieve bar-sessie die deze browserstart nog niet is
 *   bevestigd ("Verder als {naam}?").
 * - `actief`: een actieve, bevestigde sessie.
 */
export type BarSessieFase =
  | "laden"
  | "fout"
  | "uitgelogd"
  | "geen_bar_sessie"
  | "hervatten"
  | "actief";

export type SessieMelding = {
  reden: SessieMeldingReden;
  /** Er stond nog een half ingevuld mandje in. */
  mandjeVerloren: boolean;
};

export type BarSessie = {
  fase: BarSessieFase;
  /** Alleen bij `fout`. */
  foutMelding: string | null;
  /** De sessie, bij `hervatten` en `actief`. */
  session: BarSessionInfo | null;
  /** De dienst van deze sessie. */
  shift: OpenShift | null;
  /** Een dienst elders (fase 1 is stand (a): hooguit één). */
  otherShift: OtherShift | null;
  lastLeft: LastLeft | null;
  /** Openstaande meldingen "dienst zonder apparaat" (alleen beheerders). */
  notifications: AdminMelding[];
  /** Het beheeroverzicht (beheerder in modus beheer). */
  admin: AdminOverzicht | null;
  /** Laadt de toestand opnieuw, met "laden" tussendoor. */
  herlaad: () => void;
  /** Ververst de toestand stil op de achtergrond. */
  ververs: () => void;
  /** Na een server-side login (namenlijst): cookies opnieuw lezen, de sessie
   *  als bevestigd markeren (inloggen is bevestigen) en de toestand laden. */
  naLogin: () => Promise<void>;
  /** Na `register_bar_session`: de sessie als bevestigd markeren en laden. */
  naRegistratie: () => void;
  /** "Verder" op het hervatscherm. */
  bevestig: () => void;
  /**
   * Uitloggen: `sluitDienst` sluit een open dienst mee, anders blijft hij
   * open met een melding aan een beheerder. Geeft `false` bij een
   * onverwachte fout (de sessie staat dan nog).
   */
  uitloggen: (sluitDienst: boolean) => Promise<boolean>;
  /** Sluit alleen deze sessie lokaal en server-side af, zonder RPC: voor de
   *  paden waar de sessie al weg is. */
  lokaalUitloggen: () => Promise<void>;
  /** Het scherm meldt of er een half ingevuld mandje staat, voor de regel
   *  "Wat nog in het mandje stond, is niet afgerekend." */
  zetMandjeGevuld: (gevuld: boolean) => void;
  /** Een korte bevestiging onderin het scherm ("Dienst overgenomen"). Staat in
   *  de provider omdat het scherm dat hem toont vaak meteen daarna wisselt. */
  toonToast: (tekst: string) => void;
  /** De melding die nu getoond wordt, of `null`. */
  melding: SessieMelding | null;
  sluitMelding: () => void;
};

export const BarSessieContext = createContext<BarSessie | null>(null);

/** De bar-sessie van `BarSessieProvider`. Buiten de provider is dit een
 *  programmeerfout, geen toestand om af te vangen. */
export function useBarSessie(): BarSessie {
  const context = useContext(BarSessieContext);
  if (!context) throw new Error("useBarSessie buiten een BarSessieProvider");
  return context;
}

/**
 * Meldt aan de provider of dit scherm een half ingevuld mandje heeft, zodat
 * een gesloten sessie de regel over het mandje kan toevoegen. Ruimt zichzelf
 * op bij unmount.
 */
export function useMandjeMelding(gevuld: boolean): void {
  const { zetMandjeGevuld } = useBarSessie();
  useEffect(() => {
    zetMandjeGevuld(gevuld);
    return () => zetMandjeGevuld(false);
  }, [gevuld, zetMandjeGevuld]);
}

// kit: generiek
import type { ReactNode } from "react";

/**
 * Het register van voorbeelden: sleutel = de naam van de component, waarde = een
 * functie die zijn voorbeeldsectie(s) rendert. Vaste voorbeelddata, geen netwerk.
 */
export type Voorbeeldregister = Record<string, () => ReactNode>;

/** Ondergrond van een sectie: een gewone pagina of een donkere strook. */
export type SysteemTone = "licht" | "rail";

/**
 * Het register van losse vensters: sleutel = het venster-id uit de lokale
 * config, waarde = een functie die de inhoud van dat venster rendert. Met de
 * ids als typeparameter faalt een ontbrekend of extra venster in `typecheck`.
 */
export type Vensterregister<Id extends string = string> = Record<Id, () => ReactNode>;

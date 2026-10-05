"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useFocusNaHerstel } from "./useFocusNaHerstel";

/**
 * Herstel van een leeshook van de bar (`refetch` zet de status op `loading`,
 * fail-closed, geen stale-while-revalidate — docs/features/
 * leesfouten-herstel-actuele-data.md, besluit 2). Zonder dit verdween de
 * foutregel met zijn knop tijdens de retry en verloor de focus de knop:
 * hier blijft de fout (met de laatste tekst en een `aria-disabled` knop)
 * staan zolang de retry loopt, en de focus gaat na succes naar de herstelde
 * sectie (`useFocusNaHerstel`). Een retry roept alleen `refetch` aan, dus
 * er gaat geen invoer verloren.
 */
export function useLeesHerstel(
  hook: { status: string; refetch: () => void } & { message?: string },
  sectie?: RefObject<HTMLElement | null>
): { toonFout: boolean; message: string; bezig: boolean; retry: () => void } {
  const [bezig, setBezig] = useState(false);
  const laatsteMelding = useRef("");
  if (hook.status === "error" && hook.message) laatsteMelding.current = hook.message;

  // De retry is pas klaar als de hook na het klikken echt `loading` was en
  // daarna `ready` of `error` werd; vóór die eerste `loading` staat de status
  // nog op de oude `error`.
  const zagLaden = useRef(false);
  useEffect(() => {
    if (!bezig) return;
    if (hook.status === "loading") {
      zagLaden.current = true;
    } else if (zagLaden.current) {
      zagLaden.current = false;
      setBezig(false);
    }
  }, [bezig, hook.status]);

  const fallback = useRef<HTMLElement | null>(null);
  useFocusNaHerstel(
    hook.status === "error" || hook.status === "loading" || hook.status === "ready"
      ? hook.status
      : "loading",
    sectie ?? fallback
  );

  const refetch = hook.refetch;
  const retry = useCallback(() => {
    setBezig(true);
    refetch();
  }, [refetch]);

  return {
    toonFout: hook.status === "error" || (bezig && hook.status === "loading"),
    message: laatsteMelding.current,
    bezig,
    retry,
  };
}

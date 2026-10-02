import type { ReactNode } from "react";

/**
 * Het rechter zijpaneel van de bar (Mandje in Verkoop, "Dienst actief" in
 * Dienst). Eén component zodat beide dezelfde breedte krijgen (docs/features/
 * tablet-bruikbaarheid.md): fluïde tussen 300 en 372px, zodat er op 768px
 * portret nog ruimte voor de inhoud overblijft. Scrollt binnen zichzelf.
 */
export function ZijPaneel({
  as: Element = "div",
  children,
}: {
  as?: "div" | "aside";
  children: ReactNode;
}) {
  return (
    <Element className="flex min-h-0 w-[clamp(300px,36vw,372px)] flex-none flex-col gap-3 overflow-auto border-l border-border bg-white p-[18px]">
      {children}
    </Element>
  );
}

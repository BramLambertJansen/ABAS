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
    <Element className="flex h-[max(32rem,100dvh)] w-full flex-none flex-col gap-3 overflow-auto border-t min-[700px]:h-auto min-[700px]:min-h-0 min-[700px]:w-[clamp(300px,36vw,372px)] min-[700px]:border-l min-[700px]:border-t-0 border-border bg-white p-[18px]">
      {children}
    </Element>
  );
}

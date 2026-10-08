"use client";

import { Knop } from "@/components/Knop";
import { OverlaySluitKnop } from "@/components/Overlay";

/**
 * Annuleren + primaire actie onderaan elke profiel-sheet (prototype
 * designs/Lid App.dc.html: twee knoppen naast elkaar, 52px hoog). De
 * primaire knop is een submit-knop van het omringende `<form>` en gebruikt
 * `aria-disabled` in plaats van `disabled` (#77-patroon): hij blijft
 * focusbaar en voorleesbaar; de `onSubmit` van het formulier bewaakt zelf
 * dat er niets gebeurt zolang `disabled` waar is.
 */
export function SheetKnoppen({
  submitLabel,
  disabled,
  cancelDisabled = false,
}: {
  submitLabel: string;
  disabled: boolean;
  /** Tijdens een lopende opslag (`closeBlocked`) sluit ook Annuleren niet. */
  cancelDisabled?: boolean;
}) {
  return (
    <div className="flex gap-[10px]">
      <OverlaySluitKnop
        maat="groot" className="flex-1"
        disabled={cancelDisabled}
      >
        Annuleren
      </OverlaySluitKnop>
      <Knop
        variant="primair" maat="groot" className="flex-1"
        type="submit"
        aria-disabled={disabled}
      >
        {submitLabel}
      </Knop>
    </div>
  );
}

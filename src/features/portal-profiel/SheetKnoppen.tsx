"use client";

/**
 * Annuleer + primaire actie onderaan elke profiel-sheet (prototype
 * designs/Lid App.dc.html: twee knoppen naast elkaar, 52px hoog). De
 * primaire knop is een submit-knop van het omringende `<form>` en gebruikt
 * `aria-disabled` in plaats van `disabled` (#77-patroon): hij blijft
 * focusbaar en voorleesbaar; de `onSubmit` van het formulier bewaakt zelf
 * dat er niets gebeurt zolang `disabled` waar is.
 */
export function SheetKnoppen({
  submitLabel,
  disabled,
  onCancel,
}: {
  submitLabel: string;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-[10px]">
      <button
        type="button"
        onClick={onCancel}
        className="ui-action flex flex-1 items-center justify-center border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
      >
        Annuleer
      </button>
      <button
        type="submit"
        aria-disabled={disabled}
        className="ui-action ui-button-primary flex flex-1 items-center justify-center text-sm font-bold transition-colors aria-disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </div>
  );
}

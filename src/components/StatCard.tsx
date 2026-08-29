/**
 * The `rounded-2xl bg-canvas p-3` stat wrapper: a lighter card floating
 * inside the dark Overlay.tsx dialog. Two shapes share that wrapper but
 * differ structurally, not just in content, which is why this is a
 * discriminated union on `variant` rather than one prop set with optional
 * fields — a "member" card can't accidentally receive a "metric"-only prop
 * or vice versa (same style choice as Overlay.tsx's
 * `switch (shell.overlay)`). Because of that union this takes a single
 * `props` argument rather than being destructured in the signature the way
 * every other shared component here is — TypeScript can't narrow a union
 * mid-destructure, so the fields are read off `props` inside each branch
 * instead.
 *
 * `variant: "member"` — AfrekenenOverlay.tsx / OpwaarderenOverlay.tsx's
 * "name + saldo" card: bold name, one muted line below it. The low-balance
 * suffix (" — laag saldo") is composed by the caller into `subtitle`, not
 * hardcoded here — "saldo ..." wording is call-site copy, this component
 * only owns the wrapper and typography.
 *
 * `variant: "metric"` — no real consumer yet on this branch. An unmerged
 * one (issue #12, DienstAfsluitenOverlay.tsx) has two 3-line cards
 * (uppercase tiny label / big value / optional one-line footnote, e.g.
 * "Omzet deze dienst" / a bedrag / "N bestelling(en)") that reuse the same
 * `bg-canvas p-3` wrapper with structurally different typography from
 * "member". This variant is shaped to fit that without building #12 here.
 */
export function StatCard(
  props:
    | { variant: "member"; name: string; subtitle: string }
    | { variant: "metric"; label: string; value: string; subtitle?: string }
) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-canvas p-3">
      {props.variant === "member" ? (
        <>
          <span className="text-sm font-bold text-ink">{props.name}</span>
          <span className="text-xs font-semibold text-muted">{props.subtitle}</span>
        </>
      ) : (
        <>
          <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
            {props.label}
          </span>
          <span className="text-xl font-extrabold text-ink">{props.value}</span>
          {props.subtitle && (
            <span className="text-xs font-semibold text-muted">{props.subtitle}</span>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { TekstVeld } from "@/components/TekstVeld";
import { TEKSTEN, TOON_PORTAL_VERWIJZING } from "./teksten";

export type KoppelFout = "ongeldige_code" | "niet_geconfigureerd";
export type KoppelResultaat = { fout: KoppelFout } | { gekoppeld: true };

function foutmelding(fout: KoppelFout): string {
  switch (fout) {
    case "ongeldige_code":
      return TEKSTEN.fouteCode;
    case "niet_geconfigureerd":
      return TEKSTEN.nietGeconfigureerd;
  }
}

const SECUNDAIRE_LINK =
  "flex h-12 w-full max-w-sm items-center justify-center rounded-[15px] border border-rail-border text-sm font-bold text-rail-muted transition-colors hover:border-accent hover:text-rail-light";

/**
 * `/koppel` (docs/features/tablet-koppelen.md → Schermflow §1): tegelijk de
 * "niet gekoppeld"-staat en het koppelformulier. Zelfde opbouw als
 * `DienstStarten`/`BeheerLogin`: `<main>` op `bg-rail`, `AuroraMerk` met de
 * `h1`, daaronder een kaart met het formulier.
 *
 * `koppel` is de server-actie, als prop meegegeven door de page, zodat dit
 * scherm niets uit `app/` importeert. Bij succes volgt een volledige
 * navigatie naar `/` (geen client-side routering): pas die documentrequest
 * gaat door de middleware, die dan als device inlogt en de sessiecookies
 * aan de browser geeft. Zie `src/app/(bar)/koppel/actions.ts`.
 *
 * Na een fout wordt het veld leeggemaakt en krijgt het de focus terug; de
 * melding staat in `role="alert"` binnen de kaart, zelfde plaatsing als in
 * `BeheerLogin`. `aria-disabled` in plaats van `disabled` op de knop, om
 * dezelfde reden als daar (#77): een disabled knop verliest de focus.
 */
export function TabletKoppelen({
  koppel,
}: {
  koppel: (formData: FormData) => Promise<KoppelResultaat>;
}) {
  const [code, setCode] = useState("");
  const [fout, setFout] = useState<KoppelFout | null>(null);
  const [gekoppeld, setGekoppeld] = useState(false);
  const [bezig, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bezig || gekoppeld) return;
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      let resultaat: KoppelResultaat;
      try {
        resultaat = await koppel(formData);
      } catch (err) {
        // Netwerk- of serverfout: het formulier blijft staan zoals het was,
        // zodat opnieuw proberen kan.
        console.error("TabletKoppelen:", err);
        return;
      }

      if ("gekoppeld" in resultaat) {
        setGekoppeld(true);
        window.location.replace("/");
        return;
      }

      setFout(resultaat.fout);
      setCode("");
      codeRef.current?.focus();
    });
  }

  return (
    <main className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-auto bg-rail px-6 py-8 font-sans text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(238,90,36,0.16),transparent_60%)]"
      />
      <AuroraMerk tone="dark">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{TEKSTEN.kop}</h1>
        <p className="max-w-sm text-[12.5px] font-semibold leading-normal text-rail-muted">
          {TEKSTEN.uitleg}
        </p>
      </AuroraMerk>

      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-rail-border bg-rail-card p-6"
      >
        <p className="text-sm font-bold text-rail-error empty:-mt-4" role="alert">
          {fout ? foutmelding(fout) : ""}
        </p>

        <TekstVeld
          label={TEKSTEN.veldlabel}
          inputRef={codeRef}
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />

        <button
          type="submit"
          aria-disabled={bezig || gekoppeld}
          className="flex h-[52px] w-full items-center justify-center rounded-[15px] bg-accent text-sm font-bold text-rail transition-colors hover:bg-accent-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {TEKSTEN.knop}
        </button>
      </form>

      <Link href="/beheer" className={SECUNDAIRE_LINK}>
        {TEKSTEN.inloggenMetEmail}
      </Link>

      {TOON_PORTAL_VERWIJZING && (
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          <p className="text-center text-xs font-semibold text-rail-muted">
            {TEKSTEN.portalVraag}
          </p>
          <Link href="/portal" className={SECUNDAIRE_LINK}>
            {TEKSTEN.portalLink}
          </Link>
        </div>
      )}
    </main>
  );
}

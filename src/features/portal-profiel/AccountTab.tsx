"use client";

import { useEffect, useState } from "react";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { usePortalProfiel } from "@/hooks/queries/usePortalProfiel";
import { NaamWijzigenSheet } from "./NaamWijzigenSheet";
import { PincodeSheet } from "./PincodeSheet";
import { WachtwoordWijzigenSheet } from "./WachtwoordWijzigenSheet";

const TOAST_DURATION_MS = 3500;

type Sheet = "naam" | "wachtwoord" | "pincode";

/**
 * Account-tabblad van `PortalDashboard` — docs/features/portal-profiel.md →
 * Schermflow §0 (prototype designs/Lid App.dc.html, `isSettings`):
 * profielkaart plus "GEGEVENS" met drie rijen, elk een eigen sheet.
 *
 * Rolzichtbaarheid (spec → Rolzichtbaarheid): de PIN-rij bestaat alleen
 * voor bardienst/beheerder en niet-gearchiveerd, de Naam-rij alleen voor
 * niet-gearchiveerd. Niet gerenderd, niet verborgen of uitgeschakeld. Dat
 * is gemak, geen beveiliging: `set_own_pin`/`update_own_name` dwingen het
 * zelf af. Zolang het profiel laadt geen rijen, zodat de PIN-rij niet
 * opflitst en weer verdwijnt.
 *
 * `email` komt uit de sessie (`usePortalSession()` in `PortalShellHome`),
 * niet uit `members.email` (RPC-gated, ADR 0004). `onProfileChanged` is de
 * `refetch` van diezelfde sessie-instantie, zodat de header ("Hoi
 * {voornaam}") na een naamwijziging meeververst.
 *
 * Geen "MELDINGEN"-blok en geen tweede Uitloggen-knop (spec → Betrokken
 * shell, Expliciet buiten scope): uitloggen staat al in de header.
 */
export function AccountTab({
  email,
  onProfileChanged,
}: {
  email: string;
  onProfileChanged: () => void;
}) {
  const profiel = usePortalProfiel();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function done(message: string) {
    setSheet(null);
    setToast(message);
    profiel.refetch();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-5">
      <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Account</h2>

      {profiel.status === "loading" && (
        <p className="py-8 text-center text-sm font-bold text-muted" role="status">
          Gegevens laden…
        </p>
      )}

      {profiel.status === "error" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm font-bold text-danger" role="alert">
            {profiel.message}
          </p>
          <button
            type="button"
            onClick={profiel.refetch}
            className="flex h-10 items-center rounded-control border border-border bg-white px-4 text-sm font-bold text-ink transition-colors hover:border-ink"
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {profiel.status === "ready" && (
        <>
          <div className="flex flex-none items-center gap-3.5 rounded-[22px] border border-border bg-white p-4">
            <InitialsAvatar name={profiel.profiel.name} size="lg" tone="light" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-extrabold tracking-tight text-ink">
                {profiel.profiel.name}
              </span>
              <span className="truncate text-[12.5px] font-medium text-muted">{email}</span>
            </div>
          </div>

          <div className="flex flex-none flex-col gap-2">
            <h3 className="text-[11px] font-bold tracking-[0.1em] text-muted">GEGEVENS</h3>
            <ul className="overflow-hidden rounded-[22px] border border-border bg-white">
              {!profiel.profiel.archived && (
                <AccountRij
                  title="Naam wijzigen"
                  hint={profiel.profiel.name}
                  onClick={() => setSheet("naam")}
                />
              )}
              <AccountRij title="Wachtwoord wijzigen" onClick={() => setSheet("wachtwoord")} />
              {isBarRole(profiel.profiel.role) && !profiel.profiel.archived && (
                <AccountRij
                  title="Pincode voor de bar-tablet"
                  hint={profiel.profiel.hasPin ? "ingesteld" : "niet ingesteld"}
                  onClick={() => setSheet("pincode")}
                />
              )}
            </ul>
          </div>

          {sheet === "naam" && (
            <NaamWijzigenSheet
              currentName={profiel.profiel.name}
              onClose={() => setSheet(null)}
              onSaved={() => {
                done("Naam bijgewerkt");
                onProfileChanged();
              }}
              onStale={profiel.refetch}
            />
          )}
          {sheet === "wachtwoord" && (
            <WachtwoordWijzigenSheet
              isBarRole={isBarRole(profiel.profiel.role)}
              onClose={() => setSheet(null)}
              onSaved={() => done("Wachtwoord gewijzigd")}
            />
          )}
          {sheet === "pincode" && (
            <PincodeSheet
              hasPin={profiel.profiel.hasPin}
              onClose={() => setSheet(null)}
              onSet={() => done("Pincode ingesteld")}
              onRemoved={() => done("Pincode verwijderd")}
              onStale={profiel.refetch}
            />
          )}
        </>
      )}

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-[22px] bottom-6 z-40">
        {toast && (
          <p className="rounded-2xl bg-rail px-4 py-3.5 text-sm font-semibold text-white">{toast}</p>
        )}
      </div>
    </div>
  );
}

function isBarRole(role: string): boolean {
  return role === "bardienst" || role === "beheerder";
}

function AccountRij({
  title,
  hint,
  onClick,
}: {
  title: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">{title}</span>
          {hint && <span className="truncate text-[12.5px] font-medium text-muted">{hint}</span>}
        </span>
        <span aria-hidden="true" className="flex-none text-[17px] font-bold text-muted">
          ›
        </span>
      </button>
    </li>
  );
}

"use client";

import { useShell } from "@/lib/shell/ShellProvider";
import type { BarStaffMember } from "@/hooks/queries/useBarStaff";

const ROLE_LABELS: Record<BarStaffMember["role"], string> = {
  bardienst: "bardienst",
  beheerder: "beheerder",
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function StaffPicker({
  staff,
  onSelect,
}: {
  staff: BarStaffMember[];
  onSelect: (member: BarStaffMember) => void;
}) {
  const shell = useShell();

  return (
    <div className="flex w-full max-w-[500px] flex-col items-center gap-5">
      {staff.length === 0 ? (
        <p className="text-center text-sm font-semibold text-rail-muted">
          Geen bardienst-/beheerdersaccounts gevonden. Vraag een bestuurslid
          om je de rol bardienst of beheerder te geven.
        </p>
      ) : (
        <div
          className="grid w-full gap-2.5"
          style={{ gridTemplateColumns: `repeat(${shell.columns}, 1fr)` }}
        >
          {staff.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelect(member)}
              aria-label={`${member.name}, ${ROLE_LABELS[member.role]}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-rail-border bg-rail-card p-4 text-center transition-colors hover:border-accent"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rail-border text-sm font-extrabold text-white">
                {initials(member.name)}
              </span>
              <span className="text-sm font-bold leading-tight text-white">
                {member.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                  member.role === "beheerder"
                    ? "bg-accent text-rail"
                    : "bg-rail-border text-white"
                }`}
              >
                {ROLE_LABELS[member.role]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

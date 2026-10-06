"use client";

import { useShell } from "@/lib/shell/ShellProvider";
import { NO_BAR_STAFF_MESSAGE } from "@/lib/staff";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import type { BarNaam } from "@/lib/barLoginTypes";

/**
 * De openbare namenlijst van het startscherm (`BarInloggen`). Sinds ADR 0017
 * zonder rol en zonder `RoleBadge`: de lijst verklapt niet wie beheerder is
 * (docs/features/login-rate-limit.md → Namenlijst zonder rol). De knop heet
 * alleen de naam.
 */
export function StaffPicker({
  staff,
  onSelect,
}: {
  staff: BarNaam[];
  onSelect: (member: BarNaam) => void;
}) {
  const shell = useShell();

  return (
    <div className="flex w-full max-w-[500px] flex-col items-center gap-5">
      {staff.length === 0 ? (
        <p className="text-center text-sm font-semibold text-rail-muted">
          {NO_BAR_STAFF_MESSAGE}
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
              aria-label={member.name}
              className="flex flex-col items-center gap-2 rounded-card border border-rail-border bg-rail-card px-2 py-[15px] text-center transition-colors hover:border-accent hover:bg-rail-hover"
            >
              <InitialsAvatar name={member.name} size="md" />
              <span className="text-metadata font-bold leading-tight text-white">
                {member.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

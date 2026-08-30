"use client";

import { useShell } from "@/lib/shell/ShellProvider";
import type { BarStaffMember } from "@/hooks/queries/useBarStaff";
import { ROLE_LABELS, NO_BAR_STAFF_MESSAGE } from "@/lib/staff";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { RoleBadge } from "@/components/RoleBadge";

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
              aria-label={`${member.name}, ${ROLE_LABELS[member.role]}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-rail-border bg-rail-card p-4 text-center transition-colors hover:border-accent"
            >
              <InitialsAvatar name={member.name} size="md" />
              <span className="text-sm font-bold leading-tight text-white">
                {member.name}
              </span>
              <RoleBadge role={member.role} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

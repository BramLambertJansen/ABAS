import { InitialsAvatar } from "@/components/InitialsAvatar";

/**
 * Avatar + naam boven de activiteitkeuze en het pincode-toetsenbord, zoals
 * het prototype (`activeStaffInitials`/`activeStaffName`, 48px avatar).
 */
export function StaffHeader({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <InitialsAvatar name={name} size="lg" />
      <p className="whitespace-nowrap text-detail font-bold text-rail-light">{name}</p>
    </div>
  );
}

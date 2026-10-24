"use client";

import { useRole } from "@/components/RoleProvider";
import { Segmented } from "@/components/Segmented";

// Demo-mode stand-in for login. The shell mounts it only when NEXT_PUBLIC_DEMO_MODE=1.
export function RoleSwitch() {
  const { role, setRole } = useRole();
  return (
    <Segmented
      label="View as"
      size="sm"
      value={role}
      onValueChange={setRole}
      options={[
        { value: "owner", label: "Owner" },
        { value: "manager", label: "Manager" },
      ]}
    />
  );
}

export function RoleNotice() {
  const { role } = useRole();
  if (role !== "manager") return null;
  return (
    <p className="text-sm font-medium text-hold">
      Manager view. Pay amounts are never shown here.
    </p>
  );
}

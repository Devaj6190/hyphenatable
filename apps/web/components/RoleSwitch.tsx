"use client";

import { useRouter } from "next/navigation";
import { useRole } from "@/components/RoleProvider";
import { Segmented } from "@/components/Segmented";

// Demo-mode stand-in for login. The shell mounts it only when NEXT_PUBLIC_DEMO_MODE=1.
export function RoleSwitch() {
  const { role, setRole } = useRole();
  const router = useRouter();
  return (
    <Segmented
      label="View as"
      size="sm"
      value={role}
      onValueChange={(r) => {
        setRole(r);
        // Data is redacted on the server per role, so re-fetch it now that the cookie changed.
        router.refresh();
      }}
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

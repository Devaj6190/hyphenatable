"use client";

import { useRole } from "@/components/RoleProvider";
import { cn } from "@/lib/utils";

const options = ["owner", "manager"] as const;

export function RoleSwitch() {
  const { role, setRole } = useRole();
  return (
    <fieldset className="m-0 flex rounded-lg border p-0.5 text-sm">
      <legend className="sr-only">View as</legend>
      {options.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={role === r}
          onClick={() => setRole(r)}
          className={cn(
            "rounded-md px-3 py-1 capitalize",
            role === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {r}
        </button>
      ))}
    </fieldset>
  );
}

export function RoleNotice() {
  const { role } = useRole();
  if (role !== "manager") return null;
  return (
    <p className="mx-auto mt-1 max-w-6xl text-sm font-medium text-hold">
      Manager view. Pay amounts are never shown here.
    </p>
  );
}

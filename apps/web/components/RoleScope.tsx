import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { RoleProvider } from "@/components/RoleProvider";
import { parseRole, ROLE_COOKIE } from "@/lib/role";

// Server component: reads the role cookie per request so the first HTML is already correct for the role.
export async function RoleScope({ children }: { children: ReactNode }) {
  const store = await cookies();
  return (
    <RoleProvider initialRole={parseRole(store.get(ROLE_COOKIE)?.value)}>
      {children}
    </RoleProvider>
  );
}

import type { EnvIds } from "@/lib/live/ids";

// Read as literal process.env.NEXT_PUBLIC_* so Next inlines them. With no URL the dashboard runs on fixtures only.
export const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export const envIds: EnvIds = {
  companyKey: process.env.NEXT_PUBLIC_LIVE_COMPANY_KEY || "a",
  companyId: process.env.NEXT_PUBLIC_LIVE_COMPANY_ID ?? "",
  ownerId: process.env.NEXT_PUBLIC_LIVE_OWNER_ID ?? "",
  managerId: process.env.NEXT_PUBLIC_LIVE_MANAGER_ID ?? "",
};

"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { RoleProvider } from "@/components/RoleProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function Providers({ children }: { children: ReactNode }) {
  const body = (
    <TooltipProvider>
      <RoleProvider>{children}</RoleProvider>
    </TooltipProvider>
  );
  // Without a deployment URL the dashboard renders from fixtures only.
  return convex ? (
    <ConvexProvider client={convex}>{body}</ConvexProvider>
  ) : (
    body
  );
}

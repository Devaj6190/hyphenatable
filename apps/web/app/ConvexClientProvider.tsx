"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex)
    return (
      <p className="p-8">
        Set NEXT_PUBLIC_CONVEX_URL (run `bunx convex dev` in apps/web).
      </p>
    );
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

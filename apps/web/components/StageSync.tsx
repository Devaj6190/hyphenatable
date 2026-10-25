"use client";

import { useEffect } from "react";
import { stageStore } from "@/lib/stageStore";

/** Publishes the home's stage to the shell stepper. Renders nothing; a drop-in where the in-page tracker used to be. */
export function StageSync({
  companyId,
  step,
  allDone = false,
  caption = "",
  fraction = 0,
}: {
  companyId: string;
  step: number;
  allDone?: boolean;
  caption?: string;
  fraction?: number;
}) {
  useEffect(() => {
    stageStore.set({ companyId, step, allDone, caption, fraction });
  }, [companyId, step, allDone, caption, fraction]);
  return null;
}

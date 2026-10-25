"use client";

import { useSyncExternalStore } from "react";

// Where the current payroll is, shared between the owner home (which owns the stage machine) and the shell's nav
// (which shows how many items still need the owner as a badge on Home). The home writes on every change; other
// pages read the last value for the same company.
export type StageState = {
  companyId: string;
  /** Index into STAGES; -1 before the run starts. */
  step: number;
  allDone: boolean;
  caption: string;
  fraction: number;
  /** Items still waiting on the owner in the current step; 0 when nothing is asked. */
  open: number;
};

let state: StageState | null = null;
const listeners = new Set<() => void>();

export const stageStore = {
  set(next: StageState) {
    const same =
      state &&
      state.companyId === next.companyId &&
      state.step === next.step &&
      state.allDone === next.allDone &&
      state.caption === next.caption &&
      state.fraction === next.fraction &&
      state.open === next.open;
    if (same) return;
    state = next;
    for (const l of listeners) l();
  },
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

const getServer = () => null;

export const useStageState = () =>
  useSyncExternalStore(stageStore.subscribe, stageStore.get, getServer);

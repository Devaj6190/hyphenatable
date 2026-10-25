"use client";

import { useSyncExternalStore } from "react";
import type { AuditEvent, Question, ThreadMessage } from "@/lib/types";

// ponytail: fixture-mode stand-in for questions.*, demo.simulatedReply and audit.list. Lives in this browser's
// localStorage only (shared across tabs, so a phone-sized manager tab sees a reply sent from the demo panel).
// Goes away once those Convex functions are live.
export type DemoLocal = {
  events: AuditEvent[];
  messages: ThreadMessage[];
  questions: Record<string, { status: Question["status"]; text?: string }>;
};

const KEY = "pp-demo-local";
const EMPTY: DemoLocal = { events: [], messages: [], questions: {} };
const listeners = new Set<() => void>();
let cache: DemoLocal | null = null;

function read(): DemoLocal {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache as DemoLocal;
}

function write(next: DemoLocal) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const useDemoLocal = () =>
  useSyncExternalStore(subscribe, read, () => EMPTY);

/** Appends one audit event, and optionally a message and a question status. Nothing is ever edited in place. */
export function recordLocal({
  event,
  message,
  question,
}: {
  event: Omit<AuditEvent, "id" | "at">;
  message?: Omit<ThreadMessage, "id" | "at">;
  question?: { id: string; status: Question["status"]; text?: string };
}) {
  const s = read();
  const at = new Date().toISOString();
  write({
    events: [
      ...s.events,
      { ...event, id: `local-au-${s.events.length + 1}`, at },
    ],
    messages: message
      ? [
          ...s.messages,
          { ...message, id: `local-m-${s.messages.length + 1}`, at },
        ]
      : s.messages,
    questions: question
      ? {
          ...s.questions,
          [question.id]: {
            status: question.status,
            text: question.text ?? s.questions[question.id]?.text,
          },
        }
      : s.questions,
  });
}

export const clearLocal = () => write(EMPTY);

export function withLocal(q: Question, local: DemoLocal): Question {
  const o = local.questions[q.id];
  return o ? { ...q, status: o.status, text: o.text ?? q.text } : q;
}

export const LOCAL_SOURCE = "this browser only, not saved to Convex";

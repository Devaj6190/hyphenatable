import events from "@/app/_fixtures/events.json";
import flags from "@/app/_fixtures/flags.json";
import messages from "@/app/_fixtures/messages.json";
import questions from "@/app/_fixtures/questions.json";
import workers from "@/app/_fixtures/workers.json";
import type {
  FixtureWorker,
  Flag,
  FlagEvent,
  Question,
  ThreadMessage,
} from "@/lib/types";

// Single import site. Swap to the repo-root data/fixtures/a/flags.json when Shanin adds it.
export const fixtureFlags = flags as Flag[];
export const fixtureQuestions = questions as Question[];
export const fixtureEvents = events as FlagEvent[];
export const fixtureMessages = messages as ThreadMessage[];
export const fixtureWorkers = workers as FixtureWorker[];

export const workerName = (id: string) =>
  fixtureWorkers.find((w) => w.id === id)?.displayName ?? id;

export const FIXTURE_SOURCE =
  "placeholder fixture, apps/web/app/_fixtures/flags.json";

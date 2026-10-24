import events from "@/app/_fixtures/events.json";
import flags from "@/app/_fixtures/flags.json";
import questions from "@/app/_fixtures/questions.json";
import type { Flag, FlagEvent, Question } from "@/lib/types";

// Single import site. Swap to the repo-root data/fixtures/a/flags.json when Shanin adds it.
export const fixtureFlags = flags as Flag[];
export const fixtureQuestions = questions as Question[];
export const fixtureEvents = events as FlagEvent[];
export const FIXTURE_SOURCE =
  "placeholder fixture, apps/web/app/_fixtures/flags.json";

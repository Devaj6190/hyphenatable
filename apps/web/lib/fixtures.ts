import flags from "@/app/_fixtures/flags.json";
import type { Flag } from "@/lib/types";

// Single import site. Swap to the repo-root data/fixtures/a/flags.json when Shanin adds it.
export const fixtureFlags = flags as Flag[];
export const FIXTURE_SOURCE =
  "placeholder fixture, apps/web/app/_fixtures/flags.json";

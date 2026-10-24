import type { Flag } from "../schemas";
import CHK01 from "./CHK-01";
import CHK02 from "./CHK-02";
import CHK03 from "./CHK-03";
import CHK04 from "./CHK-04";
import CHK05 from "./CHK-05";
import CHK06 from "./CHK-06";
import { cmp } from "./flag";
import type { Check, CheckInput } from "./types";

/** Every deterministic check, in id order. Later PRs append. */
export const checks: Check[] = [CHK01, CHK02, CHK03, CHK04, CHK05, CHK06];

/** Runs the registry over one cycle. Output is sorted by flag id, so re-runs are identical. */
export function runAll(input: CheckInput): Flag[] {
  return checks
    .flatMap((c) => c.run(input, input.rules))
    .sort((a, b) => cmp(a.id, b.id));
}

import type { Flag } from "../schemas";
import CHK01 from "./CHK-01";
import CHK02 from "./CHK-02";
import CHK03 from "./CHK-03";
import CHK04 from "./CHK-04";
import CHK05 from "./CHK-05";
import CHK06 from "./CHK-06";
import CHK07 from "./CHK-07";
import CHK08 from "./CHK-08";
import CHK09 from "./CHK-09";
import CHK10 from "./CHK-10";
import CHK11 from "./CHK-11";
import CHK12 from "./CHK-12";
import CHK13 from "./CHK-13";
import CHK14 from "./CHK-14";
import CHK15 from "./CHK-15";
import CHK16 from "./CHK-16";
import CHK17 from "./CHK-17";
import CHK18 from "./CHK-18";
import CHK19 from "./CHK-19";
import CHK20 from "./CHK-20";
import CHK21 from "./CHK-21";
import CHK22 from "./CHK-22";
import CHK23 from "./CHK-23";
import { cmp } from "./flag";
import type { Check, CheckInput } from "./types";

/** Every deterministic check, in id order. Later PRs append. */
export const checks: Check[] = [
  CHK01,
  CHK02,
  CHK03,
  CHK04,
  CHK05,
  CHK06,
  CHK07,
  CHK08,
  CHK09,
  CHK10,
  CHK11,
  CHK12,
  CHK13,
  CHK14,
  CHK15,
  CHK16,
  CHK17,
  CHK18,
  CHK19,
  CHK20,
  CHK21,
  CHK22,
  CHK23,
];

/** Runs the registry over one cycle. Output is sorted by flag id, so re-runs are identical. */
export function runAll(input: CheckInput): Flag[] {
  return checks
    .flatMap((c) => c.run(input, input.rules))
    .sort((a, b) => cmp(a.id, b.id));
}

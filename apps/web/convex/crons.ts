import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Autonomous runs (plan B-11): start the next cycle when a period ends. A no-op when DEMO_MODE=1.
crons.daily(
  "start due cycles",
  { hourUTC: 9, minuteUTC: 0 },
  internal.controller.cycle.startDue,
);

export default crons;

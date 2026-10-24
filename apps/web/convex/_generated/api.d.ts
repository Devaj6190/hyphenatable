/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as checks from "../checks.js";
import type * as corrections from "../corrections.js";
import type * as cycles from "../cycles.js";
import type * as demo from "../demo.js";
import type * as drafts from "../drafts.js";
import type * as eval from "../eval.js";
import type * as flags from "../flags.js";
import type * as http from "../http.js";
import type * as lib_ingest from "../lib/ingest.js";
import type * as lib_stub from "../lib/stub.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as messages from "../messages.js";
import type * as messaging_contract from "../messaging/contract.js";
import type * as onboarding from "../onboarding.js";
import type * as probe from "../probe.js";
import type * as probeNode from "../probeNode.js";
import type * as questions from "../questions.js";
import type * as rules from "../rules.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  checks: typeof checks;
  corrections: typeof corrections;
  cycles: typeof cycles;
  demo: typeof demo;
  drafts: typeof drafts;
  eval: typeof eval;
  flags: typeof flags;
  http: typeof http;
  "lib/ingest": typeof lib_ingest;
  "lib/stub": typeof lib_stub;
  "lib/validators": typeof lib_validators;
  "lib/viewer": typeof lib_viewer;
  messages: typeof messages;
  "messaging/contract": typeof messaging_contract;
  onboarding: typeof onboarding;
  probe: typeof probe;
  probeNode: typeof probeNode;
  questions: typeof questions;
  rules: typeof rules;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

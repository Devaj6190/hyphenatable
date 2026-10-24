import { ConvexError } from "convex/values";

/** The binding name exists (contract); the behaviour lands in the named ticket. Never fakes a state change. */
export function notYet(ticket: string): never {
  throw new ConvexError(`not implemented yet (${ticket})`);
}

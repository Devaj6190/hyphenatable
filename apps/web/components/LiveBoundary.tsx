"use client";

import { Component, type ReactNode } from "react";
import { errorReason as reason } from "@/lib/live/errors";

// Renders `fallback` when a live Convex query throws (e.g. a function isn't deployed yet, or an id is stale after a
// reseed). A function fallback gets the error, so the screen can say why it is on fixtures.
export class LiveBoundary extends Component<
  {
    fallback: ReactNode | ((error: Error) => ReactNode);
    children: ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === "function" ? fallback(error) : fallback;
  }
}

/** The useful line of a Convex error, for the "why am I on fixtures" note. */
export const errorReason = (e: Error) => reason(e.message);

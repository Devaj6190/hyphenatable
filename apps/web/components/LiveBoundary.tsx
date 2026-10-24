"use client";

import { Component, type ReactNode } from "react";

// Renders `fallback` when a live Convex query throws (e.g. B's function isn't deployed yet).
export class LiveBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

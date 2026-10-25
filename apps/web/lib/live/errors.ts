/**
 * The useful line of a Convex error. Convex wraps messages as "[CONVEX Q(name)] [Request ID: …] Server Error" with the
 * real reason on a later line ("Could not find public function for 'roster:list'"); production builds hide it and keep
 * only "Server Error". Prefer the reason, fall back to whatever is left.
 */
export function errorReason(message: string): string {
  const lines = message
    .split("\n")
    .map((l) =>
      l
        .replace(/\[CONVEX [^\]]*\]\s*/g, "")
        .replace(/\[Request ID: [^\]]*\]\s*/g, "")
        .trim(),
    )
    .filter(Boolean);
  return lines.find((l) => l !== "Server Error") ?? lines[0] ?? "unknown error";
}

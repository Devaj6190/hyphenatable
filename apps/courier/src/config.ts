import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const COURIER_DIR = join(import.meta.dir, "..");

// Photon credentials live in apps/courier/.env only. Load it whatever directory the courier is started from;
// variables already set in the shell win.
export function loadEnvFile(path = join(COURIER_DIR, ".env")): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match as unknown as [string, string, string];
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

export type Config = {
  spectrum: { projectId: string; projectSecret: string } | null;
  convexUrl: string | null;
  courierKey: string;
  stubPort: number;
  contactsFile: string;
};

export function readConfig(env = process.env): Config {
  const projectId = env.SPECTRUM_PROJECT_ID;
  const projectSecret = env.SPECTRUM_PROJECT_SECRET;
  const convexUrl = env.CONVEX_URL || env.NEXT_PUBLIC_CONVEX_URL || null;
  const courierKey = env.COURIER_KEY || (convexUrl ? "" : "local-stub-key");
  if (!courierKey) throw new Error("COURIER_KEY is required when talking to Convex");
  return {
    spectrum: projectId && projectSecret ? { projectId, projectSecret } : null,
    convexUrl,
    courierKey,
    stubPort: Number(env.STUB_PORT || 3210),
    contactsFile: env.CONTACTS_FILE || join(COURIER_DIR, "contacts.json"),
  };
}

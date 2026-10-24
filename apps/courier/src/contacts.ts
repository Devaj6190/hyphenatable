import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// contactRef → phone for the registered demo phones. The file is gitignored; phones never leave this process.
export type ContactMap = Record<string, string>;

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits}`;
}

// sha256 of the E.164 phone, base64url so the key carries the word "sha256" but no long digit runs.
export function conversationKey(phone: string): string {
  return `sha256:${createHash("sha256").update(normalizePhone(phone)).digest("base64url")}`;
}

export class Contacts {
  private byRef = new Map<string, string>();
  private byKey = new Map<string, { ref: string; phone: string }>();

  constructor(map: ContactMap) {
    for (const [ref, raw] of Object.entries(map)) {
      const phone = normalizePhone(raw);
      this.byRef.set(ref, phone);
      this.byKey.set(conversationKey(phone), { ref, phone });
    }
  }

  static load(path: string): Contacts {
    if (!existsSync(path))
      throw new Error(
        `contacts file missing: ${path} (copy contacts.example.json)`,
      );
    return new Contacts(JSON.parse(readFileSync(path, "utf8")) as ContactMap);
  }

  get refs(): string[] {
    return [...this.byRef.keys()];
  }

  phoneFor(contactRef: string): string | null {
    return this.byRef.get(contactRef) ?? null;
  }

  // Inbound from a phone we never registered is dropped, not relayed.
  isRegistered(phone: string): boolean {
    return this.byKey.has(conversationKey(phone));
  }
}

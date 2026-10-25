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

// Provider ids are hashed the same way before they reach Convex or the log: a Photon poll vote's id embeds the
// voter's phone. The hash is deterministic, so a vote's pollTarget still matches the poll's providerId.
export function opaqueId(providerId: string): string {
  return `sha256:${createHash("sha256").update(providerId).digest("base64url")}`;
}

// A phone number typed into a reply ("call me at 555 010 0101") is replaced before the text leaves the courier.
const PHONE_IN_TEXT =
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

export function redactPhones(text: string): string {
  return text.replace(PHONE_IN_TEXT, "[phone]");
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

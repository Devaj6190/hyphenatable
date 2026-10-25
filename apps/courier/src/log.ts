// Every log line goes through mask() so a phone number never reaches a terminal or a log file.
const PHONE_LIKE = /\+?\d[\d\s().-]{5,}\d/g;

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits.slice(0, 1)}••••${digits.slice(-4)}`;
}

export function mask(text: string): string {
  return text.replace(PHONE_LIKE, (m) =>
    m.replace(/\D/g, "").length >= 7 ? maskPhone(m) : m,
  );
}

export function log(...parts: unknown[]): void {
  const line = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
    .join(" ");
  console.log(`${new Date().toISOString()} courier ${mask(line)}`);
}

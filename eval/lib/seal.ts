// Sealing for the M2 runbook key: AES-256-GCM with a scrypt-derived key (node:crypto, no shelling out).
// The passphrase comes from M2_KEY_PASSPHRASE or a hidden terminal prompt; it is never logged or written.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { z } from "zod";

const N = 2 ** 15;
const R = 8;
const P = 1;

export const Sealed = z.object({
  v: z.literal(1),
  alg: z.literal("aes-256-gcm"),
  kdf: z.object({
    name: z.literal("scrypt"),
    N: z.number().int(),
    r: z.number().int(),
    p: z.number().int(),
    salt: z.string(),
  }),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});
export type Sealed = z.infer<typeof Sealed>;

const key = (passphrase: string, salt: Buffer, n = N, r = R, p = P) => {
  if (passphrase.length < 12)
    throw new Error("passphrase must be at least 12 characters");
  return scryptSync(passphrase, salt, 32, { N: n, r, p, maxmem: 256 * n * r });
};

export function seal(plain: Buffer, passphrase: string): Sealed {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  const data = Buffer.concat([c.update(plain), c.final()]);
  return {
    v: 1,
    alg: "aes-256-gcm",
    kdf: { name: "scrypt", N, r: R, p: P, salt: salt.toString("base64") },
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/** Throws on a wrong passphrase or any tampering (GCM authentication). */
export function unseal(sealed: unknown, passphrase: string): Buffer {
  const s = Sealed.parse(sealed);
  const d = createDecipheriv(
    "aes-256-gcm",
    key(
      passphrase,
      Buffer.from(s.kdf.salt, "base64"),
      s.kdf.N,
      s.kdf.r,
      s.kdf.p,
    ),
    Buffer.from(s.iv, "base64"),
  );
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  try {
    return Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]);
  } catch {
    throw new Error("cannot unseal: wrong passphrase or the file was changed");
  }
}

/** M2_KEY_PASSPHRASE, else a prompt that does not echo. */
export async function passphrase(
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const fromEnv = env.M2_KEY_PASSPHRASE;
  if (fromEnv) return fromEnv;
  const stdin = process.stdin;
  if (!stdin.isTTY)
    throw new Error("set M2_KEY_PASSPHRASE (no terminal for a hidden prompt)");
  process.stderr.write("M2 key passphrase: ");
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolve, reject) => {
    let s = "";
    const done = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      if (err) reject(err);
      else resolve(s);
    };
    const onData = (b: Buffer) => {
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1);
        else s += ch;
      }
    };
    stdin.on("data", onData);
  });
}

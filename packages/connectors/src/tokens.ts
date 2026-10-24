// OAuth token persistence shared by the connectors. Default files live in data/private/ (gitignored),
// the only runtime write outside the package. Token values are never logged.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface StoredTokens {
  accessToken: string | null;
  /** epoch ms */
  accessTokenExpiresAt: number | null;
  refreshToken: string;
}

export interface TokenStore {
  load(): Promise<StoredTokens | null>;
  save(tokens: StoredTokens): Promise<void>;
}

/** Absolute path of a file under the repo's data/private/. */
export const privatePath = (name: string): string =>
  fileURLToPath(new URL(`../../../data/private/${name}`, import.meta.url));

/** JSON file, written 0600 via an atomic rename so a crash never leaves half a rotated token. */
export function fileTokenStore(path: string): TokenStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, "utf8")) as StoredTokens;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async save(tokens) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(tokens), { mode: 0o600 });
      await rename(tmp, path);
    },
  };
}

export const tokenFresh = (
  t: StoredTokens,
  skewMs = 60_000,
): t is StoredTokens & { accessToken: string } =>
  !!t.accessToken &&
  !!t.accessTokenExpiresAt &&
  t.accessTokenExpiresAt - skewMs > Date.now();

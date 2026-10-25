import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets tests import server view functions: `@/` as in tsconfig, and the `server-only` guard as a no-op.
export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});

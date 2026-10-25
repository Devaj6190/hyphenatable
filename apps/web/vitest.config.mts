import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The "@/" alias from tsconfig, so tests can import app code (lib/server/fixtures, components/*/data).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});

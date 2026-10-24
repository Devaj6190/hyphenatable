import { defineConfig, devices } from "@playwright/test";

// C-14 e2e checks. `bun run e2e` starts the dashboard on fixtures (no Convex URL) and runs everything in e2e/.
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/results",
  reporter: "list",
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT), NEXT_PUBLIC_CONVEX_URL: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

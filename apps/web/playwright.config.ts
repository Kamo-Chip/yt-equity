import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 3100);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 4101);
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `PORT=${apiPort} node test/fixtures/api.mjs`,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        `API_INTERNAL_URL=http://127.0.0.1:${apiPort} NEXT_DIST_DIR=.next-qa pnpm exec next ${production ? "start" : "dev"} --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});

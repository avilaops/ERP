import { defineConfig, devices } from "@playwright/test";

/**
 * The screens test (`npm run test:telas`): opens the system with the local
 * sign-in, walks every screen reachable from the menu and measures each one in
 * the five sizes of docs/ux.md. Needs a database with the demonstration data
 * (`npm run db:seed-demo`) and ERP_LOCAL_LOGIN=1; see docs/ux.md, "Como conferir".
 */
export default defineConfig({
  testDir: "tests/visual",
  outputDir: "test-results/telas",
  timeout: 40 * 60_000,
  reporter: [["list"], ["html", { outputFolder: "test-results/telas-relatorio", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3020",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3020/dev/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

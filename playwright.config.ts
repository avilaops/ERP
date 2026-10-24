import { defineConfig, devices } from "@playwright/test";

const visualDatabaseUrl = process.env.ERP_TEST_DATABASE_URL?.trim();

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
    locale: "pt-BR",
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined,
  },
  webServer: {
    // Webpack releases compiled route entries more predictably during the
    // repository-wide crawl; Turbopack crossed Next's memory restart threshold
    // before the first screenshot on the 4 GB development host.
    command: "npm run dev -- --webpack",
    url: "http://127.0.0.1:3020/dev/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      ERP_LOCAL_LOGIN: "1",
      ERP_TENANTS: process.env.ERP_TENANTS ?? "ludus:Ludus Equipamentos",
      ...(visualDatabaseUrl ? { DATABASE_URL: visualDatabaseUrl } : {}),
    },
  },
});

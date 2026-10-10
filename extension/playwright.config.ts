import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    // Extension e2e tests require a headed Chromium with the extension loaded.
    browserName: "chromium",
    headless: false,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "extension",
      use: {
        ...devices["Desktop Chrome"],
        // Extension path is set by the CI script after build.
        launchOptions: {
          args: [
            `--disable-extensions-except=${process.env["EXTENSION_PATH"] ?? ""}`,
            `--load-extension=${process.env["EXTENSION_PATH"] ?? ""}`,
          ],
        },
      },
    },
  ],
});

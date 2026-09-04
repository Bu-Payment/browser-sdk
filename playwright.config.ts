import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/browser",
  use: { baseURL: "http://127.0.0.1:47831", browserName: "chromium", headless: true },
  webServer: {
    command: "bun test/browser/server.ts",
    url: "http://127.0.0.1:47831",
    reuseExistingServer: false,
  },
});

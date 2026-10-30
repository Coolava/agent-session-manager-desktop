import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', channel: 'chrome', viewport: { width: 1380, height: 880 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/desktop.html',
    reuseExistingServer: false,
    timeout: 30000,
  },
});

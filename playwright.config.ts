import { defineConfig } from '@playwright/test';

// BASE_URL points the suite at a deployed site instead of a local preview
const deployed = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: deployed ?? 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
  },
  webServer: deployed ? undefined : {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});

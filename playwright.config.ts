import { defineConfig } from '@playwright/test';

// Smoke test of the UI. The map needs WebGL → software rendering (SwiftShader) in headless Chromium.
// If the network goes through a proxy (HTTPS_PROXY), the browser uses it for the map tiles.
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    proxy,
    trace: 'off'
  },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 120_000 }
});

import path from "node:path";
import { defineConfig } from "@playwright/test";

const frontendOrigin = process.env.E2E_FRONTEND_URL ?? "http://127.0.0.1:3100";
const backendOrigin = process.env.E2E_API_URL ?? "http://127.0.0.1:8100";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: frontendOrigin,
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "npm run build && python -m http.server 3100 --bind 127.0.0.1 --directory out",
      cwd: path.resolve(__dirname),
      url: frontendOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: backendOrigin,
      },
    },
    {
      command: ".\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100",
      cwd: path.resolve(__dirname, "../backend"),
      url: `${backendOrigin}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        ALLOWED_ORIGINS: frontendOrigin,
        DEMO_REQUESTS_PER_MINUTE: "0",
        DEMO_EXPLANATIONS_PER_DAY: "0",
      },
    },
  ],
});

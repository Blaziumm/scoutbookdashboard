Worker for running Playwright-based scraping

Purpose
- This small worker runs the existing Playwright scripts (scripts/login.js and scripts/run.js) in an environment that supports browsers (a VPS, Render, Fly, Railway, etc.). It exposes two endpoints:
  - POST /login { username, password } -> returns session storageState JSON
  - POST /advancements { session } -> returns the advancements data

Security
- Set WORKER_SECRET in the worker environment and send requests with Authorization: Bearer <WORKER_SECRET>.

Quick usage
1. Deploy this directory to a host that supports running Chromium (e.g., a small VPS or Render):
   - Ensure Node 18+ is installed and the system has required libraries for Playwright.
   - Install dependencies: `npm install` (ensure playwright is installed and run `npx playwright install --with-deps` on Linux hosts).
2. Set environment variables on the worker host:
   - WORKER_SECRET=some-secret
   - WORKER_PORT=4000 (optional)
   - Optional S3 persistence (for sharing session/data across instances):
     - AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
3. Call the worker API from your Vercel app (or curl):
   - POST /login with JSON body { "username": "...", "password": "..." } and header Authorization: Bearer <WORKER_SECRET>
   - Take the returned session JSON and POST /advancements with { "session": <session> } using the same auth.

Vercel integration
- On Vercel, set `BROWSERLESS_WS_ENDPOINT` or `BROWSERLESS_TOKEN` and the API routes can run the Playwright scripts directly.
- If you still run a separate worker, it can use the same Browserless configuration.

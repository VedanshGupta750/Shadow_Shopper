# Shadow Shopper Deployment

Backend → Render Free + UptimeRobot keep-alive. Frontend → Vercel.

## Render Backend Deployment

1. Push to GitHub.
2. Render dashboard → **New** → **Web Service**.
3. Connect GitHub repo. **Root Directory: `apps/server`**.
4. Plan: **Free**.
5. Build Command auto-fills from `render.yaml`. Start Command auto-fills.
6. Add env vars from your local `apps/server/.env` (NEVER commit). The keys to set:
   - `AZURE_ENDPOINT`
   - `AZURE_API_KEY`
   - `AZURE_API_VERSION`
   - `DEPLOYMENT_NAME`
   - `SCRAPERAPI_KEY`
   - `FRONTEND_ORIGIN` — set to a valid URL placeholder for now (e.g. `https://placeholder.vercel.app`). The env validator requires a valid URL string; you'll update this after the Vercel deploy in step "Update CORS" below.

   `NODE_ENV=production` is hard-coded in `render.yaml`, so don't set it manually.
7. Click **Deploy**. Wait 3-5 min for the first build.
8. Copy the `*.onrender.com` URL Render gives you. Hit `https://<your-service>.onrender.com/healthz` in your browser — should return `{"status":"ok",...}`.

## UptimeRobot Setup (CRITICAL — prevents cold starts)

1. [uptimerobot.com](https://uptimerobot.com) → **Add New Monitor**.
2. Monitor Type: **HTTP(s)**.
3. URL: `https://shadow-shopper-api.onrender.com/healthz` (use your actual Render URL).
4. Monitoring Interval: **5 minutes**.
5. Alert contact: your email.
6. Save. Verify monitor goes green within 5 min.

Without this, Render Free sleeps after 15 min idle and the demo cold-starts at 30-60s on first click. UptimeRobot's 5-min ping keeps the dyno warm.

## Vercel Frontend Deployment

1. [vercel.com](https://vercel.com) → **Import Project** → select your GitHub repo.
2. **Root Directory: `apps/web`**. Framework Preset: Vite (auto-detected).
3. Add env var:
   - `VITE_API_URL=https://shadow-shopper-api.onrender.com` (your Render URL, no trailing slash).
4. **Deploy**. Note the `*.vercel.app` URL.

## Update CORS

The backend was deployed with a placeholder `FRONTEND_ORIGIN`. Now point it at the real Vercel URL:

1. Render dashboard → your service → **Environment**.
2. Set `FRONTEND_ORIGIN` to your Vercel URL (e.g. `https://shadow-shopper.vercel.app` — no trailing slash).
3. Save (triggers an automatic re-deploy, 1-2 min).

## Verification

1. Open the Vercel URL in an incognito browser.
2. Paste the hero ASIN URL (e.g. `https://www.amazon.com/dp/B00JEV5UI8`). Click Run.
3. Watch the full demo run end-to-end (scraping → surfacing → 10 personas → synthesis).
4. Open DevTools → **Console**: 0 errors.
5. Open DevTools → **Network**: the `stream-personas` request shows status `200` and stays in `Pending` while bytes stream in (this is correct SSE behavior).
6. After done, click **History** in the header — your run is saved.
7. Click **Generate copy** on a conversion lever → modal shows real bullet rewrites.
8. Try a custom buyer question in the AI Surfacing section.

If the SSE request ends immediately with `0 bytes` or you see a CORS error in the console, double-check `FRONTEND_ORIGIN` on Render exactly matches your Vercel URL (no trailing slash, no path).

## Re-deploy

- **Backend:** push to `main` → Render auto-deploys.
- **Frontend:** push to `main` → Vercel auto-deploys.

## Cost (verify each month)

- Render Free: 750 hours/month — one always-on web service stays inside the cap if you don't run anything else on the same account.
- UptimeRobot Free: 50 monitors, 5-min interval. Free forever.
- Vercel Hobby: free for personal projects.
- Azure OpenAI / ScraperAPI: pay-per-use; the demo's per-run cost is logged in the `done` SSE event.

# Tech Decisions

Every major choice in Shadow Shopper, framed as a trade-off rather than a foregone conclusion. Each entry names what we'd switch to under what condition.

## LLM provider: We chose Azure OpenAI GPT-4o for everything over an Anthropic + OpenAI hybrid

**Context:** We need consistent persona voices, strict structured JSON output, and parallel calls (10 personas + synthesizer + 10 surfacing simulators + on-demand fix generation) on a tight cost budget and 72-hour build window.

**What we did:** Single Azure OpenAI GPT-4o deployment for every LLM call in the system. One model, one auth scheme, one rate-limit budget to reason about. Every structured output uses `response_format: json_schema` with `strict: true` so we get parser-rejection at the model layer, not at the Zod layer.

**Trade-off:** No model diversity. If GPT-4o has a specific weakness — Claude's longer thinking might produce better synthesis, or a smaller model might be cheaper for the surfacing simulators — we can't mix-and-match without adding a second auth path, second SDK, second rate limiter. We also accept Azure's stricter rate limits over OpenAI's direct API.

**Switch criteria:** We'd move to a hybrid (Claude Sonnet 4.6 for synthesis, GPT-4o for the 10 personas, smaller model for surfacing) when synthesis output starts feeling formulaic OR when token volume on the persona fan-out makes the surfacing calls a meaningful slice of the bill — at which point cheaper-per-call surfaces become worth the integration cost.

## Backend hosting: We chose Render Free + UptimeRobot over Railway/Fly.io paid

**Context:** Demo project, no funding, needs to be accessible to a hiring manager without cold-start lag.

**What we did:** Deployed to Render's free Node service. Added an UptimeRobot HTTP monitor pinging `/healthz` every 5 minutes. The 5-minute ping is below Render's 15-minute idle-sleep threshold, so the dyno stays warm 24/7. We stay inside Render's 750 instance-hours/month free tier (one always-on service ≈ 720 hours).

**Trade-off:** Render Free has 512MB RAM, no autoscaling, single region (the demo runs in `iad1`/Oregon). If concurrent users exceed ~5, requests start queueing. UptimeRobot is a single point of failure for warm-keeping; if it goes down, next visitor pays a 30-60s cold-start.

**Switch criteria:** We'd move to Railway or Fly.io paid (~$5/mo) the moment we need autoscaling, multi-region, or have more than ~5 concurrent users. Render's paid Standard plan ($7/mo) would also fix this without changing platforms.

## Streaming: We chose SSE over WebSockets

**Context:** Need to stream LLM tokens, persona events, surfacing cells, scrape progress, and synthesis tokens from server to client during a 30-90 second pipeline.

**What we did:** Server-Sent Events. One-way server→client over plain HTTPS, native `EventSource` on the client (we hand-rolled the parser since we already had a custom hook), trivial to proxy through Render and Vercel without WebSocket-specific config. Heartbeat every 15s to keep proxies from killing idle connections.

**Trade-off:** SSE is one-way only. If we ever need bidirectional client→server messages during a live run — "skip this persona", "regenerate just Sarah", "abort midway" — we'd need a second channel. Today, "abort" is handled by closing the request and the server detects `req.on("close")`, which works but is ugly.

**Switch criteria:** We'd switch to WebSockets when we add interactive controls during streaming (mid-run persona regeneration, real-time prompt tweaking) where the client needs to push messages to a long-lived backend session.

## Scraper: We chose ScraperAPI structured endpoints over Apify

**Context:** Need product details, reviews, and search results from Amazon. 72-hour build window meant iteration speed mattered more than max throughput or per-call cost.

**What we did:** ScraperAPI's structured Amazon endpoints (`/structured/amazon/product`, `/review`, `/search`). Synchronous JSON responses, drop-in axios calls with `p-retry` and `p-limit`, filesystem cache (SHA-1 keyed, 7-day TTL) so dev iteration doesn't re-bill for the same ASIN.

**Trade-off:** ScraperAPI is more expensive per call than Apify at scale, and the structured endpoints' schema is fixed — we can't extract custom fields like Q&A section text or A+ Content metadata. Synchronous calls also bound concurrency; Apify's async-actor model parallelizes better above ~50 concurrent scrapes.

**Switch criteria:** We'd move to Apify the moment we need >10K analyses/month (Apify is ~3x cheaper at volume) or when we need to extract custom fields not in ScraperAPI's structured schema (Q&A, A+ Content, image alt text for the listing).

## Backend framework: We chose Express over Next.js API routes

**Context:** Backend has long-running SSE streams (30-90s), parallel LLM fan-out, request-id middleware, rate limiting, structured logging, and graceful-shutdown semantics.

**What we did:** Standalone Express app in `apps/server`. Independent deploy lifecycle from the frontend. Render runs the Node process with full request control, including `app.set("trust proxy", 1)` for accurate IP-based rate limiting and a SIGTERM handler that drains in-flight SSE connections within 30 seconds.

**Trade-off:** Two deploys to manage instead of one. Two CI surfaces. Slightly more boilerplate (CORS, request-id, error handler) than colocated Next.js routes would need.

**Switch criteria:** We'd merge into Next.js API routes when (a) Next.js's serverless function timeout grows past 5 minutes — current Hobby cap is 60s, Pro is 300s, both still too short for our SSE streams — AND (b) we want a single deploy unit. Until then, the Express boundary is load-bearing.

## Frontend tooling: We chose Vite over Next.js

**Context:** Frontend is a single-page React app consuming an SSE stream. No SEO needs, no SSR, no marketing pages, no multi-route navigation.

**What we did:** Vite + React 19 + Tailwind v4 + shadcn/ui + Motion. Sub-second HMR keeps the prompt-iteration loop tight (edit a persona system prompt, hit save, re-run, see new behavior in 2 seconds). Static deploy to Vercel's CDN.

**Trade-off:** No SSR — initial HTML is empty until the JS bundle loads. We can't ship shareable result URLs that render server-side, and we have no SEO surface.

**Switch criteria:** We'd move to Next.js when we want shareable shadow-shopper.com/r/abc123 links that render the cached synthesis report server-side, OR when we add a marketing surface that needs SEO. Today neither is a priority.

## Cross-platform support: We chose generic JSON-LD / OpenGraph fallback over per-platform scrapers

**Context:** Users want to paste any e-commerce URL — Amazon, Flipkart, Meesho, Myntra, AJIO, Nykaa — not just Amazon. The original architecture only spoke ScraperAPI's structured Amazon endpoint, which doesn't exist for the others. Two real paths forward: write per-platform DOM scrapers (one for each site), or rely on the structured data sites already publish for SEO.

**What we did:** Added one generic scraper that fetches the rendered HTML via ScraperAPI's general-purpose endpoint, parses `<script type="application/ld+json">` recursively for any node whose `@type` includes "Product" (per schema.org), and falls back to `<meta property="og:*">` and `product:*` meta tags. Zero per-platform CSS selectors, zero hardcoded class names, zero "if hostname === flipkart" conditionals beyond the routing decision (Amazon path vs generic path). Whatever the page exposes via web standards is what we get.

**Trade-off:** On non-Amazon platforms we get product name, brand, price, image, description, and (if published) aggregate rating. We do NOT get individual reviews, competitor listings, or AI Surfacing audit (Rufus is Amazon-specific). The personas still run but their prompts are tuned for Amazon shopping habits — we acknowledge this honestly with a yellow banner in the UI rather than pretend otherwise. Sites that don't publish JSON-LD or OpenGraph metadata won't work at all (most major e-commerce sites do; some niche or aggressively-anti-bot ones don't).

**Switch criteria:** We'd add a per-platform scraper (Flipkart-specific selectors, Meesho-specific selectors, etc.) when a single platform becomes load-bearing for users AND the structured-data fallback is producing visibly degraded analysis on it. We will NOT swap the Amazon path's ScraperAPI structured endpoints for the generic JSON-LD scraper — Amazon's structured endpoint gets us reviews, search, and a stable schema; the generic path is strictly the degraded-but-honest fallback.

## Rufus simulator: We chose GPT-4o style imitation over Playwright automation

**Context:** Amazon Rufus has no public API. We need to score whether a given listing surfaces in Rufus answers across 5 natural-language buyer questions, plus a custom-question slot.

**What we did:** Prompt GPT-4o to imitate Rufus's published answer style — italicized product names with asterisks, second-person voice, citation patterns ("based on customer reviews…"), opening intent framing, follow-up question close. Constrain the model to only mention products from a candidate list (target + 9 competitors). Tag the output as "Simulated" everywhere it appears in the UI.

**Trade-off:** It's a stylistic approximation, not the real thing. A listing that "wins" in our simulator might still lose in real Rufus due to training data we don't have, and our eval already caught that famous-SKU listings (Sony WH-1000XM4, iPhone 11) get 9-10/10 green at position 1 because the model name-recognizes them rather than reasoning about them. Documented honestly in EVAL.md.

**Switch criteria:** We'd swap the simulator for a real Rufus adapter the day Amazon opens an API — the integration point is one function (`simulateRufus(question, product, competitors, signal)`), which is a clean adapter swap. We will NOT swap to Playwright-driving-Rufus's-web-UI: that violates Amazon's TOS, risks account bans on the seller's account, and the Rufus UI is HTML-state-spaghetti that'd break on every Amazon release. Wrong shortcut.

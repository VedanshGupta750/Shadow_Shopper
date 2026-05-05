# Shadow Shopper

> **10 synthetic buyer personas walk an e-commerce listing in real time and tell you why customers aren't buying — ranked by revenue at risk. Each fix comes with paste-ready copy.**
>
> **Best on Amazon (any TLD).** Also accepts any other product URL — Flipkart, Meesho, Myntra, AJIO, Nykaa, etc. — via a generic JSON-LD / OpenGraph fallback, with a clearly-labeled degraded mode.

| | |
|---|---|
| **Live demo** | https://shadow-shopper.vercel.app |
| **Backend health** | https://shadow-shopper-api.onrender.com/healthz |
| **Source** | https://github.com/VedanshGupta750/Shadow_Shopper |
| **Decisions doc** | [DECISIONS.md](DECISIONS.md) |
| **Evaluation** | [EVAL.md](EVAL.md) |
| **Deployment guide** | [DEPLOYMENT.md](DEPLOYMENT.md) |

![Hero demo](docs/hero.gif)

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What you see in 90 seconds](#what-you-see-in-90-seconds)
- [Supported platforms](#supported-platforms)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Features](#features)
- [The 10 personas](#the-10-personas)
- [API reference](#api-reference)
- [Streaming protocol (SSE)](#streaming-protocol-sse)
- [State management](#state-management)
- [Caching strategy](#caching-strategy)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Performance characteristics](#performance-characteristics)
- [Production deployment](#production-deployment)
- [Limitations](#limitations)
- [What's next](#whats-next)

---

## Why this exists

Most "AI Amazon listing optimizer" tools tell sellers WHAT to write — a generic best-practice template, an adjective swap, a one-shot bullet rewrite. They don't explain WHY the actual buyers are walking past, WHY Amazon's AI surfaces are skipping over the listing, or WHERE the dollar-per-month risk actually sits.

Shadow Shopper inverts that. It runs the buyer's mental model first, then ranks the friction by estimated revenue at risk, then offers the rewritten copy as a downstream action you choose to take per fix — not as a one-shot blanket regeneration. The seller stays in the loop on which fixes to apply.

---

## What you see in 90 seconds

You paste an Amazon product URL. Five phases run in order, each streaming results live to the UI as it completes:

| # | Phase | Duration | What happens |
|---|---|---|---|
| 1 | **Scrape** | 5-15s | ScraperAPI fetches product details, up to 100 reviews, and a competitor search (8 results). Filesystem-cached for 7 days by SHA-1 of the request URL — so dev iteration on the same ASIN is free. |
| 2 | **AI surfacing audit** | 10-15s | 5 GPT-generated buyer questions × 2 simulated surfaces (Rufus + ChatGPT shopping mode) = 10 cells, scored green/yellow/red based on whether the listing surfaces and at what position. |
| 3 | **10 personas in parallel** | 8-15s | All 10 buyer personas consume the same product brief and stream structured verdicts simultaneously (`would-buy` / `would-not-buy` / `would-buy-competitor` + confidence + friction points + competitor named + headline quote). |
| 4 | **Synthesis** | 5-10s | One GPT-4o call aggregates all signals into top 3 friction points, top 3 conversion levers, winning competitor, and a revenue-at-risk range with the math shown explicitly. |
| 5 | **Generate Fix** | on demand | Click "Generate copy" on any conversion lever to get 3-5 bullet rewrites + an A+ Content paragraph + an image brief, all formatted as paste-ready copy for Seller Central. |

Every completed run auto-saves to a localStorage history drawer (cap 20 entries). Click any past entry to rehydrate the full UI without re-running anything. Generated fixes cache per (analysis, lever) — re-opening a fix you've already generated costs $0 in tokens.

You can also type a **custom buyer question** below the surfacing grid and we'll run that single question through both Rufus and ChatGPT simulators on demand. Useful for hunting which specific real-buyer queries the listing is "losing."

---

## Supported platforms

The pipeline routes by URL hostname into one of two paths.

### Amazon — full pipeline

Any of these TLDs run the full structured-data pipeline. Reviews, competitor search, AI Surfacing audit, all 10 personas, synthesis, Generate Fix.

`amazon.com` · `amazon.in` · `amazon.co.uk` · `amazon.de` · `amazon.fr` · `amazon.it` · `amazon.es` · `amazon.ca` · `amazon.com.au` · `amazon.co.jp` · `amazon.com.mx` · `amazon.com.br` · `amazon.nl` · `amazon.se` · `amazon.pl` · `amazon.sa` · `amazon.ae` · `amazon.eg` · `amazon.com.tr` · `amazon.sg`

### Other platforms — degraded mode (honest)

Any other product URL is accepted and runs through a generic JSON-LD / OpenGraph fallback scraper — **no per-platform DOM selectors** by design. We never special-case Flipkart vs Meesho vs Myntra; whatever structured data the page exposes (`<script type="application/ld+json">` with `@type: "Product"`, or `<meta property="og:*">` tags) is what we get. Tested against Flipkart, Meesho, Myntra, AJIO, and Nykaa.

The frontend shows a yellow banner above results when a non-Amazon URL is loaded, calling out the limitations honestly:

| | Amazon path | Generic path |
|---|---|---|
| Product details (name, price, brand, image, bullets) | ✅ Full | ✅ Whatever the page exposes via JSON-LD / OG |
| Reviews | ✅ Up to 100 | ❌ No standard schema for review bodies |
| Competitor search | ✅ 8 results | ❌ No per-platform search API |
| AI Surfacing audit (Rufus + ChatGPT) | ✅ 5×2 grid | ❌ Skipped — Rufus is Amazon-specific |
| 10 buyer personas | ✅ | ⚠️ Run, but tuned for Amazon shopping habits — banner says results are directional |
| Synthesis report | ✅ | ⚠️ Same — Amazon-flavored levers may not apply |
| Generate Fix | ✅ Paste-ready Seller Central copy | ⚠️ Generates copy, but format is Seller Central, not Flipkart Seller Hub etc. |
| History drawer | ✅ | ✅ |
| Custom buyer questions | ✅ | ❌ Hidden along with the surfacing card |

**Why we don't ship per-platform scrapers.** Brittle (HTML changes every release), TOS risk (most platforms ban automated scraping), and once the URL parser is platform-agnostic the analysis layer's Amazon-tilt becomes the harder problem anyway. Documented as a deliberate trade-off in [DECISIONS.md](DECISIONS.md).

---

## Architecture

```
                         ┌───────────────────────────┐
                         │   User (browser)          │
                         └─────────────┬─────────────┘
                                       │ HTTPS
                                       ▼
                         ┌───────────────────────────┐
                         │   Vercel CDN              │
                         │   Vite + React 19 SPA     │
                         │   Tailwind v4 + shadcn/ui │
                         │   Motion animations       │
                         └─────────────┬─────────────┘
                                       │
                                       │ POST /api/stream-personas (SSE, 30-90s)
                                       │ POST /api/generate-fix     (JSON)
                                       │ POST /api/surface-question (JSON)
                                       ▼
                         ┌───────────────────────────┐
                         │   Render Free + UptimeRobot keep-warm
                         │   Node 20 + Express + TypeScript
                         │   Pino structured logging
                         │   express-rate-limit (10/min/IP)
                         │   Helmet, CORS, gzip
                         │   Trust-proxy=1, SIGTERM drain (30s)
                         └─────────────┬─────────────┘
                                       │
              │
              │ parseProductUrl(url) → { platform: "amazon" | "generic" }
              │
              ├──────────────────────────┬──────────────────────────────┐
              ▼                          ▼                              ▼
       ┌─────────────────┐      ┌──────────────────┐          (any other URL)
       │ Amazon path     │      │ Generic path     │
       │ ScraperAPI      │      │ ScraperAPI raw   │
       │ /product        │      │ HTML + JSON-LD   │
       │ /review (100)   │      │ Product parser   │
       │ /search (8)     │      │ + OpenGraph fb   │
       │ FS cache 7d     │      │ no per-platform  │
       │                 │      │ selectors        │
       └────────┬────────┘      └────────┬─────────┘
                │                        │
              ┌─┴────────────────────────┴────┐
              ▼                               ▼
       ┌──────────────────┐           ┌──────────────────┐ ┌─────────────────┐
       │ Surfacing fan-out│           │ Persona fan-out  │ │ Synthesizer     │
       │ 5 questions      │           │ 10 personas      │ │ 1 GPT-4o call   │
       │ × 2 surfaces     │           │ in parallel      │ │ structured JSON │
       │ (Rufus + ChatGPT)│           │ (Promise.all)    │ │ revenue + fixes │
       │ p-limit(4)       │           │ token streaming  │ │                 │
       │ AMAZON ONLY      │           │                  │ │                 │
       └──────────────────┘           └──────────────────┘ └─────────────────┘
                                       │                     │                    │
                                       └─────────────────────┴────────────────────┘
                                                             │ all results
                                                             ▼
                                                    ┌──────────────────┐
                                                    │ Generate Fix     │
                                                    │ (on demand)      │
                                                    │ 1 GPT-4o call    │
                                                    │ per lever click  │
                                                    └──────────────────┘
```

ASCII version with extra detail in [`docs/architecture.txt`](docs/architecture.txt).

### Request lifecycle

When a user clicks **Run** on the frontend:

1. Frontend `usePersonaStream` hook generates a fresh `analysisId` (UUID), opens a fetch with `POST /api/stream-personas`, and starts reading the response body as an SSE byte stream.
2. Backend handler validates the body via Zod, extracts the ASIN, then sequences:
   - **Scraping** (cached on FS, SHA-1 keyed). Emits `phase`, `scrape-progress`, then `product-meta` (a structured event carrying name/brand/price/bullets/rating/reviews — used by the frontend for both UI display and the Generate-Fix product context).
   - **Surfacing** via `streamSurfacing` async generator. p-limit at 4 cells in flight. Emits `surfacing-questions`, then per-cell `surfacing-cell-start` / `surfacing-cell-result` until `surfacing-complete`.
   - **Personas** via `Promise.allSettled([10 streamPersona generators])`. Each persona emits `persona-token` events as the LLM streams, then `persona-complete` with the parsed verdict (or `persona-error`).
   - **Synthesizer** via `streamSynthesizer` consuming all completed verdicts + product + competitors. Emits `synthesis-token` while streaming and `synthesis-complete` when the strict-JSON output is parsed and Zod-validated.
3. Final `done` event with `totalMs` and `totalCostUsd`. Connection closes.
4. Frontend reducer applies each action; `useEffect` watching `state.synthesis.report` writes the entire run to localStorage (idempotent upsert by `analysisId`).

### Failure modes the pipeline handles

- **Persona LLM call fails** → `persona-error` event, the other 9 personas continue, synthesis proceeds with whatever succeeded.
- **Synthesizer fails to parse / validate JSON** → non-fatal `error` event with code `SYNTHESIS_FAILED`. Frontend renders a fallback panel below the persona cards. Persona verdicts stay valid.
- **No persona verdicts succeed** → `error` with code `NO_VERDICTS`. Same fallback UI.
- **Total handler timeout (4 min)** → `AbortController` cancels all in-flight Azure calls and the connection closes cleanly.
- **Client disconnect** → `req.on("close")` triggers the same abort path; no orphaned LLM calls.
- **SIGTERM (Render redeploy)** → graceful shutdown drains for up to 30s before forced exit.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| **Runtime** | Node 20 | Pinned via `apps/server/.nvmrc` |
| **Language** | TypeScript strict | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM throughout |
| **Backend** | Express 4 | `apps/server`, deploys to Render |
| **Frontend** | Vite + React 19 | `apps/web`, deploys to Vercel |
| **Styling** | Tailwind v4 + shadcn/ui | new-york preset, stone palette, CSS variables |
| **Animation** | Motion (Framer Motion successor) | Spring physics, `useReducedMotion` honored |
| **LLM** | Azure OpenAI GPT-4o | All structured outputs use `response_format: json_schema` strict mode |
| **Scraping** | ScraperAPI structured endpoints | `/structured/amazon/product`, `/review`, `/search` |
| **HTTP client** | axios + p-retry + p-limit | Retry on 429/5xx, concurrency cap |
| **Streaming** | Server-Sent Events | Native `fetch` + custom parser, 15s heartbeat |
| **Validation** | Zod 3 | All env vars, all request bodies, all LLM outputs |
| **Logging** | Pino | Structured JSON, request-id correlation, request lifecycle events |
| **Rate limiting** | express-rate-limit | 10 req/min/IP on POST endpoints |
| **Security** | Helmet + CORS + trust-proxy | Render proxy honored, dev/prod CORS split |
| **Persistence** | localStorage (client) + filesystem cache (server) | No database |
| **Tests** | Vitest | Unit + integration on the server scraper, surfacing, synthesizer |
| **Monorepo** | npm workspaces | Single `package.json` orchestrates `apps/server` + `apps/web` |

---

## Features

### Live persona streaming
All 10 personas fire off in parallel as soon as the brief is built. Each one streams its structured verdict token-by-token. The persona cards animate in (entrance spring, breathing pulse while running, verdict spring on completion) and respect `prefers-reduced-motion`.

### AI Surfacing Audit
5 GPT-generated buyer questions × 2 surfaces = 10 cells in a grid. Each cell shows a traffic-light score (green: position #1, yellow: mentioned but lower, red: not surfaced). Click any cell to see the simulated AI answer, the position the listing landed at, and the question.

### Custom buyer questions
Below the auto-generated grid, type your own buyer question (5-300 chars). Runs that single question through both Rufus and ChatGPT simulators in ~5-10s and appends the result row inside the same grid. Persists with the analysis. Tag in the index column distinguishes auto-generated rows (number) from custom rows (★).

### Synthesis report
Top 3 friction points (severity-ranked, persona-cited), top 3 conversion levers (impact-ranked, paste-ready recommendations), winning competitor (most-cited across `would-buy-competitor` verdicts), revenue-at-risk range with the math enumerated in the reasoning field. The synthesis prompt is hardened to deweight low-confidence verdicts (under 60), avoid same-product competitors, and skip data-pipeline artifacts as friction.

### Generate Fix
Click any conversion lever's **Generate copy** button. Modal opens with three Cards stacked:
- **Bullet rewrites:** 3-5 paste-ready bullets matching the brand voice.
- **A+ Content suggestion:** 80-150 word paragraph drop into the A+ module verbatim.
- **Image brief:** 60-120 word frame-by-frame description (subject, props, lighting, action) of a lifestyle photo to commission.

Each card has a **Copy** button (`navigator.clipboard.writeText` + sonner toast). Generated fixes cache per (analysis, lever) — the second time you open a lever, the modal hydrates instantly from cache with a "Loaded from saved history" banner, plus a **Generate again** button if you want a fresh API call.

### History drawer
Right-side drawer accessible from the header. Lists past analyses (most-recent first, cap 20) with timestamp, ASIN, product name, won't-buy ratio, revenue range, and a fix-count badge. Click any entry to rehydrate the full UI; per-entry delete and clear-all controls. localStorage-backed (no account, single-device) with a 5MB ceiling — each analysis is ~30-50KB, so the cap stays well under.

### Honest revenue estimates
The synthesizer prompt anchors monthly visitor estimates to a review-count tier (under 100 reviews → 500-3K visitors, 50K+ reviews → 150-800K visitors), applies a category-specific conversion baseline (electronics 2-5%, consumables 7-15%, renewed 1-3%, etc.), then a friction-driven conversion drop based on severity + count. The reasoning field always shows the math: "Review count 43,861 places this in the 10K-50K reviews traffic band, est. 50K-200K monthly visitors. Category electronics baseline conversion ~2-5%. With 3 frictions (high/med severity) and 4/10 would-not-buy verdicts, conversion drop estimated at 0.8-2.0 pp..."

---

## The 10 personas

Each persona has its own system prompt (~50-70 lines) with: backstory, shopping heuristics, red flags, voice tics enforced via "you MUST use at least two of these phrases," refusal conditions, an example inner monologue, a banned-words list, and (added in Phase 13.5) a CATEGORY FIT & SCOPE section that triggers low-confidence "outside my expertise" verdicts on out-of-category products instead of manufactured opinions.

| ID | Name | Role | Location | What they always check | What they always reject |
|---|---|---|---|---|---|
| `sarah-skeptical-mom` | Sarah | Skeptical Mom | Dayton OH | 1-star reviews, suspicious 5-star clusters, real customer photos | No price, no brand presence, copy-paste 5-star reviews |
| `robert-budget-senior` | Robert | Budget Senior | Tampa FL | Per-unit cost, 30-day return policy, US warehouse shipping | Random brand names, broken English in listing |
| `maya-fitness-enthusiast` | Maya | Fitness Enthusiast | Austin TX | Third-party certs (USP/NSF), elemental dose, COA availability | "Proprietary blend," fairy-dusted ingredients, blurry supplement facts |
| `david-gift-giver` | David | Gift Giver | Chicago IL | Prime badge, 4+ stars / 1000+ reviews, gift packaging | Renewed/refurb (it's a gift), under $20 (looks cheap) |
| `tasha-deal-hunter` | Tasha | Deal Hunter | Atlanta GA | Price history, Subscribe & Save discount, per-ounce math | Fake "limited time" deals, price-up-then-coupon tricks |
| `jordan-first-time-buyer` | Jordan | First-time Buyer | Boston MA | Every 1-star review, brand Google-ability, reviewer profile patterns | Random brand strings, suspicious review-velocity patterns |
| `patricia-brand-loyalist` | Patricia | Brand Loyalist | Phoenix AZ | Brand recognition (Tide, Crest, Bounty), Made in USA, multi-year track record | "New formula" rebrands, third-party sellers of name brands |
| `aiden-eco-conscious` | Aiden | Eco-Conscious Millennial | Portland OR | B-Corp / FSC / Fair Trade certs, supply chain transparency, recyclable packaging | Greenwashing, plastic-wrapped "sustainable" products |
| `raj-value-engineer` | Raj | Value Engineer | San Jose CA | TCO math, warranty length vs expected lifespan, 2-3 star reviews for nuance | Adjective-only specs, systemic failure modes in reviews |
| `linnea-subscribe-save-optimizer` | Linnea | Subscribe & Save Optimizer | Minneapolis MN | S&S availability, cadence fit, 5-item threshold math, stockout risk | One-time durable goods (out of S&S scope) |

When a persona evaluates a product outside their wheelhouse (Maya on a baby monitor, Linnea on a phone), the CATEGORY FIT prompt triggers a low-confidence (30-50) "would-not-buy" verdict with a friction point that explicitly says the product is outside their scope. The synthesizer then deweights low-confidence verdicts so they don't drive the top 3 friction points.

Persona files: `apps/server/src/personas/{name}.ts`. Each is a single exported `Persona` with `id`, `name`, `age`, `city`, `role`, and a `system` prompt.

---

## API reference

All POST endpoints accept `application/json`, return `application/json` (or `text/event-stream` for the streaming endpoint), and are rate-limited to 10 requests/min per IP via `express-rate-limit`.

### `GET /healthz`
Healthcheck. Used by Render (deploy gates) and UptimeRobot (5-min keep-warm pings).
```json
{ "status": "ok", "uptime": 12345.67 }
```

### `GET /readyz`
Readiness check — confirms env validation passed at boot.
```json
{ "status": "ok", "uptime": 12345.67, "envLoaded": true }
```

### `POST /api/stream-personas`
The main pipeline. Returns an SSE stream that runs scrape → surfacing → personas → synthesis → done. Holds the connection open for 30-90 seconds. Accepts **any product URL** — Amazon TLDs run the full pipeline; other URLs run the generic-scrape variant (no surfacing, banner shown). Validation rejects only URLs that aren't parseable at all.

**Request:**
```json
{ "productUrl": "https://www.amazon.com/dp/B00JEV5UI8" }
```
Also accepted: `amazon.in`, `flipkart.com`, `meesho.com`, `myntra.com`, `nykaa.com`, `ajio.com`, etc.

**Response:** `Content-Type: text/event-stream`. See [Streaming protocol](#streaming-protocol-sse) below for the full event list.

### `POST /api/generate-fix`
Turn one conversion lever into paste-ready Seller Central copy. Single Azure call (~5-10s). Used by the **Generate copy** button on each lever in the synthesis report.

**Request:**
```json
{
  "lever": {
    "recommendation": "Add detailed customer reviews to the listing.",
    "reasoning": "Multiple personas including Jordan and Sarah emphasized..."
  },
  "productContext": {
    "title": "VTech Upgraded Audio Baby Monitor...",
    "brand": "VTech",
    "currentBullets": ["Best-in-class Long Range...", "Privacy Guaranteed..."]
  },
  "personaSignals": [
    "Sarah and Jordan flagged absence of detailed reviews",
    "..."
  ]
}
```

**Response:**
```json
{
  "bullet_rewrites": [
    "1,000-foot long range lets you stay connected from anywhere in your home or yard.",
    "DECT 6.0 technology provides secure, interference-free audio.",
    "..."
  ],
  "a_plus_suggestion": "Discover the VTech Upgraded Audio Baby Monitor, a reliable solution for parents...",
  "image_brief": "A bright, well-lit nursery setting during the day. A mother is holding the parent unit..."
}
```

### `POST /api/surface-question`
Run one custom buyer question through both simulators. Used by the **Test question** button below the surfacing grid.

**Request:**
```json
{
  "productUrl": "https://www.amazon.com/dp/B00JEV5UI8",
  "question": "Is this baby monitor good if my baby's nursery is two floors from the kitchen?"
}
```

**Response:**
```json
{
  "results": [
    {
      "question": "Is this baby monitor good...",
      "surface": "rufus",
      "answer_text": "Looking for a baby monitor that works across two floors? Here's what I found. The *VTech DM221-2 Digital Audio Baby Monitor*...",
      "mentioned_target": true,
      "mentioned_position": 3,
      "score": "yellow",
      "error": null
    },
    {
      "question": "Is this baby monitor good...",
      "surface": "chatgpt",
      "answer_text": "If your baby's nursery is two floors away, range and sound clarity are key...",
      "mentioned_target": true,
      "mentioned_position": 3,
      "score": "yellow",
      "error": null
    }
  ]
}
```

### `GET /metrics` (admin)
Optional. Disabled unless `ADMIN_SECRET` env var is set. Gated by `X-Admin-Secret` header. Returns aggregate demo telemetry (run count, success rate, p50/p95 latency).

### Error responses
All errors return JSON with this shape:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body: productUrl required (string URL)",
    "requestId": "e95be297-8c70-4525-9d6f-03b46085efe5"
  }
}
```

The `requestId` is also returned in the `X-Request-Id` response header on every request. Useful for cross-referencing client-side error toasts with server logs.

---

## Streaming protocol (SSE)

`POST /api/stream-personas` opens an `EventSource`-compatible stream. Each event has a `type` and a JSON `data` payload. Events fire in roughly this order, though personas and surfacing can interleave because they run on independent concurrency lanes.

| Event | When | Payload |
|---|---|---|
| `phase` | Each phase boundary | `{ phase: "scraping" \| "surfacing" \| "personas" \| "synthesis" \| "done" }` |
| `scrape-progress` | During scrape | `{ stage: string, message: string }` (e.g. `"product"`, `"Got: VTech..."`) |
| `product-meta` | After product scrape | Full structured product info: asin, name, brand, price, bullets, rating, totalReviews |
| `surfacing-questions` | After question generator | `{ questions: string[] }` (5 questions) |
| `surfacing-cell-start` | Each cell starts | `{ question: string, surface: "rufus" \| "chatgpt" }` |
| `surfacing-cell-result` | Each cell finishes | Full SurfaceResult: question, surface, answer_text, mentioned_target, mentioned_position, score, error |
| `surfacing-complete` | All cells done | `{ results: SurfaceResult[] }` |
| `persona-token` | Per persona token | `{ personaId: string, token: string }` |
| `persona-complete` | Persona finishes | `{ personaId: string, verdict: PersonaVerdict }` |
| `persona-error` | Persona fails | `{ personaId: string, message: string }` |
| `synthesis-token` | Per synth token | `{ token: string }` |
| `synthesis-complete` | Synth parsed + validated | `{ report: SynthesisReport }` |
| `done` | All phases finished | `{ totalMs: number, totalCostUsd: number }` |
| `error` | Fatal or fallback | `{ message: string, code: string }` (codes: `STREAM_FAILED`, `SYNTHESIS_FAILED`, `NO_VERDICTS`, `RATE_LIMITED`, `VALIDATION_ERROR`, ...) |

A `: ping` heartbeat fires every 15 seconds to keep proxies (Render's frontend, Vercel's edge) from killing idle connections.

The frontend parser is in [`apps/web/src/hooks/usePersonaStream.ts`](apps/web/src/hooks/usePersonaStream.ts) — hand-rolled because we wanted abort support, not native `EventSource` (which doesn't support custom POST bodies cleanly).

---

## State management

Frontend state lives in a single `useReducer` inside `usePersonaStream`. The action union has 22 types covering every SSE event + UI lifecycle action (RESET, START, CANCEL, LOAD_HISTORY, ATTACH_FIX, CUSTOM_SURFACING_*).

The reducer is a pure function — every action returns a new state. Components subscribe via the destructured return:

```ts
const {
  state,                    // full StreamState
  start,                    // (productUrl) => Promise<void>
  cancel,                   // () => void
  reset,                    // () => void
  loadFromHistory,          // (entry) => void  -- hydrates from a saved analysis
  saveFix,                  // (leverIndex, fix) => void  -- persists a generated fix
  runCustomQuestion,        // (question) => Promise<void>  -- runs one custom question
} = usePersonaStream();
```

Persistence to localStorage runs in a `useEffect` keyed on `state` — fires after React commits each dispatched action. Earlier I had this in a `queueMicrotask` inside the SSE handler, which was a bug (microtask runs before the dispatch is committed, so `stateRef.current` was always stale and saves silently failed). Documented in commit `2a8fcb9`.

`saveAnalysis` is an upsert by `analysisId`, so the multiple post-synthesis effect runs (synthesis-complete → phase done → done) are idempotent and the final write captures the real `totalMs` / `totalCostUsd`.

---

## Caching strategy

**Server-side filesystem cache** (`apps/server/src/scraper/cache.ts`):
- Keys: SHA-1 of the full ScraperAPI request URL
- TTL: 7 days
- Storage: `apps/server/.cache/` (gitignored)
- Eviction: lazy on read (TTL check), no background sweeper
- Effect: dev iteration on the same ASIN is free after the first scrape; production cache hits avoid re-billing

**Server-side memoization** (`apps/server/src/surfacing/questions.ts`):
- 5-question generation cached 24h per ASIN in-process Map
- Effect: cancel + retry on the same ASIN within 24h reuses questions; new ASINs always regenerate

**Client-side cache** (`apps/web/src/lib/history.ts`):
- localStorage key: `shadow-shopper:history:v1`
- Cap: 20 entries with FIFO eviction
- Per-entry size: ~30-50KB
- Generated fixes cached per `(analysisId, leverIndex)` inside each entry — re-opening a fix you've already generated costs nothing

---

## Project structure

```
shadow-shopper/
├── README.md                     # this file
├── DECISIONS.md                  # 7 trade-offs with switch criteria
├── EVAL.md                       # honest 3-ASIN performance assessment
├── DEPLOYMENT.md                 # Render + UptimeRobot + Vercel walkthrough
├── docs/
│   ├── architecture.txt          # ASCII architecture diagram
│   └── hero.gif                  # demo screen capture (manual)
├── eval-results/                 # JSON outputs from eval-runner.ts
│   ├── B00JEV5UI8.json           # VTech baby monitor
│   ├── B0863TXGM3.json           # Sony WH-1000XM4
│   ├── B07ZPKBL9V.json           # iPhone 11 Renewed
│   └── B09V3KXJPB.json           # iPad Air M1
├── apps/
│   ├── server/                   # Express + SSE backend
│   │   ├── render.yaml           # Render deploy config
│   │   ├── Procfile              # Render fallback
│   │   ├── .nvmrc                # Node 20
│   │   ├── .env.example          # Azure + ScraperAPI + CORS keys
│   │   ├── src/
│   │   │   ├── index.ts          # Bootstrap + SIGTERM graceful shutdown
│   │   │   ├── app.ts            # Express app: middleware, routes, CORS
│   │   │   ├── env.ts            # Zod-validated env (boot fail-fast)
│   │   │   ├── logger.ts         # Pino structured logger
│   │   │   ├── errors.ts         # AppError, ValidationError, etc.
│   │   │   ├── metrics.ts        # In-memory aggregate telemetry
│   │   │   ├── types/amazon.ts   # AmazonProduct, AmazonReview, AmazonSearchResult
│   │   │   ├── scraper/          # ScraperAPI client + FS cache + URL parsing
│   │   │   ├── llm/              # Azure client, Zod+JSONSchema for verdicts, callPersona, streamPersona
│   │   │   ├── personas/         # 10 persona system prompts + brief builder
│   │   │   ├── sse/              # Writer, handler, types
│   │   │   ├── synthesizer/      # Aggregator prompt + streaming run + generateFix endpoint
│   │   │   ├── surfacing/        # Buyer questions + Rufus + ChatGPT simulators + scoring + custom-question endpoint
│   │   │   └── middleware/       # requestId, asyncHandler, errorHandler
│   │   └── scripts/
│   │       ├── eval-runner.ts    # Direct-call pipeline runner (writes eval-results/)
│   │       ├── test-scrape.ts    # Manual ASIN scrape test
│   │       ├── test-persona.ts   # Single-persona smoke test
│   │       ├── diversity-check.ts# All 10 personas vs banned-words check
│   │       └── smoke-stream.sh   # curl SSE smoke test
│   └── web/                      # Vite + React 19 frontend
│       ├── vercel.json           # Vercel deploy config (security headers)
│       ├── .env.example          # VITE_API_URL
│       ├── components.json       # shadcn/ui config
│       └── src/
│           ├── main.tsx          # entry
│           ├── App.tsx           # composes UrlBar + grids + drawer
│           ├── index.css         # Tailwind v4 + design tokens
│           ├── components/       # UrlBar, PersonaGrid, SurfacingGrid, SynthesisPanel, GenerateFixDialog, HistoryDrawer, AppHeader, ErrorBoundary, ui/ (shadcn primitives)
│           ├── hooks/
│           │   └── usePersonaStream.ts   # useReducer + AbortController + SSE parser + history persistence
│           ├── lib/
│           │   ├── api.ts                # API_BASE_URL from env
│           │   ├── history.ts            # localStorage CRUD with cap + FIFO eviction
│           │   ├── personaMetadata.ts    # display info for each persona (avatar URL, name, role)
│           │   └── utils.ts              # cn() helper
│           └── types/
│               ├── sse.ts                # mirror of server SSE types
│               └── synth.ts              # mirror of GeneratedFix type
└── package.json                  # workspaces orchestrator
```

---

## Local development

```bash
# Clone and install
git clone https://github.com/VedanshGupta750/Shadow_Shopper.git
cd Shadow_Shopper
npm install

# Set up env files
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# Edit apps/server/.env — fill in:
#   AZURE_ENDPOINT       (your Azure OpenAI resource URL)
#   AZURE_API_KEY        (from Azure portal > Keys)
#   AZURE_API_VERSION    (e.g. 2024-12-01-preview)
#   DEPLOYMENT_NAME      (e.g. gpt-4o)
#   SCRAPERAPI_KEY       (from scraperapi.com dashboard)
#   FRONTEND_ORIGIN      (http://localhost:5173 for local)

# Run both apps in parallel
npm run dev
# Server:  http://localhost:8080
# Web:     http://localhost:5173

# Other workflows
npm run typecheck                                 # both workspaces
npm run lint                                      # both workspaces
npm run --workspace apps/server test              # server unit tests
npm run --workspace apps/server test:scrape <ASIN># manual scrape
npm run --workspace apps/server test:persona <ASIN> [personaId]  # single persona
```

The Pino logger formats nicely in dev (color, timestamps, request-id correlation). Production logs are raw JSON for log aggregator ingestion.

---

## Performance characteristics

Measured on the live deploy (Render Free + Azure GPT-4o + ScraperAPI), against the 3 hero ASINs from EVAL.md:

| ASIN | Product | Total time | Persona success | Synth tokens | Cost (Azure billed) |
|---|---|---|---|---|---|
| B00JEV5UI8 | VTech baby monitor | 35s | 10/10 | ~470 | $0 (internship endpoint) |
| B0863TXGM3 | Sony WH-1000XM4 | 31s | 10/10 | ~440 | $0 |
| B07ZPKBL9V | iPhone 11 Renewed | 83s* | 10/10 | ~490 | $0 |

*ASIN 3 hit a fresh competitor scrape (no cache); cached scrapes drop the total to ~50s.

**Render Free RAM usage:** steady-state ~120MB, spikes to ~180MB during persona fan-out. Comfortable inside the 512MB cap.

**SSE throughput:** ~150-300 events per analysis run. Heartbeats: 1 every 15s. Total payload over the wire: ~30-80KB.

---

## Production deployment

### Live URLs
- **Frontend:** https://shadow-shopper.vercel.app
- **Backend:** https://shadow-shopper-api.onrender.com
- **Health:** https://shadow-shopper-api.onrender.com/healthz

### Hosting
- **Vercel Hobby** for the frontend — static SPA at edge, instant deploys on `git push`
- **Render Free** for the backend — Node service, 750 instance-hours/month included
- **UptimeRobot Free** — pings `/healthz` every 5 min to keep Render from sleeping (Render Free naps after 15 min idle, cold-start is 30-60s)

Total fixed monthly cost: **$0**. Per-analysis cost: $0 on the current Azure internship endpoint; would be ~$0.05-$0.15 on a paid Azure or OpenAI direct deploy (rough estimate based on token counts).

### CI / deploys
- **Backend:** push to `main` → Render auto-builds (`npm install && npm run build`) and redeploys.
- **Frontend:** push to `main` → Vercel auto-builds (`npm run build`) and redeploys to edge.
- No GitHub Actions configured — neither service needs them, both watch the `main` branch directly.

Full deployment walkthrough in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Limitations

This is a directional diagnostic, not a measured tool. Documented in detail in [EVAL.md](EVAL.md), but the load-bearing caveats:

- **Surfacing simulators are not real Rufus or ChatGPT.** GPT-4o imitates their published answer styles given a candidate product list. Famous SKUs (Sony WH-1000XM4, iPhone 11) score 9-10/10 green at position 1 in our simulator because the model recognizes the brand, not because it's reasoning about the question. The simulator is honest for niche / unfamiliar products and biased toward category leaders.
- **Revenue estimates are heuristic.** Anchored to listing-specific signals (review count tier, category baseline conversion, friction-driven conversion drop) but not measured against actual conversion data. The math is shown explicitly in the synthesis output's `reasoning` field — it's auditable, just not validated.
- **Persona pool has coverage gaps.** No ESL shopper, no professional buyer, no B2B buyer, no power user. Personas outside their wheelhouse (Maya on a baby monitor) trigger low-confidence "outside my expertise" verdicts that the synthesizer deweights.
- **Pipeline is text-only.** No image analysis, no A+ Content visual eval, no video assessment. The single biggest gap vs. an expert human listing reviewer.
- **Non-Amazon platforms run in degraded mode.** Personas, conversion levers, and Generate-Fix copy are tuned for Amazon Seller Central. The frontend yellow banner says this explicitly when a Flipkart/Meesho/Myntra/etc. URL is loaded. Generic scrape gets you product details only — no reviews, no competitors, no surfacing audit. Output is directional, not authoritative for those platforms.
- **Competitor scrape can be self-referential.** ScraperAPI's search often returns the same product under different sellers/colors/refurb states. The synthesizer prompt has guards against treating same-product different-seller as a category competitor, but the pattern still leaks through occasionally.
- **History is single-device.** localStorage-backed, no account, no sync. Switch browser → empty history.
- **Reviews fetch can 404.** ScraperAPI's `/review` endpoint returns 404 on some listings; we fall back gracefully but the personas see only aggregate ratings, not review text. The brief.ts file has a guard against citing "no reviews" as friction when the listing actually has thousands.

---

## What's next

If this work continues:

1. **Real Rufus integration when Amazon opens API access.** The integration point is one function (`simulateRufus`) — clean adapter swap, no pipeline changes.
2. **Mobile-shopper persona variants.** Same character backstories but evaluating against the mobile Amazon UX (different friction surface from desktop — cropped bullets, image carousel behavior, comparison table truncation).
3. **Auto-iterate loop.** After Generate Fix runs, send the rewritten copy back through the persona pipeline to estimate impact, then propose an A/B test plan.
4. **Bulk mode.** Paste 10 ASINs at once, run the pipeline in batch, output a portfolio-level prioritized recommendation list ranked by total revenue at risk.
5. **Eval harness expansion.** From 3 ASINs to 50+ across categories, with category-specific scoring rubrics and an automated drift detector for persona-prompt regressions.
6. **Image analysis pass.** Add a vision model call to score the hero image quality, A+ Content visual coherence, and mobile-cropped previews. The biggest single feature delta vs. an expert human.

---

## Built by

Vedansh Gupta

Pull requests, issues, and contact welcome via [github.com/VedanshGupta750/Shadow_Shopper](https://github.com/VedanshGupta750/Shadow_Shopper).

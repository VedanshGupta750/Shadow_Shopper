# Shadow Shopper

> **10 synthetic buyer personas walk your Amazon listing and tell you why customers are not buying — ranked by revenue at risk. Each fix comes with paste-ready copy.**

![Hero demo](docs/hero.gif)

**[🚀 Live demo →](https://shadow-shopper.vercel.app)** · [3-min video](VIDEO_URL) · [Decisions](DECISIONS.md) · [Eval](EVAL.md)

## The wedge

Existing tools tell sellers WHAT to write. Shadow Shopper tells them WHY their actual buyers and Amazon's AI are walking past them, ranked by revenue at risk — and generates the rewritten copy on demand.

## What it does

You paste an Amazon product URL. Shadow Shopper:

1. **Scrapes** the listing, 9 competitors, and 100+ reviews via ScraperAPI.
2. **Audits AI surfacing** — simulates Rufus and ChatGPT shopping queries to see if your listing appears when buyers ask in natural language.
3. **Spawns 10 buyer personas** (Skeptical Mom, Deal Hunter, Value Engineer, Eco-Conscious Millennial, Subscribe & Save Optimizer…) who each write an in-character verdict on whether they'd buy.
4. **Synthesizes** all signals into a prioritized fix list with revenue-at-risk estimate.
5. **Generates paste-ready copy** for each fix — bullet rewrites, A+ Content suggestions, image briefs.

Every completed run is auto-saved to a local history drawer (no account needed). Demo runs in ~25-35 seconds (cached) or ~60-90s (cold).

## Architecture

![Architecture](docs/architecture.png)

- **Frontend:** Vite + React 19 + Tailwind v4 + shadcn/ui + Motion → Vercel.
- **Backend:** Node 20 + Express + TypeScript → Render Free + UptimeRobot keep-warm. SSE streaming.
- **Scraping:** ScraperAPI structured Amazon endpoints with filesystem cache (SHA-1 keyed, 7-day TTL).
- **LLM:** Azure OpenAI GPT-4o for personas, synthesizer, surfacing simulators, and fix generation. All structured outputs use `response_format: json_schema` strict mode.
- **Cost per analysis:** $0 (Azure internship endpoint).

## Run locally

```bash
git clone https://github.com/VedanshGupta750/Shadow_Shopper.git && cd Shadow_Shopper
cp apps/server/.env.example apps/server/.env  # add Azure + ScraperAPI keys
cp apps/web/.env.example apps/web/.env       # set VITE_API_URL=http://localhost:8080
npm install
npm run dev
```

## Tech decisions

See [DECISIONS.md](DECISIONS.md) for trade-off analysis on every major choice.

## Evaluation

See [EVAL.md](EVAL.md) for honest performance assessment on 3 real ASINs, including failure cases.

## What's next (week 2 if hired)

- Real Rufus integration when Amazon opens API access (one adapter swap).
- Mobile-shopper persona variants (different friction surface from desktop).
- Auto-iterate: generate fix → estimate impact → propose A/B test.
- Bulk mode: paste 10 ASINs, get prioritized portfolio recommendations.
- Eval harness expanded to 50+ ASINs with category-specific scoring.

## Limitations

This is a directional diagnostic. Surfacing simulators approximate Rufus/ChatGPT published behavior; revenue estimates are heuristic, anchored to listing signals (review count, category, AOV) but not measured. The "Generate Fix" output is a starting point for the seller, not final copy. See [EVAL.md](EVAL.md) for the failure modes I caught and the ones I didn't fix yet.

## Built by

[YOUR NAME] · [YOUR SCHOOL] · [LinkedIn URL]

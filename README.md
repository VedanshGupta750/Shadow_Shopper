# Shadow Shopper

AI agent that audits Amazon listings through 10 synthetic buyer personas. Scrapes the listing (ScraperAPI), runs all 10 personas in parallel via Azure OpenAI GPT-4o, simulates how Rufus + ChatGPT shopping mode would surface it, synthesizes a "why customers don't buy" report with revenue-at-risk estimate, and generates paste-ready Seller-Central copy for each conversion lever.

**Live demo:** _TODO: paste Vercel URL after deploy_

## Stack

- **Runtime:** Node 20, TypeScript strict, ESM
- **Backend:** Express on Render Free (UptimeRobot keep-alive)
- **Frontend:** Vite + React 19 on Vercel
- **LLM:** Azure OpenAI GPT-4o
- **Scraping:** ScraperAPI
- **Streaming:** Server-Sent Events

## Local development

```bash
npm install
npm run dev          # both server (:8081) and web (:5173)
```

Server reads from `apps/server/.env` — see `apps/server/.env.example` for required keys.

## Project layout + conventions

See [`CLAUDE.md`](./CLAUDE.md).

## Deploy

See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Honest evaluation

See [`EVAL.md`](./EVAL.md) — 3-ASIN assessment with brutal-honest "what didn't work" sections.

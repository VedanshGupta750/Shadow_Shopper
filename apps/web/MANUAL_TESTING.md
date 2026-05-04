# Manual Testing - Phase 6 UI

## Prereqs

- `apps/server/.env` with valid `AZURE_API_KEY`, `SCRAPERAPI_KEY`, `FRONTEND_ORIGIN=http://localhost:5173`.
- `apps/web/.env` with `VITE_API_URL=http://localhost:8080` (or the port the server is on).

## Smoke test

1. From repo root: `npm run dev:server` (server on :8080)
2. In another terminal: `npm run dev:web` (Vite on :5173)
3. Open http://localhost:5173. Confirm:
   - 10 persona cards render in 5x2 grid, each showing avatar, name, role, status `PENDING`.
   - URL field pre-filled with `https://www.amazon.com/dp/B09V3KXJPB`.
4. Click `Run 10 personas`. Confirm:
   - Status flips to `scraping` then `personas (X/10 complete)`.
   - Persona cards begin streaming raw JSON tokens.
   - Multiple cards stream concurrently, not one at a time.
   - When a card hits 100% it switches to a green-tinted formatted verdict.
   - After all 10 are done, status reads `done in N.Ns`.
5. DevTools Console: zero errors (only React StrictMode double-render is acceptable).

## Cancel test

1. Click `Run 10 personas`.
2. While at least one card is `STREAMING`, click `Cancel`.
3. Confirm:
   - Streaming cards immediately stop receiving tokens.
   - Their status flips to `ERROR` with `error: cancelled`.
   - Status bar shows `personas (X/10 complete)` and Cancel button hides.
   - DevTools Network tab shows the POST request status `(cancelled)`.

## Failure modes to verify

- Invalid URL (not Amazon): clicking Run shows an error banner.
- Server down: clicking Run shows fetch error in banner.
- Same URL re-run: previous controller aborts cleanly, fresh state appears.

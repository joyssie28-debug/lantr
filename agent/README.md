# Joy's cooking agent

## Saving opportunities

The opportunities job calls the server-only `update_site` tool for each checked
result it keeps. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `agent/.env`
locally and in the Railway agent service in production. Never expose the service
key in browser code. Apply `supabase/migrations/20261013000000_create_opportunities.sql`
before running a search.

New rows have status `new`. URL conflicts are skipped atomically, preserving
existing status and decision time. Every save or duplicate skip prints a JSON
log, and saving is shown in job progress. Save failures produce a warning without
removing the checked result from the job response. Directory leads still require
checking the individual opportunity's dates and eligibility.

This backend powers the meal planner at `/meals`. It produces 21 meals for four people, recipe instructions, preparation notes, and a consolidated shopping list. The household defaults are NZD500 per week and at most 45 minutes of total active cooking per day.

## Railway

The backend is deployed to project `my-agent`, service `agent`, environment `production`. Upload the `agent/` directory as the deployment root. It uses the Dockerfile and Node 24, with no package dependencies.

Required Railway variables:

- `OPENAI_API_KEY`: OpenAI API credential; never add it to source or website code.
- `AGENT_SECRET`: the shared server credential, 12–256 characters. Use the same value in the website server and Railway. Never enter it in the browser.

Optional variables:

- `OPENAI_MODEL`: defaults to `gpt-4.1-mini`.
- `ALLOWED_ORIGINS`: comma-separated allowed website origins. Currently the existing Sites domain.
- `PORT`: Railway container port, currently 8080.

`GET /` says `agent is running`; `GET /health` reports readiness booleans. `POST /api/plan` requires a Bearer agent secret and accepts `{ "pantry": "...", "preferences": "..." }`. Authenticated, validated jobs receive a random UUID, included as `jobId` in responses and `X-Job-ID` in agent responses. A UUID grants no access to results. Logs contain job ID, status, tool name and duration, never credentials or meal inputs.

The two tools generate a structured meal plan through OpenAI and validate its recipes, consolidated shopping list, NZD500 budget and 45-minute daily active cooking limit. The generation schema allocates up to 10 active minutes to breakfast, 10 to lunch and 25 to dinner, and requires exactly seven days. The independent validator still checks the original 45-minute daily limit.

Progress logs distinguish generation, reading the returned JSON, and eligibility checking. Validation failures return a safe `failure` object containing `stage`, `code` and measured `evidence` (for example daily minutes versus the limit); logs include the same object without generated text or credentials. Explicit leftover references to a later weekday are rejected. Successful responses include a `report` with measured checks and explicit model provenance. This agent does not discover or read external recipe sources, verify grocery prices, or evaluate alternative candidates; its report makes those omissions explicit rather than inventing citations or rejected options. Validation does not yet comprehensively reconcile recipe quantities with shopping quantities or audit nutrition and food safety; passing its checks is not a complete recipe audit.

Usage limits are one concurrent request, six requests per rolling hour, twenty per rolling 24 hours, US$1 per job and US$5 per rolling 24 hours. Before each provider call the ledger reserves US$1. Reported token usage settles that reservation; errors or missing usage retain the full reservation. Reservations survive crashes and restarts. This is an application budget for this agent, not an account-wide OpenAI billing cap or a Railway hosting limit. The grocery budget is separate.

Only `gpt-4.1-mini` and `gpt-4.1-mini-2025-04-14` are supported for cost accounting. Standard text rates are US$0.40/million input tokens and US$1.60/million output tokens, verified on 2026-10-11 at https://developers.openai.com/api/docs/models/gpt-4.1-mini. Cached input is conservatively counted at the full rate. Request sizes and 12,000 maximum output tokens bound a supported-model call well below US$1. Update pricing before enabling another model or when provider pricing changes.

The provider call times out after 120 seconds; the agent job and website request have a 150-second deadline. There are no automatic paid retries. Limit state is in `agent/data/usage.json` locally (ignored by Git) and `usage.json` in `RAILWAY_VOLUME_MOUNT_PATH` when deployed. Railway requires a persistent volume and one service replica/process. Corrupt or unwritable tracking blocks new API calls; never delete the ledger to reset limits. Only job IDs, timestamps, statuses, costs and token counts are persisted; generated plans and passwords are not.

## Website server

The website requires a Next.js server (`npm run build`, then `npm start`); static hosting cannot run the private proxy. The browser calls the website's `/api/plan` with the password you enter. That route verifies `SITE_PASSWORD` and forwards the request to Railway using `AGENT_SECRET`. Both credentials stay out of the client bundle.

Set these in root `.env.local` locally, or on the website's hosting service:

- `SITE_PASSWORD`: your chosen private password, 12–256 characters.
- `AGENT_SECRET`: the generated shared secret, matching Railway.
- `AGENT_URL`: `http://localhost:8080` locally; `https://agent-production-42b8.up.railway.app` for the hosted website.

This password protects meal generation; the homepage and starter meal plan remain public. Password failures are limited to ten attempts per IP in ten minutes per website server process. Use a trusted reverse proxy that supplies the client IP in production.

The API validates seven days, all three meals, recipe details, time limits, unique shopping items, and the estimated budget before returning a plan. Grocery prices are model estimates, not live quotes. Generated plans and shopping checks are saved locally in the user's browser, not in Railway. AI API usage requires OpenAI billing credit separately from any ChatGPT subscription.

## Opportunities

`POST /api/opportunities/jobs` with the server's Bearer `AGENT_SECRET` accepts `{"kind":"all"}` (also `jobs` or `grants`) and immediately returns HTTP 202 with a job ID. Authenticated `GET /api/opportunities/jobs/:id` returns progress, excerpts, results and exclusion reasons. `DELETE` cancels the job and aborts source requests. Searches run in the agent process, not inside a long-lived website request. Restarting the agent loses these jobs.

The website's `/api/opportunities` checks `SITE_PASSWORD` and sets a signed, HttpOnly, SameSite job cookie. `/api/opportunities/:id` polls or cancels only the job bound to that cookie. Agent credentials and URL stay on the server. Requests to the agent have an eight-second timeout; no website route waits for the search to finish.

The search uses Bing RSS discovery followed by bounded HTTPS reads from supported Christchurch/New Zealand source domains. It does not call the paid meal-generation API. Results are leads, not a claim that the user qualifies: sources are checked for local relevance, opportunity text and explicit expired dates when present. Pages requiring a browser, inaccessible sources and unsupported domains are reported as ruled out. Excerpts are limited to 25 words per page. No arbitrary URL from the browser is fetched.

Jobs live only in memory and expire an hour after completion; the page does not use localStorage or a database. Each agent process allows one opportunities search at a time, six starts per hour and twenty per day; these counters also reset on restart. A job has a two-minute deadline. For local testing, set `AGENT_URL=http://127.0.0.1:8080` in the website process environment, without editing the saved hosting variables. Reload the agent after changing its code. Production needs the updated agent code deployed separately.

Run `node --test agent/server.test.mjs agent/proxy.test.mjs agent/opportunities.test.mjs` from the repository root to check both features using fake providers.

## Local verification

From the repository root run `node --test agent/server.test.mjs agent/proxy.test.mjs agent/opportunities.test.mjs`. Tests use fake providers and never need a real API key. From `agent/`, `npm start` loads `agent/.env` and starts the server; meal generation stays disabled until both required variables are configured.

Run `npm run check-config` from `agent/` to check local credential completeness, matching shared secrets and model access using a free authenticated model lookup. Output is booleans and HTTP status only. This checks authentication/model access, not billing credit or permission to generate responses. Use `http://localhost:8080/health` for readiness and `http://localhost:8080/` for the running message.

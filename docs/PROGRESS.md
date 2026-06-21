# x-poster — Progress / Handoff

_Last updated: 2026-06-22_

X-post drafting agent (eve framework + Next.js). Pick a category → it researches a timely
angle → returns ready-to-paste drafts optimized for the X "For You" ranker.

## Current state

- **Branch:** `master` · **HEAD:** `a1e5bef` (three post formats + research URL fix)
- **Working tree:** clean (all committed)
- **Local checks:** `npm run typecheck` → 0 errors · `npm test` → 11/11 pass
- **Dev server:** `npm run dev` → http://localhost:3000 (works end-to-end)
- **Vercel link:** correct project `prj_I9pyRrUrA85huPzMqTlTCnaXM8Bm` (team `soumyaranjanteam2000`); live URL `x-poster-ten.vercel.app`

## Done this session

- **Agent**: `compose_drafts` tool (structured drafts) · `agent/agent.ts` model `openai("gpt-5.4")`
- **Three formats per topic** — one **short** (≤280), one **long-form** (~600–1500), one **thread** (3–6 tweets). Schema/validation in `agent/lib/drafts.ts`.
- **Deep research** + only-fetch-real-URLs (no guessed-URL 404s) + verify facts; instructions in `agent/instructions.md`.
- **Playbook** grounded in `xai-org/x-algorithm` (`agent/skills/x_algorithm_playbook.md`).
- **12 categories** (tech + non-tech) + **Trending now** (searches live X trends).
- **UI**: app shell with collapsible **sidebar**, X-style **post cards** (avatar/handle, @/#/link tinting, char ring, Copy + Post on X), animated (motion), Sources/Reasoning/Task/Context-meter/Suggestions, activity shimmer ("Thinking…/Researching…"), read-only model label.
- Quality bar: 180–270 char target, specific + hook + human voice, banned formulaic phrasing.

## ⏳ OPEN ITEM — production 500 (Vercel only; code is fine)

`POST /eve/v1/session` on prod returns 500 `Channel handler failed`. **Root cause is NOT the
app code and NOT the OpenAI key.** eve runs each turn as a **Vercel Workflow**; the runtime
call `GET api.vercel.com/v1/workflow/resolve-latest-deployment/…` returns **403 Forbidden** —
the project's **Vercel Workflow / OIDC isn't provisioned** (broke when the project was
deleted & re-created).

Already done from here: re-linked to the right project, removed a stale manual
`VERCEL_OIDC_TOKEN` that was making it worse, redeployed. Still 403 with Vercel's own
auto-injected token → confirms it's project provisioning.

**Fix (needs Vercel dashboard — pick one):**
1. **Recommended:** Delete the Vercel project → re-import GitHub repo `soummyaanon/x-poster`
   fresh (re-provisions Workflow + OIDC). Re-add `OPENAI_API_KEY` after.
2. Create a team-scoped Vercel **Access Token** → set as **`VERCEL_TOKEN`** in Production env
   → redeploy (eve prefers `VERCEL_TOKEN` over OIDC).

After either, ping Claude to re-hit the endpoint + read runtime logs to confirm it's green.

## Reminders

- **Rotate the `OPENAI_API_KEY`** — it was pasted in plaintext several times this session.
- `.env` / `.env.local` are gitignored (never deployed) — prod env vars live in Vercel project settings.

## Verify locally
```bash
npm run typecheck && npm test
npm run dev    # http://localhost:3000 — pick a category or "Trending now"
```

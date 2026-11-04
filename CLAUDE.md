# StatElite

A phone web app a parent uses on the sideline to record one child's games (basketball, softball, baseball), then share and learn from them. The v1 product is in `docs/plan.md`; it is a public product for a handful of families, with no payments.

## Status

M1 in progress. The app is scaffolded on React + TypeScript + Vite, vite-plugin-pwa 2 (Workbox 7) and Dexie 4; supabase-js is in: it signs the Recorder in and uploads the outbox (`docs/plan.md:79`).

`npm test` runs everything: typecheck, Vitest (App Core tests and the schema self-check on PGlite), then Playwright at 390×844. GitHub Actions runs it on every pull request into `integration`. In a fleet worktree, run `npm run typecheck` and `npx vitest run` instead and leave Playwright to CI: outside CI it reuses any server already on port 4173, so concurrent ICs would test each other's builds. Netlify deploys `integration` to https://stat-elite.netlify.app; `BASE_URL=https://stat-elite.netlify.app npx playwright test e2e/install.spec.ts e2e/offline.spec.ts` checks the deployed app.

## Where things live

- `GLOSSARY.md`: the domain terms. This repo has no CONTEXT.md; the glossary is GLOSSARY.md.
- `src/core/supabaseDouble.ts`: the test double of the Supabase client, over PGlite and the real schema (`docs/schema.sql`). `src/core/server.contract.test.ts` runs one contract suite on it and on the stand-in; `src/core/appCore.supabase.test.ts` drives App Core through it.
- `docs/adr/`: the accepted decisions (0001 to 0008 so far).
- `docs/plan.md`: v1 screens, interaction rules, stats, milestones and what is cut.
- `docs/schema.sql` and `docs/schema.test.sql`: the planned Supabase schema and its SQL self-check (`docs/schema.test.ts` runs it).
- `src/core/`: App Core, the headless commands and read models every screen uses, and its tests. `src/screenSeam.tsx`: the one module a screen reaches App Core through (`useLive` for the live read models, `useCommand` for commands); a screen reaches App Core only through it. `src/App.tsx`: the screens. `e2e/`: Playwright smoke tests. `e2e/openApp.ts` opens the app; `e2e/recorder.ts` holds the Recorder's common flows (add an Athlete, start and end a Game, record a whole Game, open a summary, tap the court) that the specs call to get ready.
- `src/core/phoneAccount.ts`: the phone's sign-in, read as `phoneAccount()` (signed out, first download, signed in, or session ended): the Remembered Account, the ended-Session flag and the download markers. App Core reaches them only through this module.
- `src/core/server.ts`: the server App Core syncs with: Supabase in a deployed build, an in-memory stand-in on localhost.
- `supabase/migrations/`: the Supabase migration files; the first, `20261031000000_init.sql`, creates the schema.
- `docs/agents/`: how the agent skills use the issue tracker, the triage labels and the domain docs, and the brief-writing rules in `agent-briefs.md`.

## Rules

- Use the terms in `GLOSSARY.md` (Athlete, Recorder, Game, Event, Shift, Plus/Minus). Don't drift to the words its _Avoid_ lines list.
- ADRs are accepted decisions. If your work contradicts one, say so and stop; don't override it silently.
- Fleet work happens on `fleet/*` branches that merge into `integration`, the default branch. `main` is the release branch, and promotion to it is a human step.

## Agent skills

### Issue tracker

GitHub Issues on `andydarknessb/stat-elite`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name, plus the fleet's `triage-proposed` label. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

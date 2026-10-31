# StatElite

A phone web app a parent uses on the sideline to record one child's games (basketball, softball, baseball), then share and learn from them. The v1 product is in `docs/plan.md`; it is a public product for a handful of families, with no payments.

## Status

M1 in progress. The app is scaffolded on React + TypeScript + Vite, vite-plugin-pwa 2 (Workbox 7) and Dexie 4; supabase-js arrives with sign-in (`docs/plan.md:79`).

`npm test` runs everything: typecheck, Vitest (App Core tests and the schema self-check on PGlite), then Playwright at 390×844. GitHub Actions runs it on every pull request into `integration`. Netlify deploys `integration` to https://stat-elite.netlify.app; `BASE_URL=https://stat-elite.netlify.app npx playwright test e2e/install.spec.ts e2e/offline.spec.ts` checks the deployed app.

## Where things live

- `GLOSSARY.md`: the domain terms. This repo has no CONTEXT.md; the glossary is GLOSSARY.md.
- `docs/adr/`: the accepted decisions (0001 to 0004 so far).
- `docs/plan.md`: v1 screens, interaction rules, stats, milestones and what is cut.
- `docs/schema.sql` and `docs/schema.test.sql`: the planned Supabase schema and its SQL self-check (`docs/schema.test.ts` runs it).
- `src/core/`: App Core, the headless commands and read models every screen uses, and its tests. `src/App.tsx`: the screens. `e2e/`: Playwright smoke tests.
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

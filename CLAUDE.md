# StatElite

A phone web app a parent uses on the sideline to record one child's games (basketball, softball, baseball), then share and learn from them. The v1 product is in `docs/plan.md`; it is a public product for a handful of families, with no payments.

## Status

Planning only. No app code exists yet. The first ticket scaffolds the app. The planned stack is React + TypeScript + Vite, vite-plugin-pwa 2 (Workbox 7), Dexie 4 on the phone, and supabase-js (`docs/plan.md:79`).

## Where things live

- `GLOSSARY.md`: the domain terms. This repo has no CONTEXT.md; the glossary is GLOSSARY.md.
- `docs/adr/`: the accepted decisions (0001 to 0004 so far).
- `docs/plan.md`: v1 screens, interaction rules, stats, milestones and what is cut.
- `docs/schema.sql` and `docs/schema.test.sql`: the planned Supabase schema and its SQL self-check.
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

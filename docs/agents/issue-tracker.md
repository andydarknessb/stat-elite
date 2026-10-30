# Issue tracker: GitHub

Issues and specs for StatElite live as GitHub issues in `andydarknessb/stat-elite`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Ticket template

A ticket cut from a spec carries these sections, in this order.

```markdown
## Parent

Spec #<n>. Cut against integration <sha> on <date>.

## What to build

<the result, end to end>

## Acceptance criteria

- [ ] <a result the actor can observe>

## Blocked by

- #<n>, or "None. Can start immediately."
```

## Bug reports

A bug filed with `gh issue create` carries these headings, in this order. The last one is **Escaped from PR #**, the number of the pull request that introduced the bug:

```markdown
### What happened
...
### Expected
...
### Steps
...
### Escaped from PR #
<the PR number>
```

Write `_No response_` under the last heading when you do not know the PR. The fleet's weekly scorecard reads that heading to count escaped defects, and counts a week's bugs without a number there as unclassified.

## Triage proposals and approval

The fleet's Principal (fleet ADR 0011) reads every open issue that is unrouted or carries `needs-triage` or `question` and posts one `## Triage proposal (advisory)` comment on it, applying the `triage-proposed` label. The proposal is not a ruling and no agent acts on it until the fleet's Arbiter (session `ar-<tenant>`, fleet ADR 0017) or the owner rules. A proposal's `Open:` field is a question the Principal could not answer; the Arbiter answers it or escalates.

The Arbiter reads each proposal and posts one `## Verdict` comment, opening with one of:

- `Endorsed`: adopt as written.
- `Endorsed with: <edits or answer>`: adopt with the edits folded in, or the `Open:` question answered.
- `Returned`: numbered reasons; the Principal re-proposes once.
- `Escalated: <class> - <question>`: the one shape that reaches the owner. Classes: product-intent, money, user-promise, rule-change, disagreement.

An Endorsement is a Ruling the moment it is posted: the fleet then posts `## Ruling`, applies `ready-for-agent`, `ready-for-human` or `needs-info` as ruled, and removes `triage-proposed`.

The owner can still rule first, and wins when first, with a comment that begins `Approved` (adopt as written), `Approved with: <edits>`, `Re-propose` or `Veto`. Those four stay the owner's alone. Closing an issue and the `wontfix` and `duplicate` labels also remain the owner's hands in every case.

Because the fleet's sessions act under the owner's own GitHub login, a fleet hook enforces both halves: no fleet session in any role may post a comment whose body begins with `Approved`, and no session but the Arbiter may post one beginning `Endorsed`, `Returned`, `Escalated:` or `## Verdict`. Agents that agree with a proposal say so in other words. Any other reply from the owner is a conversation, not a re-proposal; a proposal is re-issued only when the issue body changes afterwards or the owner asks for one in a comment.

## Closing issues from pull requests

Pull requests here merge into `integration`, which is the default branch, so a closing keyword in a PR body (`Closes #N`, `Fixes #N`) closes the issue when the PR merges. Use `Refs #N` or `Part of #N` when the PR does not finish the issue. Promotion to `main`, the release branch, is a separate, human step.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

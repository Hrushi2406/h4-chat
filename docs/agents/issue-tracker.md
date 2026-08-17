# Issue tracker: GitHub Issues

Issues and specs for this repo live in GitHub Issues under `Hrushi2406/h4-chat`.

Use the connected GitHub app for issue reads and writes when available. Use `gh issue` only when
the connector does not cover the required operation.

## Conventions

- One parent GitHub issue holds the confirmed feature spec.
- Create one child GitHub issue per independently implementable ticket; do not combine all implementation work into one issue.
- Link child issues from the parent with a GitHub task list and include `Parent: #<number>` in each child body.
- Apply exactly one canonical triage label from `triage-labels.md` to each issue.
- Put discussion and new evidence in GitHub issue comments rather than editing conversation history into the issue body.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `Hrushi2406/h4-chat` and return its number and URL.

## When a skill says "fetch the relevant ticket"

Read the referenced GitHub issue. The user will normally pass its number or URL directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent GitHub issue with one linked child issue per ticket.

- **Map**: parent issue containing Notes, Decisions so far, Fog, and a task list of child issues.
- **Child ticket**: one GitHub issue with its type (`research`, `prototype`, `grilling`, or `task`) in the body and a canonical triage label.
- **Blocking**: record `Blocked by: #NN, #NN` near the top. A ticket is unblocked when every listed issue is closed.
- **Frontier**: scan open child issues for tickets with no unresolved blockers and a ready label; lowest issue number wins.
- **Claim**: assign the issue to the worker and comment that work has started.
- **Resolve**: post the answer or implementation evidence as a comment, close the child issue, and check it off in the parent issue.

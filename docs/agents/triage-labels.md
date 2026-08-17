# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the
actual GitHub labels used in this repo's issue tracker.

| Label in mattpocock/skills | String in our tracker | Meaning                                  |
| -------------------------- | --------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`        | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`          | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`     | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`     | Requires human implementation            |
| `wontfix`                  | `wontfix`             | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), apply the corresponding
GitHub label. Keep exactly one canonical triage-role label on an issue at a time; ordinary labels
such as `bug`, `enhancement`, or `documentation` may be added alongside it.

Edit the right-hand column to match whatever vocabulary you actually use.

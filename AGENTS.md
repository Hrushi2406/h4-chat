# h4-chat

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `Hrushi2406/h4-chat`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles are GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Deployment

Production is a self-hosted box running PM2 behind a Cloudflare tunnel, not Vercel. Ship with
`git pull && ./deploy.sh` on that box; never run `pnpm build` there by hand. See
`docs/agents/deploy.md`.

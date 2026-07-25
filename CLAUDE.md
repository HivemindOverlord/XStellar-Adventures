## Pull request workflow

Any Claude Code session working in this repo should merge its own pull requests
automatically, without waiting for a human to click merge, subject to the checks
below.

1. After pushing a branch and opening a PR against `main`, call
   `enable_pr_auto_merge` on it right away (squash). This is a no-op safety net for
   whenever branch protection with required checks gets configured on `main` — see
   the caveat below.
2. Wait for the `build` check (from `.github/workflows/ci.yml` — runs `npm ci` and
   `npm run build` across the `shared`/`server`/`client` workspaces) to finish.
   - If it succeeds, merge the PR (squash) yourself. Do not wait for further
     approval.
   - If it fails, treat it like any other CI failure on a PR you own: diagnose and
     fix, push again, and re-check — do not merge a red `build`.
3. The `Vercel` and `Prisma Compute Deploy` checks are external preview-deployment
   integrations, not this repo's source of truth for code correctness. Treat them
   as informational only — do not block a merge on them, and do not chase their
   failures unless the user explicitly asks you to.
4. Dependabot PRs: prefer the PR that bumps a dependency furthest (e.g. one that
   also pulls in a related security fix) when two open PRs touch the same
   dependency and would conflict; merge that one and close the other with a
   one-line comment explaining it's superseded, rather than force-resolving a
   lockfile conflict.

Caveat: as of this writing, `main` has no branch-protection rule requiring `build`
(or anything else) to pass before a merge is allowed — merges go through even with
a red check. Step 2 above is the actual enforcement mechanism until someone with
repo admin access adds a required-status-check rule for `build` in Settings →
Branches; no tool available to these sessions can configure that.

## Summary

<!-- What does this PR do, and why? -->

## Changes

<!-- Bullet list of concrete changes -->

-

## How I verified this

<!-- Real evidence, not "should work" — what did you actually run, and what did it actually output? -->

## Deployment impact

Merging to `main` auto-deploys the server to Railway and the client to Vercel immediately — there is no staging step. Check what applies:

- [ ] Touches `shared/`, `server/`, or their build config — verified with `npm run build:server` (root script), **not** `npm run build --workspace=@xstellar/server` alone. The latter skips building `shared` first and will pass locally in some cached states while still failing in a clean Railway build — this exact gap has taken production down before.
- [ ] Changes `server/prisma/schema.prisma` — a migration is included in `server/prisma/migrations/` and was applied against a real Postgres instance, not just written by hand.
- [ ] Changes Railway/Vercel service config (build command, watch patterns, env vars) — confirmed the change was made in the platform dashboard too, not just documented here.
- [ ] Safe to deploy on merge with no special steps.
- [ ] N/A — docs/tooling only, no runtime impact.

## Screenshots / logs

<!-- For UI changes or bug fixes: before/after. For backend changes: relevant log output showing the fix working. Optional if not applicable. -->

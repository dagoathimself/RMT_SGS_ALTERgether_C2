# Baseline: administrator-controlled portal (comparison only)

A deliberately conventional design, used only for comparison. It is
**isolated**: a CLI script with no network port, no TideCloak, and no import from or into `src/`.
It is never a fallback access path for the protected app.

Design (typical "encrypted at rest" portal):
- contributions encrypted at rest with ONE server-held key (`baseline/.server-key`, generated per run, deleted after)
- a `permissions` table `{contributionId, researcher}` that the app checks before decrypting server-side
- one `admin` role that can edit the permissions table directly, with no second approval

Run: `npm run baseline` → writes `evidence/baseline-results.md`.

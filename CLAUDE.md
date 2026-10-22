# ALTERGETHER — project instructions

Prototype for Tide UNLOCKED (RMIT Hackathon 2026, Challenge 2). Synthetic data only. Not production.

## Guidance
- Official Tide docs + Tide MCP (`https://mcp.tide.org/mcp`, read-only). Sources, access dates and
  versions: `docs/SOURCES.md`. Never invent SDK methods; check
  `node_modules/@tidecloak/js/dist/types/IAMService.d.ts`.
- Design and known gaps: `docs/SECURITY_MODEL.md`. Observed results only: `docs/VERIFICATION.md`.

## Security invariants (completion conditions, not nice-to-haves)
1. The server never receives contribution plaintext. Encrypt in the browser before upload.
2. Live decryption needs the caller's own Tide identity AND an owner-approved recipient key wrap.
   A DB row, role, or UI check alone must never yield plaintext. Authorised readers can retain or
   re-share keys/plaintext outside this portal; do not claim cryptographic prevention of that.
3. Admin roles / quorum approvals never substitute for owner consent.
4. Every protected API route: verify JWT signature, issuer, audience (`aud` contains the client),
   `azp`, expiry, AND the DPoP proof; derive the actor from `sub`, never from the request body.
5. A key wrap is only made to a public key whose fingerprint the owner confirmed out-of-band; the
   researcher's fingerprint is derived in their own browser, never taken from the server.
6. Withdrawal is shown as pending until the stored contribution has been re-keyed and the
   recipient's wrap deleted; then verified by a fresh denial probe.
7. No universal decryption key, impersonation shortcut, or privileged fallback. The baseline
   (`baseline/`) is isolated, never imported by `src/`, and never a fallback path.
8. No tokens, credentials, plaintext or invite links in logs, error bodies, browser storage,
   committed files. `.env`, `data/store/`, `data/*.local.*` are gitignored.
9. Render contribution text as React text nodes only (no `dangerouslySetInnerHTML`).
10. Do not disable a security control to fix an integration problem.

## Commands
```bash
npm run init        # bootstrap local TideCloak (Docker) + realm; needs .env (see .env.example)
npm run dev         # app on http://localhost:3000 (loopback only)
npm run typecheck   # tsc --noEmit
npm test            # actual crypto/verifier/routes with an ephemeral local test realm (not Tide)
npm run build       # production build
npm run test:http   # start production server, smoke checks + fail-closed HTTP checks
npm run test:api    # server-side negative tests (no token, bad token, forged tokens, size/rate limits)
npm run baseline    # admin-controlled baseline comparison (isolated)
npm run reset       # empty the operational store + evidence log
```
Human-only steps: live Tide account enrolment of participant / researcher_a / researcher_b (invite
links in `data/invites.local.txt`, opened in a regular browser). The supplied video is an automated,
clearly labelled synthetic simulation, not a live Tide session. Governance-admin enrolment is out of
scope; do not claim multi-admin quorum results. `/demo` is isolated and never authenticates to live APIs.

## Do not
- Publish the repo, deploy publicly, or submit the Google Form without explicit user instruction.
- Add ML, AI detectors, real personal data, or bulk exports.

# Historical team-reported verification — original upload

These are claims preserved from the original commit for provenance. They do not verify the repaired code. The authoritative current record is [VERIFICATION.md](VERIFICATION.md). No live Tide results from this document were reproduced during the repair.

# Verification record

Status values: **PASS** (observed), **FAIL** (observed), **NOT TESTED**, **DE-SCOPED**.
Only results that were actually run and observed are marked PASS. Last updated 2026-10-22 (ICT).

## Environment
macOS 15.7.3 (arm64), Docker 28.1.1, Node 24.3.0, `tideorg/tidecloak-dev:latest` (image created
2026-10-19), `@tidecloak/nextjs` 0.14.40. TideCloak and the app on loopback over HTTP (development only).

## What could and could not be tested

The three demo identities (`participant`, `researcher_a`, `researcher_b`) were created in the realm, but
**no Tide account could be enrolled** for them during this session (E15). Every check that needs a signed-in Tide
session (real encryption, sharing, decryption, withdrawal) is therefore **NOT TESTED**. The browser checks
for these exist in the app (`/researcher` → Security tests, `/checks`) and can be run once accounts exist.
Governance-admin enrolment was de-scoped by the team, so no multi-admin quorum result is claimed.

## Results

| ID | Check | Result | Evidence |
|---|---|---|---|
| E1 | App redirects to the real Tide sign-in (TideCloak → Tide ORK enclave, with DPoP thumbprint and signed client origin) | PASS | observed in browser: `Sign in with TideCloak` → `ork1.tideprotocol.com` sign-in form |
| E2 | Realm created and licensed; QEA (IGA) enabled; Tide IdP settings signed | PASS | `scripts/init-tidecloak.sh` + `scripts/finish-setup.sh` output; `sign-idp-settings` HTTP 200 |
| E3 | Governed writes become change requests even for the master admin (user create/delete → HTTP 202 PENDING) | PASS | bootstrap logs (bootstrap/firstAdmin mode, so the same operator could then approve them) |
| E4 | Server rejects: no token, garbage token, forged EdDSA token with correct claims, forged token with a matching attacker DPoP proof, `alg:none` | PASS (5/5) | `evidence/api-negative-tests.md` |
| E5 | State-changing requests from a foreign or missing Origin rejected (CSRF defence) | PASS (2/2) | `evidence/api-negative-tests.md` |
| E6 | Request-size limit (70 KB → 413) and rate limit (400-request burst → 429s) enforced before auth | PASS (2/2) | `evidence/api-negative-tests.md` |
| E7 | Protected responses `Cache-Control: no-store`; error bodies do not echo tokens | PASS (2/2) | `evidence/api-negative-tests.md` |
| E8 | Expired **realm-signed** token rejected | NOT TESTED | the API test's expired token is attacker-signed, so it fails on signature first |
| E9 | Copied realm token replayed as Bearer / replayed DPoP proof / proof for another URL rejected | NOT TESTED | in-app `/checks` → "Run session checks" (needs a signed-in account) |
| E10 | Files that would be committed contain no admin password, user email, JWT, invite link or private key | PASS | dry-run `git add -n .` + content scan |
| E11 | Production dependencies: known vulnerabilities | PASS (0 found) | `npm audit --omit=dev` |
| E12 | Typecheck (strict unused checks) and production build | PASS | `tsc --noEmit --noUnusedLocals --noUnusedParameters`, `npm run build` |
| E13 | Live dependency check calls the TideCloak realm (OIDC discovery, issuer must match the verifier's issuer) and the Tide home ORK | PASS | `GET /api/status` → TideCloak online 12 ms, Tide network online ~540-730 ms; shown on the landing page |
| E14 | TideCloak stopped: status reports `unreachable`, protected API still refuses (401); restarted: back online | PASS | `docker stop tidecloak` → `/api/status` + `/api/contributions`; `docker start tidecloak` |
| E15 | Tide account enrolment through the invite link | FAIL (environment; retry in a regular browser) | Tide enclave showed "Error creating user account. Network request failed". In the built-in browser the enclave's requests from `ork1.tideprotocol.com` to `localhost:8080` were `ERR_BLOCKED_BY_CLIENT` (browser local-network blocking). Server-side, TideCloak and the home ORK answered 200 at the same time. Not resolved before submission |

### Scenario checks (same scenarios as the baseline)

| Test | Result | Note |
|---|---|---|
| S1 owner-approved grant lets A decrypt | NOT TESTED | needs enrolled Tide accounts |
| S2 B denied; changed id; ciphertext handed to B | NOT TESTED | in-app "Security tests" ready (`ENABLE_ATTACK_SIMULATION=1` on the dev server) |
| S3 withdrawal blocks existing and new sessions | NOT TESTED | |
| S4 one admin cannot create effective access | DE-SCOPED / NOT TESTED | no governance admins enrolled; realm is in bootstrap mode |
| S5 distinct approvals, duplicate does not count | DE-SCOPED | |
| S6 master/bootstrap paths | NOT TESTED | known: in bootstrap mode the operator alone can change roles (see SECURITY_MODEL §5) |
| S7 dependency failure / invalid session returns no content | PASS (server side) | invalid sessions (E4); TideCloak outage reported and protected API refused (E14). Browser-side Tide outage during decrypt: NOT TESTED |
| S8 no plaintext/credentials in storage, logs, entry files | PARTIAL | entry files: PASS (E10); operational store with real contributions: NOT TESTED |
| S9 governed change cannot substitute owner consent | NOT TESTED | |
| S10 server-substituted researcher key is refused before sharing | NOT TESTED | edit the researcher's `publicJwk` in `data/store/db.json`, then share: expected "fingerprint does not match", no grant; the researcher's **Show my fingerprint** shows "DIFFERENT" |

### Baseline comparison
`npm run baseline` → `evidence/baseline-results.md`: the administrator-controlled baseline fails 5 of 10
checks (S2c, S4, S5, S6, S9). This describes the baseline only; it is not a score for the protected app.


## Changes since the last run (2026-10-22, afternoon)
`npm run test:api` re-run on the changed code: 14/14 as expected (`evidence/api-negative-tests.md`). The 400-request
burst added no rows to the activity log (946 before and after), confirming anonymous failures are no longer logged.
E13/E14 were not re-run.
- Sharing and re-wrapping now require an out-of-band fingerprint confirmation (S10).
- Pending grants can be cancelled (previously a half-finished share blocked that researcher).
- Activity log: anonymous failures are no longer written; client-reported rows can only reference a
  contribution the caller owns or was granted.
- Rate limit no longer keys on the client-controlled `X-Real-IP` header.
- Role checks count realm roles and this app's client roles only.
- Preview (simulated) mode removed.

## Known gaps (see SECURITY_MODEL §7)
- Researcher public keys come from the app server; the out-of-band fingerprint check is the defence.
- Withdrawal is enforced by the app server; a malicious operator could restore an old wrap.
- Realm left in bootstrap mode: no multi-admin threshold, so a lone operator can change roles.

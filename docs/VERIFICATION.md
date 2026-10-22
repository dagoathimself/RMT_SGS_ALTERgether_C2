# Current verification — repaired prototype

Observed 2026-10-22. Environment: Linux, Node 24.19.0, npm 11.9.0, Next.js 16.4.2, committed lockfile. Synthetic data only. Historical macOS/Docker claims from the original upload are preserved separately in LEGACY_VERIFICATION.md and are not current evidence.

| Check | Observed result | Scope |
|---|---|---|
| Strict TypeScript | PASS | `npm run typecheck` |
| Production build without a generated Tide adapter | PASS | `npm run build`; includes participant, researcher, checks, demo and all implemented API routes |
| Automated crypto/verifier/route tests | PASS: 29/29 | `npm test`; actual production modules; ephemeral locally signed test realm, not live Tide |
| Production HTTP checks | PASS: five pages return 200; 14/14 negative checks | `npm run test:http`; missing adapter, so this run establishes fail-closed HTTP behaviour |
| Browser workflow | PASS | Real Chromium on production `/demo`; synthetic identity seals and portal decisions; `evidence/browser-checks.md` |
| Vietnamese original text and HTML fixture | PASS | Diacritics preserved; decrypted markup appears as inert text; no dialogs or page errors |
| Mobile view | PASS | 390px viewport, no horizontal overflow |
| Simulation isolation | PASS | No protected API requests from `/demo`; absent live configuration gives setup guidance |
| Two-minute MP4 | PASS | Actual browser-state walkthrough with captions; H.264 1280×800, about 1 MB; identity and governance explicitly simulated |
| Constructed baseline | Reproduced: five failures out of ten checks | Applies to this deliberately operator-controlled baseline only |
| Production dependency audit | Zero known vulnerabilities reported | `npm audit --omit=dev`; not proof of complete dependency security |
| Live Tide enrolment, identity-bound seal/open and full workflow | NOT TESTED | Requires enrolled accounts and reachable local realm/network |
| Multiple independent administrator approvals | NOT IMPLEMENTED / NOT TESTED | Scripts retain single-operator bootstrap; no operational quorum claim |

## What the automated tests establish

Eight crypto/simulation tests check Unicode, wrong-recipient rejection, every grant-binding field, authenticated body context, payload digest validation, locally derived fingerprints, re-keying and the isolated simulation workflow.

Seven DPoP tests check valid single use; future-dated proof reuse after 301 seconds and at the last accepted timestamp; expired/future timestamps; missing/bare Bearer/unbound tokens; URL, method, token hash and key mismatches; private/symmetric JWK rejection; identifier bounds; and ignored untrusted forwarding headers. The replay regression fails under the old first-use-plus-300-seconds expiry and passes after retaining through iat-plus-skew.

Fourteen route integration tests use temporary Ed25519 realm signing keys and real ES256 DPoP proofs. They exercise the production verifier and handlers, including correctly signed expired/wrong-claim test tokens, own-client roles, origin and streaming limits, immutable researcher keys, ciphertext-only records, cross-owner denials, fingerprint confirmation, pending/active grants, A reading/B refused, cancellation, pending withdrawal, atomic multi-recipient re-keying, separate persisted-state denial verification and scoped logs. No production authentication switch is added. The generated test keys and database are removed after the run.

## What remains unresolved

These checks do not establish real Tide availability, successful account enrolment, native quorum governance, malicious-operator-resistant withdrawal, trusted code delivery, production readiness, user demand or research effectiveness. An authorised reader can retain copies. A malicious operator can restore old encrypted records or serve malicious JavaScript. The local in-memory replay cache is lost on restart and is not shared across instances. See SECURITY_MODEL.md.

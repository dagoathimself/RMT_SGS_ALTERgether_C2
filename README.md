[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

**ALTERGETHER explores donating a language sample to one named researcher, with explicit consent and withdrawal. This prototype uses synthetic examples only.**

### 1. Vision & originality

Study how people describe scams in English, Vietnamese and mixed Vietnamese–English while preserving original wording and diacritics. We adapt the Research Consent Vault pattern to a language-research workflow; we do not claim to have invented consent vaults or established demand.

### 2. Trust constraint insight

An administrator-controlled portal can change permissions or hold everyone's decryption key. A donor must then trust the operator with every report. Our design separates portal permissions from the owner's ability to create a recipient-specific key copy.

### 3. Value & impact

Participants choose the sample, researcher and purpose. Researchers receive the original text rather than a translation. Six synthetic examples demonstrate the interaction; real-user usefulness and language-data needs remain hypotheses to validate.

### 4. Why TideCloak matters

The live path uses Tide sign-in, verified tokens and DPoP. Browser encryption seals message keys and researcher private keys to their respective Tide identities. Ordinary login alone does not provide that key protection. `/demo` clearly simulates Tide identity sealing and portal decisions while exercising real WebCrypto encryption; live Tide enrolment and end-to-end decryption remain unverified.

### 5. Prototype & storytelling

Encrypt a sample, confirm A's fingerprint and consent, let A read, then show B failing with the ciphertext. Withdraw, rotate the message key and test the old key against the current record. Withdrawal cannot erase earlier copies or prevent a malicious operator restoring an old record. Multi-admin governance is not demonstrated.

## Demo video

[Watch the two-minute synthetic simulation](demo/DemoVideo.mp4). The video is a silent walkthrough of actual browser states, labelled **SIMULATION** throughout. See [demo/README.md](demo/README.md) for its scope and reproduction.

## Run without credentials

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo). Identity sealing is simulated with independent, in-memory AES keys in one tab. This demonstrates the workflow, **not real user isolation, Tide availability, or administrator quorum**. It never authenticates to the protected live API. Reset or reload discards the simulated state. The live portal displays setup guidance until configured; it does not fall back to simulated authentication.

## Configure live TideCloak

Additional requirements: Docker, `curl`, `jq`, network access and separate Tide accounts for the demo identities.

```bash
cp .env.example .env
# Set KC_BOOTSTRAP_ADMIN_PASSWORD in .env to your own strong local password.
npm run init
npm run dev
```

`npm run init` asks the deployment owner for a licence email and acceptance of Tide's terms before creating the local realm. It generates `data/tidecloak.json` and invitation links in `data/invites.local.txt`; both stay untracked. Open the three invitations in separate regular browser profiles and complete Tide enrolment. Allow local-network access if your browser asks. The Tide network must reach local TideCloak at `http://localhost:8080` through your browser.

The application reads its adapter at runtime, so a fresh build does not need your credentials, database, or generated adapter. Advanced deployments may supply the public adapter as the server-only `CLIENT_ADAPTER` JSON environment variable. Only allowlisted public adapter fields reach the browser. Production use requires HTTPS, a shared replay/rate-limit store, durable transactional storage and additional review.

## Live workflow

1. As `researcher_a` and `researcher_b`, open **Shared with you** and **Create my key**.
2. As `participant`, choose a synthetic example and **Encrypt and contribute**.
3. Researcher A opens **Show my fingerprint** and reads its first 16 hexadecimal characters to the participant through a trusted channel.
4. The participant opens **Share**, selects A, enters that fingerprint, reads the purpose, ticks consent, then chooses **Give access**.
5. A opens **Read / request again**. B can request the same contribution ID and should be refused.
6. The participant confirms **Withdraw**. If another recipient remains active, reconfirm that recipient's fingerprint before re-wrapping. An interruption leaves withdrawal pending and new reads by the withdrawn recipient blocked; **Resume withdrawal** retries it.
7. A requests the sample again. Current portal access should be denied; already obtained copies cannot be erased.
8. Signed-in users can run token-theft checks at `/checks`.

These steps are implemented but have **not been run here with enrolled Tide identities**. Record a live result only after observing it.

## Security and limits

- Browser-only AES-256-GCM message encryption; fresh message key per contribution and after withdrawal.
- Tide self-encryption in the live path protects the owner's message key and the researcher's ECDH private key. No application master decryption key exists.
- Owner-created ECDH/HKDF/AES-GCM key copies bind contribution, recipient, grant, purpose, permission version and key version. Fingerprints must be confirmed out of band before sharing or preserving a recipient during re-keying.
- Every protected route checks token signature, issuer, audience, `azp`, expiry, DPoP, role and record ownership/access. Actors come from verified `sub`, never a request body's user ID. Responses are not cached.
- Withdrawal first blocks new portal reads, atomically re-keys the stored sample and removes the target key copy, then verifies the persisted denial before showing **Withdrawn**.
- **Single-admin bootstrap remains.** No working two-of-three governance is claimed. Role changes do not themselves create a message key copy, but availability still depends on the operator.
- **A malicious operator serving modified JavaScript can steal browser plaintext.** Retained old ciphertext and old wraps can also be restored. This prototype does not resolve those threats.
- An authorised researcher can retain or misuse what they read. Purpose recording does not technically enforce subsequent behaviour. Metadata remains visible to the server.
- JSON-file storage, in-memory replay detection and rate limiting assume one local process. Restarts lose replay history. Synthetic fixtures are public source material; only operational ciphertext is confidential by design.

See [security model](docs/SECURITY_MODEL.md), [verification](docs/VERIFICATION.md) and [submission checklist](docs/SUBMISSION_CHECKLIST.md).

## Verification commands

```bash
npm run typecheck
npm test
npm run build
npm run test:http
npm run baseline
```

`npm test` verifies encryption, DPoP and the actual route handlers with a disposable locally signed test realm. It does **not** call Tide or bypass the production verifier. `npm run test:http` starts a production server and runs HTTP smoke/negative checks; run `npm run build` first. `npm run test:api` checks an already running server. Missing-adapter HTTP tests establish fail-closed responses, not working live authentication.

`npm run reset` clears the local operational store and researcher keys; re-create keys and contributions afterward. The isolated `baseline/` script demonstrates a constructed operator-controlled design; its failures are not a measured comparison with every conventional portal.

## References

[Official challenge, including Plan C](https://tide.org/unlocked/#plan-c) · [Tide E2EE](https://docs.tide.org/Admin/e2ee) · [RFC 9449 DPoP](https://www.rfc-editor.org/rfc/rfc9449.html) · [Source record](docs/SOURCES.md)

[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

**ALTERGETHER lets people donate scam messages in English, Vietnamese or both to one named researcher at a time, and take that access back, without any administrator or server operator being able to read or hand out the text.**

### 1. Vision & originality

Real scam messages are the best material for studying scams, and Vietnamese and mixed Vietnamese–English examples are scarce. ALTERGETHER makes each donation a consent decision: one message, one named researcher, one stated purpose, revocable.

### 2. Trust constraint insight

A forwarded scam often contains the donor's bank, phone number or a friend's name. In a typical portal, whoever runs the server holds the decryption key and edits permissions, so donors must trust every administrator. That trust is the bottleneck.

### 3. Value & impact

Donors keep control of each message. Researchers get the original wording, not a sanitised translation. The operator never holds sensitive text. The pattern fits other sensitive donations: health notes, abuse reports.

### 4. Why TideCloak matters

Each message is encrypted in the donor's browser. Its key is sealed with Tide self-encryption to the donor's own Tide identity, which the decentralised Tide network opens only for that person: no master key exists. To share, the donor's browser makes one key copy for a researcher whose private key is likewise sealed to their own Tide identity. Admin roles decide who may use the portal but cannot create a key copy. Without Tide, someone would hold those keys.

### 5. Prototype & storytelling

The participant confirms Researcher A's key fingerprint and shares one Vietnamese sample. A reads it. Researcher B is refused; even handed the whole stored ciphertext, B opens nothing. The participant withdraws, and A's next request is refused. A typical admin-controlled portal fails 5 of the same 10 checks.

## Demo video

[demo/altergether-demo.mp4](demo/altergether-demo.mp4) (two minutes, under 100 MB).

## How it works

| Item | Created in | Protected by | What the server stores |
|---|---|---|---|
| Message text | Participant's browser | AES-256-GCM, a fresh key per message | Ciphertext |
| Message key | Participant's browser | Tide self-encryption, bound to the participant's Tide identity | Sealed blob |
| Researcher private key | Researcher's browser | Tide self-encryption, bound to the researcher's Tide identity | Sealed blob + public key |
| Key copy for one researcher | Participant's browser | ECDH + HKDF + AES-GCM, bound to the message, researcher, grant, purpose and key version | Wrapped key |

**Read path:** the server checks for an active grant and returns ciphertext plus that researcher's key copy. The researcher's browser asks Tide to open their own private key, unwraps the message key and decrypts in memory. Editing any bound field in the database makes the unwrap fail.

**Key authenticity:** public keys are served by the app, so before sharing, the participant must type the first 16 characters of the researcher's key fingerprint, read to them by the researcher. The researcher's fingerprint is computed in their own browser from the private key only their Tide identity can open, so a key swapped on the server does not match and nothing is shared.

**Withdrawal:** the server stops serving the message to that researcher, the participant's browser re-encrypts it under a new key, and the server deletes the withdrawn key copy. Withdrawal cannot erase anything the researcher already read.

**Every API request** is checked server-side: token signature, issuer, audience, `azp`, expiry, and the DPoP proof (a stolen token replayed without its proof key is refused).

Full design: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

## Known limits

- **One governance admin.** The realm runs in TideCloak's bootstrap mode, so one admin approves realm changes alone. That admin cannot read messages or create access, but can change roles, for example to block a user.
- **Withdrawal is enforced by the app server.** A malicious operator could keep serving an old key copy to a researcher who already had access. Stored data alone never lets anyone outside the grant read the text.
- **Trusted app code.** As with any web end-to-end encryption, whoever serves the JavaScript could ship code that leaks plaintext from a user's browser.
- **Purpose is recorded, not enforced.** The study purpose is bound to each grant, but cryptography cannot stop an authorised researcher from misusing what they read.
- **Metadata is visible to the server:** who contributed, who was granted, and when.
- **Local prototype:** loopback HTTP, JSON-file storage, synthetic data only, no researcher key rotation.

## Setup

Requirements: Node.js 22+, npm, Docker, `curl`, `jq`, and a Tide account for each demo identity.

```bash
npm install
cp .env.example .env
```

Set `KC_BOOTSTRAP_ADMIN_PASSWORD` in `.env`, then:

```bash
npm run init
```

```bash
npm run dev
```

`npm run init` starts local TideCloak in Docker, creates the realm and the `participant`, `researcher_a` and `researcher_b` identities, exports `data/tidecloak.json`, and writes one-time invitation links to `data/invites.local.txt` (gitignored). It asks for the licence email and terms acceptance.

Open each invitation in its own **regular** browser profile (Chrome, Edge or Safari, not an embedded browser) and allow local network access if asked: the Tide sign-in page must reach TideCloak on `localhost:8080`. Then open [http://localhost:3000](http://localhost:3000).

## Run the demo

1. As `researcher_a` and `researcher_b`: open **Shared with me** and choose **Create my key**.
2. As `participant`: pick a sample and choose **Encrypt and contribute**.
3. As `researcher_a`: choose **Show my fingerprint** and read the first 16 characters to the participant.
4. As `participant`: **Share** → choose `researcher_a`, type the fingerprint, tick consent, **Give access**.
5. As `researcher_a`: **Read**. The text is decrypted in the browser.
6. As `researcher_b`: **Security tests** → request the same contribution id (refused). Start the server with `ENABLE_ATTACK_SIMULATION=1` to also run **Run attack simulation** on the full stored ciphertext.
7. As `participant`: **Withdraw**.
8. As `researcher_a`: **Request again** (refused), then sign in again and retry (refused).

The stolen-token checks run at [http://localhost:3000/checks](http://localhost:3000/checks) while signed in. Results go in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Baseline comparison

`npm run baseline` runs the same scenarios against a conventional portal (one server-held key, an admin-editable permission table). It fails 5 of 10 checks: a leaked database is readable, and one admin can grant access without the owner. See [evidence/baseline-results.md](evidence/baseline-results.md).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | App on `http://localhost:3000` |
| `npm run typecheck` | TypeScript checks |
| `npm run test:api` | Server-side negative tests (forged, expired, `alg:none` tokens, origin, size and rate limits) |
| `npm run baseline` | Conventional admin-controlled portal, for comparison |
| `npm run reset` | Clear the local store and activity log |

## Project structure

```text
src/app/participant/        contribute, share, withdraw
src/app/researcher/         researcher key, reading, security tests
src/app/checks/             stolen-token (DPoP) checks
src/app/api/                protected API routes
src/lib/crypto/envelope.ts  browser encryption, key copies, fingerprints
src/lib/tide/selfKeys.ts    Tide self-encryption of keys
src/lib/server/             request guard, access decisions, storage, activity log
baseline/                   conventional portal used for comparison
scripts/                    TideCloak bootstrap and API tests
docs/                       security model, verification record
evidence/                   recorded test results
demo/                       demo video
```

Official references: [Challenge](https://tide.org/unlocked/) · [TideCloak](https://tide.org/tidecloak) · [Documentation](https://docs.tide.org/).

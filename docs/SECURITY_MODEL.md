# Security model — ALTERGETHER

This is a local, synthetic-data prototype. Implemented mechanisms and observed tests are separate from live Tide claims; see VERIFICATION.md.

## Live trust boundaries

| Component | Holds / does | Trust assumption and limit |
|---|---|---|
| Owner browser | Encrypts text; opens its Tide-sealed message key; confirms recipient fingerprint; makes key copies | The device and served application code are trusted. A malicious JavaScript supplier can steal plaintext. |
| Researcher browser | Opens its own Tide-sealed private key and unwraps its permitted message key | An authorised reader can copy or misuse plaintext. |
| Next.js server | Verifies token/DPoP, actor/role and record access; stores ciphertext and metadata | Trusted for availability and portal withdrawal state. Cannot derive an owner's key from the stored encrypted record under the cryptographic and Tide assumptions. |
| TideCloak + Tide network | Live identity authentication, token signing and identity-bound self-encryption | Depends on correct realm setup, enrolled identities, SDK and network. Full live flow is not verified in this repair. |
| Bootstrap administrator | Changes realm roles and users | Single-operator bootstrap is the current setup. No multi-admin quorum result exists. Changing a role does not create an owner's key copy. |

Three synthetic personas are configured by bootstrap scripts: participant, researcher_a and researcher_b. Their Tide enrolment requires a person. No credentials, invitations or operational databases belong in Git.

## Data and keys

Each contribution uses a fresh random 256-bit AES-GCM key and 96-bit IV. Browser encryption authenticates the contribution ID and key version. The encrypted payload contains the original text, language, synthetic marker and text digest; the digest is checked after authenticated decryption.

The live browser calls Tide `doEncrypt` / `doDecrypt` with the `keys` tag to seal/open the owner's message key and each researcher's ECDH private key. `_tide_keys.selfencrypt` and `_tide_keys.selfdecrypt` roles and a working Tide session are required. There is no application master key or privileged decrypt endpoint. These SDK calls remain unverified here against enrolled live accounts.

Sharing uses ephemeral ECDH P-256, HKDF-SHA-256 and AES-256-GCM. Each key copy binds contribution ID, recipient `sub`, grant ID, permission version, purpose hash and message-key version. A changed field or another researcher's private key causes unwrap failure. Public keys come from the server, so the owner must confirm 16 hexadecimal fingerprint characters through a trusted out-of-band channel. A researcher derives their displayed fingerprint from their own sealed private key, not a server-supplied fingerprint alone.

The owner browser checks the returned grant against the selected researcher, contribution and displayed study purpose before wrapping. The researcher checks the same purpose and its own identity before unwrapping. These checks assume honest served JavaScript; they do not solve malicious-client-code delivery.

## Server enforcement

Every protected route uses the same guard: bounded streamed JSON body, fixed local rate limit, exact Origin on writes, verified Ed25519 JWT (issuer, audience, azp, required claims and expiry), ES256 DPoP, role and record-level authorisation. Identity comes only from verified `sub`. Roles on another client never count. Admin roles have no contribution-access exception.

DPoP proofs require a public P-256 JWK, matching key thumbprint, token hash, exact method and target URI, acceptable timestamp and unused identifier. Forwarded-host headers are ignored by default. Replay entries remain until the last instant the proof could still be accepted, including future timestamp allowance. Oversized identifiers are rejected. Replay/rate state is in memory and not restart-safe or shared across instances.

Requests cannot add plaintext fields, actor IDs or arbitrary metadata to contributions. Only the six public synthetic fixtures can be selected. The server cannot prove that arbitrary supplied bytes really are Tide ciphertext; cryptographic validity is established when a browser opens them. Rejecting a field is not a cryptographic proof of its contents.

## Sharing and withdrawal state

A grant begins pending and has no key copy. Only the owner can activate it with a current-version wrap. Pending grants can be cancelled. The server prevents new grant activation while a withdrawal is pending.

Withdrawal proceeds as follows:

1. The owner requests withdrawal. The target grant becomes withdrawal_pending and is immediately ineligible for new portal reads. Pending shares for that contribution are cancelled.
2. The owner browser opens the old record, generates a fresh message key, re-encrypts the sample and seals the new key to its own Tide identity. Every other active recipient's fingerprint must be reconfirmed before their new key copy is made.
3. One serialised store transaction checks the expected old version and exact remaining-recipient set, advances the key version, stores all fresh ciphertext/wraps and deletes the withdrawn recipient's wrap. Invalid or incomplete changes leave the old saved record unchanged.
4. A separate owner-authorised request re-reads persisted state and checks the advanced version, missing target wrap and denied access decision. Only then does the state become withdrawn.

An interrupted action remains pending and can be resumed. Re-keying protects the current record against the old key. It cannot erase plaintext, ciphertext or key copies retained during an authorised period. A malicious operator can restore an old record. The fresh denial check verifies this server's saved state, not the operator's honesty.

## Activity and storage

Operational storage contains metadata, ciphertext, Tide-sealed key blobs and recipient wraps. Contribution plaintext, raw keys, tokens and invitation links are not logged. Activity views are scoped to the actor, owner or relevant grant. The file is hash-chained for accidental-edit detection, not immutable against its operator. No free-text client event endpoint exists.

Writes use atomic rename and an in-process serialisation chain. This is suitable for one local prototype process only, not multi-instance hosting. A production design needs durable transactions, shared replay/rate state, quotas, HTTPS, supply-chain controls and security review. Local app/TideCloak traffic is loopback HTTP; Tide network traffic uses HTTPS.

## Separate public simulation

`/demo` never mounts the live Tide provider and never sends protected API requests. It runs only the six public synthetic fixtures. Real envelope-crypto helpers run in the browser, but Tide identity seals are replaced with in-memory AES test doubles. All simulated identities share one JS context, so there is no real authentication, user separation or administrator quorum. Reset/reload discards this state. It is a demonstration, not a fallback authentication mode.

## Unverified or excluded

Live enrolled Tide contribution/sharing/decryption/withdrawal; multi-admin governance; root/operator compromise; malicious application JavaScript; compromised user devices; researcher re-sharing; production operation; user demand and real-language dataset effectiveness. None is established by the automated tests or video.

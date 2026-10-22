# Security model — ALTERGETHER

Status: design, verified piece by piece in `docs/VERIFICATION.md`. Nothing here is a claim of
production security.

## 1. Identities

| Identity | Controlled by | Tide account | Realm roles | Purpose |
|---|---|---|---|---|
| `participant` | team member (synthetic persona) | own, via invite link | `participant` + defaults | owns the 6 synthetic contributions |
| `researcher_a` | team member (synthetic persona) | own | `researcher` + defaults | named recipient in the demo |
| `researcher_b` | team member (synthetic persona) | own | `researcher` + defaults | unapproved researcher (attacker) |
| master `admin` (bootstrap) | operator, password in gitignored `.env` | none | master realm admin | bootstrap; **because governance-admin enrolment was skipped (team decision, 2026-10-22), this operator can still commit governed realm changes alone** (firstAdmin mode) |

Governance admins (3 people, threshold 2-of-3) were planned but **not enrolled**. QEA is enabled on
the realm, yet with no `tide-realm-admin` holder the bootstrap operator approves changes alone. What
that operator can do: change roles, disable or delete users, i.e. block access. What it still cannot
do: produce a contribution key or plaintext, because neither depends on any role (§4).

Defaults for every user: `_tide_enabled`, `appUser`, `_tide_keys.selfencrypt`, `_tide_keys.selfdecrypt`.
These self-encryption roles are harmless to share: Tide self-encryption is identity-bound, so the
role only lets a user decrypt what **they themselves** encrypted.

## 2. Trust boundaries

```
 Owner's browser ──(DPoP-bound token, ciphertext only)──▶ App server (Next.js API) ──▶ data/store (JSON files)
       │  Tide SDK                                          │ verifies JWT + DPoP, checks
       ▼                                                    │ actor/role/grant per request
 Tide ORK network (threshold, 14-of-20) ◀── researcher's browser (Tide SDK)
       ▲
 TideCloak (local Docker, loopback only) — realm with QEA (quorum governance) on
```

| Component | Trusted for | NOT trusted for |
|---|---|---|
| Participant / researcher browser running the app code | its own user's plaintext | anything about other users |
| App server + `data/store` + logs | availability, metadata, workflow state, serving the right ciphertext | confidentiality: it never holds plaintext or a usable key |
| TideCloak admins (any one) | proposing governed changes | applying them alone; reading contribution text |
| Admin quorum (2 of 3) | role/policy changes | creating contribution access (no role or policy yields an owner's key) |
| Tide ORK network | threshold self-encryption, token signing | — (assumption: fewer than 14 colluding nodes, per Tide threat model) |
| Master realm admin | bootstrap | — not yet tested against the app realm |

## 3. Where encryption and decryption happen

All in the browser. The server sees only the right-hand column.

| Secret | Created | Protected by | Stored on server as |
|---|---|---|---|
| contribution text | owner's browser (from fixture or typed) | AES-256-GCM under contribution key `K_v` | `bodyCt` (+ iv) |
| contribution key `K_v` (32 random bytes, version v) | owner's browser | **Tide self-encryption by the owner** (tag `keys`) | `ownerKeyCt` |
| researcher private key (ECDH P-256) | researcher's browser | **Tide self-encryption by the researcher** | `encPrivateKey` (+ public JWK, fingerprint) |
| per-grant key wrap | owner's browser | ECDH-ES(ephemeral → researcher public key) + HKDF-SHA-256 + AES-256-GCM; AAD binds contribution id, recipient `sub`, grant id, permission version, purpose hash and key version | `wrap` on the grant |

**Read path (researcher):** server checks the grant → returns `bodyCt` + that researcher's `wrap` →
browser calls Tide `doDecrypt` on the researcher's *own* `encPrivateKey` (needs the researcher's live
Tide identity) → unwraps `K_v` (fails if any bound field was altered) → decrypts text in memory.
Nothing is written to browser storage.

## 4. What binds owner consent → contribution → recipient → permission version → decryption

The mechanism is **cryptographic, not a database row**:

1. Only the owner can obtain `K_v`: it exists in the store only as `ownerKeyCt`, which Tide decrypts
   only for the identity that encrypted it.
2. A recipient can obtain `K_v` only from a wrap made to *their* public key. Only a party who
   already knows `K_v` can make one. Server-side, only the owner (`sub` == `ownerSub`) may create grants.
3. The wrap's AES-GCM AAD contains `contributionId | recipientSub | grantId | permissionVersion |
   sha256(studyPurpose) | keyVersion`. Changing any of these in the database makes unwrap fail.
4. The recipient's private key opens only through the recipient's own Tide identity.

So an admin (or quorum) assigning roles, editing a grant row, or handing ciphertext to another user
cannot produce plaintext.

**Withdrawal** is enforced by the app server: from the first step it stops serving the ciphertext and wrap
to that recipient. The owner's browser then re-keys the contribution (`K_{v+1}`, new `bodyCt`, new
`ownerKeyCt`, re-wraps for any other still-active grants) and the server deletes the withdrawn
recipient's wrap in the same atomic write. The grant shows **Withdrawal pending** until the server
confirms that (a) the stored key version advanced and (b) no wrap for that recipient exists at the
current version, and a fresh access probe is denied. Then it shows **Withdrawn**. The probe runs on the
server against its own store, so it confirms the server's state, not the honesty of the operator: a
malicious operator could restore the old wrap. What re-keying does guarantee is that the *current*
stored record, if leaked, no longer opens for the withdrawn recipient.
Old ciphertext and an old wrap that a researcher deliberately copied during the authorised period
still open the *old* plaintext they were already authorised to see. This is the "copies already
obtained" limit, not fresh access.

## 5. Who can change effective authority

| Change | Who can make it | Effect on contribution access |
|---|---|---|
| grant/withdraw a contribution | the owner only (their browser + their Tide identity) | creates / removes access |
| assign/remove realm roles (`researcher`, `participant`, `_tide_keys.*`, `tide-realm-admin`) | admin quorum (2 of 3) via QEA change requests | API access to the portal; **cannot** create access to a contribution. Removing `_tide_keys.selfdecrypt` or `researcher` can *block* a researcher (availability) |
| edit `data/store` | app operator | can deny service or show wrong metadata; cannot produce plaintext. Can substitute a researcher **public key** before a *new* grant (see §7) |
| master realm admin | operator with bootstrap password | QEA does not govern the master realm. Whether it can apply app-realm changes without quorum is not yet tested |

## 6. Threats in scope vs excluded

In scope: unapproved researcher; one compromised admin; direct API requests; changed identifiers;
stale sessions; a governed change that legitimately reaches quorum; dependency failure.
Excluded: compromised user device; malicious app code served to a legitimate user;
sufficient-quorum collusion; every service-root compromise.

## 7. Known gaps and residual risks (honest list)

- **Public-key directory trust (mitigated by an enforced out-of-band check).** The owner's browser
  fetches the recipient's public key from the app server, so a compromised operator could try to
  substitute one. Before any wrap is made (sharing, and re-wrapping for remaining recipients during a
  withdrawal), the owner must type the first 16 hex characters (64 bits) of the recipient's
  fingerprint, read to them by the recipient. The owner's browser compares that with a fingerprint it
  computes itself from the key it is about to use. The recipient's fingerprint is derived in their own
  browser from their Tide-sealed private key, so a server-substituted key does not match. The residual
  risk is the human channel (an owner who skips asking, or a spoofed voice/chat). Tide's owner-mode
  attestation would remove it, but needs a custom contract that only the Tide team can deploy.
- **Malicious app code** (out of scope) could exfiltrate keys from a legitimate browser.
- Re-sharing by an authorised researcher (or retaining plaintext) cannot be prevented.
- Researcher key registration is first-come for that account; there's no key rotation UI.
- Recording a study purpose does not technically prevent misuse after authorised viewing.
- Local development runs over loopback HTTP (see §8).

## 8. Transport and exposure

Development exception: TideCloak (`127.0.0.1:8080`) and the app (`localhost:3000`) are bound to
loopback and use HTTP. Any deployed component must use HTTPS. Redirect URIs are restricted to the
exact app paths (`/`, `/auth/redirect`, `/silent-check-sso.html`), and web origins to
`http://localhost:3000` (no wildcards). Tide's own network traffic is HTTPS.

## 9. Design decisions against Tide-native options

| # | Conflict | Resolution |
|---|---|---|
| C-1 | The Tide-native shared-decryption contract `RelationshipAttestation:1` grants records **by realm admin**. The Tide MCP scenario says: "If the grant must be made by an owner … this contract does not fit." Our design rule is that admin approval never substitutes for owner consent. | Not used as the access gate. Owner-held key + owner-made wrap (§4), with both private keys protected by Tide self-encryption. |
| C-2 | Tide's owner-mode `shared-with` attestation would bind consent and public keys, but it needs a custom Forseti contract, which "is not self-service". | Not used. The gap is recorded in §7. |
| C-3 | Revoking a role or token in TideCloak only takes effect on the next token (5-minute lifetime here), so it cannot end access for an *existing session*. | Withdrawal does not depend on token revocation: the server stops serving at once, and re-keying takes effect for the next request of any session. |

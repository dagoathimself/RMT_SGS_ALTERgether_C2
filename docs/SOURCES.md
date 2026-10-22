# Sources, access dates and installed versions

All accessed **2026-10-22** (ICT, UTC+7) unless noted. Pages were read in full as fetched HTML/text,
not from titles or summaries.

## Entry rules
| Source | Used for |
|---|---|
| https://tide.org/unlocked/ and https://tide.org/unlocked/config.js | entry rules, judging prompts and weights, deadlines (Vietnam: 2026-10-22 18:00 ICT), form link |

## Official Tide documentation
| Page | Key facts relied on |
|---|---|
| https://docs.tide.org/get-started/Tidecloak%20Quickstart | `tideorg/tidecloak-dev` container; enrolment via `ACTION REQUIRED` link |
| https://docs.tide.org/Admin/e2ee | `_tide_<tag>.selfencrypt/selfdecrypt` roles; `doEncrypt([{data,tags}])`, `doDecrypt([{encrypted,tags}])`; encryption only on QEA-enabled realms |
| https://docs.tide.org/Core-Concepts/iga-workflow | quorum `max(1, floor(0.7 × N))` → 3 admins need 2; "The master realm is never governed by QEA"; 412 `QUORUM_NOT_MET` |
| https://docs.tide.org/Admin/SetupIGA | Authorize vs Commit; re-authorize returns 200 with `"committed": false`; multiAdmin approval goes through the enclave; adding admins |
| https://docs.tide.org/threat-model | 14-of-20 threshold; admin quorum residual risk = quorum collusion |
| https://docs.tide.org/FAQ/ | server-side verification; exact redirect URIs/web origins; QEA "changes don't stick" |
| https://docs.tide.org/Core-Concepts/dpop | DPoP binding; the resource server must validate the proof; `typ: DPoP` tokens fail as plain Bearer |
| https://docs.tide.org/ai-agent-pack, https://tide.org/agent-plugins | Tide MCP (Raziel) setup |

## Tide MCP (Raziel) — verified responding
- Endpoint `https://mcp.tide.org/mcp`, server `@tideorg/mcp` **v1.9.33** (from `initialize`). Tools
  listed and called over JSON-RPC: `tide_choose_scenario`, `tide_scenario` (encrypted-communication,
  relationship-attestation, attestation, organisation-password-manager), `tide_scenario_roles`,
  `tide_playbook`, `tide_canon` (invariants, concepts, custom-contracts, troubleshooting,
  version-policy, tidecloak-bootstrap), `tide_gaps`, `tide_scaffold`.
- Template used: `nextjs-e2ee-vault` from `https://mcp.tide.org/pack/templates.tgz` (fetched
  2026-10-22, kept in gitignored `.tide-pack/`).
- Findings that shaped the design (quoted briefly):
  - relationship-attestation: grants are approved by a realm admin; "If the grant must be made by an
    owner … this contract does not fit".
  - encrypted-communication: "Tide self-encryption is identity-bound (only the encrypting user can decrypt)".
  - attestation (owner mode): needs a custom contract that is "not self-service".

## Installed versions
| Component | Version |
|---|---|
| macOS | 15.7.3 (arm64) |
| Docker / Compose | 28.1.1 / v2.35.1-desktop.1 |
| Node / npm | v24.3.0 / 11.4.2 |
| TideCloak image | `tideorg/tidecloak-dev:latest`, image id `sha256:3f52d0bc3e4e…`, created 2026-10-19 |
| `@tidecloak/nextjs` | 0.14.40 (npm latest on 2026-10-22) |
| `@tidecloak/js` (resolved) | 0.14.41 |
| `@tidecloak/react` (resolved) | 0.14.33 |
| `next` / `react` | 16.x / 19.x (see `package-lock.json`) |
| `jose` | 6.x |

## Operational notes from the run
- First `setUpTideRealm` returned HTTP 500 `TIDE-IDPEXT-VENDOR-KEYGEN_FAILED`. The container log
  showed `[Midgard] FinalizeWallet failed: … 500`, a remote Tide licensing call. A clean re-run
  succeeded. This shows the external network dependency (risk K4).
- The realm's declarative user profile requires `email`; synthetic users use the reserved `.invalid`
  TLD (RFC 2606).

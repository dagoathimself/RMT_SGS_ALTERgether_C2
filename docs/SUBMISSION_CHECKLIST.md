# Submission checklist (Tide UNLOCKED, Challenge 2)

Source: https://tide.org/unlocked/ and https://tide.org/unlocked/config.js, re-read 2026-10-22 14:44 ICT.
**Vietnam deadline: Thursday 22 October 2026, 18:00 ICT.** Submission is done by the team, not by tooling.

| # | Official requirement | Status | What is left |
|---|---|---|---|
| C1 | Working prototype with TideCloak integrated | Integrated: real Tide sign-in redirect observed; server verifies TideCloak tokens + DPoP; live `/api/status` calls the TideCloak realm and Tide network | Enrol the three accounts in a regular browser (VERIFICATION E15), run S1–S3 and S10, record results. Until then, do not imply a full run in the video |
| C2 | Public GitHub repository with the code | Local git repo only; nothing committed or pushed | Commit, create a public GitHub repo, push (team decision) |
| C2/C4 | Two-minute demo video as `.mp4`, under 100 MB, inside the repo | Not recorded | Record, save as `demo/altergether-demo.mp4`, commit. README already links that path |
| C3 | README starts with a Project overview answering the five judging prompts, setup separate | Done: badge + `## Project overview` with sections 1–5 (≈263 words incl. headings), setup later | Re-read after any edit; keep ≤ 300 words |
| C5 | Submit the repo link through the official Google Form | Not submitted | Team submits via the form linked from https://tide.org/unlocked/#submit |
| C6 | Vietnam deadline 18:00 ICT, 22 Oct 2026 | Open | Recheck the official page for organiser updates |

## Before pushing
- `git add -n .` and inspect the list: `.env`, `data/invites.local.txt`, `data/store/`, `data/tidecloak.json`,
  `data/keycloakdb*`, `.tide-pack/`, `_archive/` must not appear (they are gitignored).
- Never share `ALTERgether.zip`: it contains `.env`, the invite links and the local Keycloak database.
- Watch the video for passwords, invite links, tokens or real personal data before committing it.
- The RMIT and Tide marks in `public/brand/` are the official files from tide.org/unlocked; confirm the
  organisers allow their use in entries.

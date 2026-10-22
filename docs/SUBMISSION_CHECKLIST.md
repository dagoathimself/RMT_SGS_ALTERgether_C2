# Submission checklist

Official page: https://tide.org/unlocked/ (Plan C and video requirements re-read 2026-10-22).

| Item | Repository state after repair | Team action |
|---|---|---|
| Working prototype | Credential-free synthetic simulation plus implemented live Tide path | Review the simulation; label its scope in the pitch. Live path still needs enrolled-account verification. |
| Public GitHub code | Repair branch and pull request contain reproducible setup, routes and tests | Review/merge the repair before submitting a main-branch link. |
| README overview, five prompts, maximum 300 words | Updated, with explicit assumptions and limits | Keep the overview within the limit after editing. |
| Two-minute MP4, under 100 MB, inside repository | `demo/altergether-demo.mp4`; silent actual-browser simulation walkthrough | Watch before submission. Replace with a narrated team demo if preferred; keep simulation labels. |
| Multi-admin / Tide claims | Explicitly unverified; no claimed working quorum | Do not imply the video proves live Tide or quorum protection. |
| Official submission form | Not submitted by this repair | The team submits the final repository URL through the form on the official page. Recheck the current deadline there. |

Never commit `.env`, `data/tidecloak.json`, invitation links, local logs, operational stores, tokens or Keycloak databases. Use the repository source rather than uploading a private working-folder archive. `npm run reset` destroys local prototype records; it is not a submission requirement.

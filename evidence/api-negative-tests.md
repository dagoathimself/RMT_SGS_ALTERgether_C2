# API negative tests (server-side, no real tokens)

Run at 2026-10-22T08:32:59.859Z against http://localhost:3001. 14/14 as expected.

| Check | Expected | Observed | Result | Note |
|---|---|---|---|---|
| No token → 401 | 401 | 401 | PASS |  |
| 401 response is no-store | no-store, max-age=0 | no-store, max-age=0 | PASS |  |
| Garbage token → 401 | 401 | 401 | PASS |  |
| Forged token (attacker-signed, correct claims) → 401 | 401 | 401 | PASS |  |
| Forged token with a matching attacker DPoP proof → 401 | 401 | 401 | PASS |  |
| alg:none token → 401 | 401 | 401 | PASS |  |
| Expired token → 401 | 401 | 401 | PASS |  |
| POST from foreign Origin → 403 | 403 | 403 | PASS |  |
| POST without Origin → 403 | 403 | 403 | PASS |  |
| 70 KB body → 413 (limit 64 KB) | 413 | 413 | PASS |  |
| Error body does not echo the token | true | true | PASS | {"error":"unauthenticated","message":"Sign-in could not be verified. No protected content was returned."} |
| Attack simulator without auth → 401/404 | 401|404 | 401 | PASS |  |
| Non-existent bulk export route → 404 | 404 | 404 | PASS |  |
| 400-request burst → some 429 (per-IP limit 300 burst, 10/s) | true | true | PASS | 96 of 400 limited; 0 connection errors |

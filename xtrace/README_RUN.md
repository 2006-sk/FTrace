# XTrace memory service — run & integrate

Owner: Kenil. Consumer: the backend (Shresth). Zero npm dependencies — Node 18+ only.

```bash
cd xtrace
cp .env.example .env    # then paste XTRACE_API_KEY
node server.js          # http://localhost:7070
node test/smoke.js      # 18 checks, offline, proves the learning loop
node test/live.js       # confirms the hosted XTrace key still works
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `XTRACE_PORT` | `7070` | Service port |
| `XTRACE_SERVICE_TOKEN` | `dev-token` | Sent as `Authorization: Bearer <token>` |
| `XTRACE_REQUIRE_AUTH` | `true` | Set `false` for local wiring |
| `XTRACE_API_KEY` | _(unset)_ | Hosted XTrace key. **Unset = local memory only; the demo still works.** Lives in `.env`, which is gitignored. |
| `XTRACE_USER_ID` | `restaurant_demo` | XTrace scopes memory by `user_id`. Ingest and recall must agree — change it in one place only. |
| `XTRACE_PERSIST` | `true` | `false` for in-memory only |

Without `XTRACE_API_KEY` the service uses its own deterministic store and every
endpoint behaves identically. Set the key and it additionally recalls facts from
hosted XTrace and mirrors call transcripts to it. A network failure there
degrades to local memory rather than breaking a call.

Hosted endpoints, verified live against `https://api.production.xtrace.ai`:

| Call | Path | Note |
|---|---|---|
| Ingest | `POST /v1/memories` | 202 + an `ingest_job`; extraction is async |
| Recall | `POST /v1/memories/search` | natural-language `query`, returns ranked `data[]` |
| Job status | `GET /v1/memories/jobs/:id` | poll until `succeeded` |

Auth is the `x-api-key` header. Note `POST /v1/memories/ingest` does **not**
exist (405) and `/v1/memories/trigger` answers 200 with an empty result — both
are easy wrong turns.

Hosted rows arrive with `origin: "xtrace"` and `confidence: null`. That null is
deliberate: the API returns retrieval *relevance*, not evidence-backed
confidence, and treating the two as one number would let a merely well-matching
row outrank a procedure we have actually proven on calls. Relevance is exposed
separately as `relevance`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/xtrace/v1/guidance/search` | Knowledge before a call → `{procedures, beliefs, searchId}` |
| POST | `/xtrace/v1/episodes` | Record an attempt → `{episodeId, candidateProcedures, strengthened}` |
| POST | `/xtrace/v1/beliefs` | Add an attributed claim |
| GET | `/xtrace/v1/cases/:caseId/conflicts` | Conflicting accounts, all preserved |
| GET | `/xtrace/v1/procedures` | Full memory state — useful for the demo panel |
| POST | `/xtrace/v1/admin/reset` | **Reset between demo runs** |
| GET | `/health` | Liveness + whether hosted XTrace is connected |

Request and response shapes match `README_KENIL_XTRACE.md` exactly. Response
fields added on top of the spec are additive only:

- `procedures[].origin` — `seed` | `learned` | `xtrace`
- `procedures[].isLearned` — `true` when extracted from a failed call
- `procedures[].learnedFromCallId` — which call taught us this
- `episodes` response `.strengthened[]` — procedures whose confidence just moved
- `episodes` response `.duplicate` — `true` on a replayed webhook

Ali: `isLearned` is the badge. Show "LEARNED FROM CALL 1" and the confidence
climbing 0.50 → 0.67 and the demo tells itself.

## Two calls that prove the whole thesis

```bash
# 1. Before any experience: only a generic intro procedure comes back.
curl -s localhost:7070/xtrace/v1/guidance/search \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"task":"secure_food_donation_pickup",
       "receiver":{"id":"recv_st_anthonys","name":"St. Anthony'\''s","type":"shelter"},
       "limit":5}'

# 2. The call fails on food safety. XTrace extracts why.
curl -s localhost:7070/xtrace/v1/episodes \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"idempotencyKey":"vapi:evt_1","task":"secure_food_donation_pickup",
       "callId":"call_1","receiverId":"recv_st_anthonys",
       "receiver":{"id":"recv_st_anthonys","type":"shelter"},
       "outcome":{"status":"rejected","reason":"food_safety_information_missing"},
       "observations":[{"statement":"The receiver asked when the meals came off the line.",
                        "sourceType":"call_transcript","sourceId":"call_1","speaker":"receiver"}]}'

# 3. A shelter we have NEVER called now gets that knowledge, ranked first.
curl -s localhost:7070/xtrace/v1/guidance/search \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"task":"secure_food_donation_pickup",
       "receiver":{"id":"recv_harbor_house","name":"Harbor House","type":"shelter",
                   "isFirstContact":true},"limit":5}'
```

Step 3 returns the procedure that did not exist before step 2. That is the demo.

## Integration contract for the backend

1. Before dialing → `POST /guidance/search`. Put `procedures[].instruction`
   straight into the Vapi system prompt; they are written to be prompt-insertable.
2. **Keep `searchId`.** Pass it back as `guidanceSearchId` on the episode so
   guidance and outcome are linked.
3. On `call.ended` → `POST /episodes` with `idempotencyKey: "vapi:<eventId>"`.
   Replays are safe: the original result is returned and nothing is double-counted.
4. Send `procedureFeedback` — `helped` on acceptance, `hurt` if a procedure
   backfired, `not_used` otherwise. This is what moves confidence.
5. `outcome.reason` on failures drives procedure extraction. Known reasons:
   `food_safety_information_missing`, `allergen_information_missing`,
   `wrong_contact`, `pickup_window_too_late`, `capacity_unknown`, `no_transport`.
   An unknown reason falls back to keyword extraction from the observations, so
   an unexpected rejection still teaches us something.

## How the numbers work

Confidence is deterministic — Laplace-smoothed success rate, no tuning:

```
confidence = (helped + 1) / (helped + hurt + 2)
```

A new procedure sits at exactly **0.50** (proposed, unproven), **0.67** after one
success, **0.88** at helped 6 / hurt 0 — which matches the spec's worked example.
`unclear` is recorded as evidence but never moves the number.

Ranking is scope-weighted so a strong receiver-specific fact always beats a weak
global hint: same receiver (400) > same receiver type (300) > global (200), then
confidence, then recency.

## Demo safety

- `POST /xtrace/v1/admin/reset` restores the seed state. **Run it before every
  take** or call 1 will already know the answer and the demo has no punchline.
- Only one weak generic procedure is seeded, deliberately. The food-safety
  procedure must be *learned* on stage or there is nothing to show.
- Hosted-XTrace calls are timeout-bounded (6s) and fall back to local memory.
  Nothing on stage depends on a live third-party API responding.

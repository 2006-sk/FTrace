# Kenil — XTrace Memory

The product first sells what still has value, then donates the rest. Your job is
to make both decisions improve from outcomes while keeping the strongest XTrace
demo focused on procedural call learning. XTrace should remember **how a
successful conversation was run**, not just store phone numbers or transcripts.

## Where deals enter memory

Each surplus event records two linked outcomes:

```json
{
  "surplusEventId": "se_123",
  "sellOutcome": {
    "targetSegment": "lapsed_guests_30_90_days",
    "discountPercent": 33,
    "durationMinutes": 45,
    "allocatedQuantity": 12,
    "soldQuantity": 7
  },
  "donateOutcome": {
    "releasedQuantity": 13,
    "acceptedQuantity": 13,
    "receiverId": "recv_harbor_house"
  }
}
```

Deal memory can advise the deterministic deal engine with bounded observations
such as “30% cleared similar inventory” or “a deep discount overloaded the
kitchen.” It must not silently override inventory conservation, price floors,
safe-until time, or the sell/donate allocation.

Useful deal retrieval context includes restaurant, food/recipe, time of day,
hours to expiry, demand level, target segment, discount, and duration. Keep
lapsed-guest response evidence separate from shelter-call procedures so a
marketing result can never become a Vapi instruction.

The primary recovery demo is procedural transfer after the timed deal closes:

1. One shelter rejects or delays a donation.
2. XTrace learns the blocker, such as missing food-safety details.
3. XTrace creates or strengthens a procedure: lead with temperature and preparation time.
4. The backend loads that procedure before calling another shelter.
5. The new shelter says yes faster.

## What Kenil owns

- XTrace service in `/xtrace`
- Procedure and belief storage
- Guidance search/ranking
- Episode ingestion after every call
- Extraction of observations and candidate procedures
- Conflict preservation and supersession history
- Outcome memory for deal recommendations and lapsed-guest targeting

Kenil does not own prices, allocation invariants, countdown state, Vapi calls,
receiver selection, frontend state, or the main app database.

## Interfaces with Shresth

The backend is XTrace's only app client.

| Direction | Endpoint | Purpose |
|---|---|---|
| Backend → XTrace | `POST /xtrace/v1/guidance/search` | Load useful knowledge before a call |
| Backend → XTrace | `POST /xtrace/v1/episodes` | Record a completed attempt |
| Backend → XTrace | `POST /xtrace/v1/beliefs` | Add an attributed claim |
| Backend → XTrace | `GET /xtrace/v1/cases/:caseId/conflicts` | Show unresolved conflicts |
| XTrace → Backend | Response only for v1 | Avoid callback complexity during the hackathon |

Use `Authorization: Bearer <XTRACE_SERVICE_TOKEN>` and `Content-Type: application/json`.

## Guidance search contract

`POST /xtrace/v1/guidance/search`

Request:

```json
{
  "task": "secure_food_donation_pickup",
  "receiver": {
    "id": "recv_456",
    "name": "Harbor House",
    "type": "shelter",
    "isFirstContact": true
  },
  "food": {
    "allergens": ["dairy"],
    "preparedAt": "2026-07-25T18:30:00Z",
    "temperatureF": 39,
    "safeUntil": "2026-07-26T02:30:00Z"
  },
  "limit": 5
}
```

Response:

```json
{
  "procedures": [
    {
      "id": "proc_food_safety_first",
      "instruction": "Lead with current temperature, preparation time, and safe-until time.",
      "reason": "Food-safety questions blocked four earlier calls.",
      "confidence": 0.88,
      "scope": "shelter",
      "evidenceCount": 6,
      "lastValidatedAt": "2026-07-24T21:15:00Z"
    }
  ],
  "beliefs": [],
  "searchId": "search_123"
}
```

Ranking should prefer:

1. The same receiver and same task.
2. The same receiver type and same task.
3. Global procedures for the same task.
4. Recent, repeatedly successful procedures.

This ordering enables transfer without letting a weak global hint override a strong receiver-specific fact.

## Episode ingestion contract

`POST /xtrace/v1/episodes`

```json
{
  "idempotencyKey": "vapi:evt_vapi_123",
  "task": "secure_food_donation_pickup",
  "recoveryCaseId": "rc_123",
  "callId": "call_123",
  "receiverId": "recv_456",
  "guidanceSearchId": "search_123",
  "outcome": {
    "status": "rejected",
    "pickupConfirmed": false,
    "reason": "food_safety_information_missing"
  },
  "observations": [
    {
      "statement": "The receiver asked when the meals came off the line.",
      "sourceType": "call_transcript",
      "sourceId": "call_123",
      "speaker": "receiver",
      "observedAt": "2026-07-25T23:14:03Z"
    }
  ],
  "procedureFeedback": [
    {
      "procedureId": "proc_food_safety_first",
      "result": "not_used"
    }
  ]
}
```

Response:

```json
{
  "episodeId": "episode_123",
  "stored": true,
  "candidateProcedures": [
    {
      "id": "candidate_123",
      "instruction": "State when the food came off the line before asking for acceptance.",
      "status": "proposed"
    }
  ]
}
```

## Procedure shape

```json
{
  "id": "proc_food_safety_first",
  "task": "secure_food_donation_pickup",
  "scope": {
    "type": "receiver_type",
    "value": "shelter"
  },
  "trigger": "Opening a donation call involving prepared food",
  "instruction": "Lead with current temperature, preparation time, and safe-until time.",
  "expectedEffect": "Resolve the food-safety blocker before asking for acceptance.",
  "confidence": 0.88,
  "evidence": {
    "helped": 6,
    "hurt": 0,
    "unclear": 1
  },
  "status": "active",
  "createdFromEpisodeId": "episode_090",
  "createdAt": "2026-07-20T03:20:00Z",
  "updatedAt": "2026-07-24T21:15:00Z"
}
```

Keep the instruction short enough to insert directly into the voice agent prompt.

## Contested belief contract

A failed pickup can create honest but conflicting reports. Never collapse them into one row.

`POST /xtrace/v1/beliefs`

```json
{
  "recoveryCaseId": "rc_123",
  "subject": "pickup_attempt_789",
  "claim": "The food was bagged and ready at 9:30 PM.",
  "source": {
    "type": "person",
    "id": "kitchen_manager_12",
    "role": "kitchen"
  },
  "observedAt": "2026-07-25T21:35:00Z",
  "confidence": 0.9
}
```

Another source may submit:

```json
{
  "recoveryCaseId": "rc_123",
  "subject": "pickup_attempt_789",
  "claim": "The back door was locked at 9:45 PM.",
  "source": {
    "type": "person",
    "id": "driver_33",
    "role": "driver"
  },
  "observedAt": "2026-07-25T21:47:00Z",
  "confidence": 0.9
}
```

`GET /xtrace/v1/cases/rc_123/conflicts` returns:

```json
{
  "conflicts": [
    {
      "id": "conflict_123",
      "subject": "pickup_attempt_789",
      "status": "unresolved",
      "beliefs": [
        {
          "claim": "The food was bagged and ready at 9:30 PM.",
          "sourceRole": "kitchen",
          "confidence": 0.9
        },
        {
          "claim": "The back door was locked at 9:45 PM.",
          "sourceRole": "driver",
          "confidence": 0.9
        },
        {
          "claim": "Nobody came.",
          "sourceRole": "shelter",
          "confidence": 0.8
        }
      ],
      "recommendedAction": "Confirm the pickup entrance and exchange a direct contact before dispatch."
    }
  ]
}
```

If later evidence changes the best interpretation, add `supersededBy` to the old belief. Do not delete it.

## Minimal implementation plan

1. Implement the two critical endpoints: guidance search and episode ingestion.
2. Seed one general shelter procedure for the demo.
3. Extract candidate procedures from rejected-call summaries.
4. Increase procedure confidence when the backend reports `helped`.
5. Add belief conflicts only after the main learning loop works.

For a reliable demo, procedure extraction may be LLM-assisted, but procedure selection and confidence updates should be deterministic.

## Done when

- Identical episode retries create no duplicates.
- A failed first call creates a candidate procedure.
- An accepted second call strengthens that procedure.
- A first-time receiver can receive a procedure learned elsewhere.
- Every observation has a source and timestamp.
- Conflicting claims remain separately queryable.

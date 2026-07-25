# XTrace Surplus Recovery

XTrace Surplus Recovery helps a restaurant move food that will not sell before it expires. Inventory analytics detect the surplus; the important XTrace use case is learning **how to get a shelter to say yes**.

The first call may fail because the shelter needs a temperature log, a different contact, or a specific pickup time. XTrace saves the procedure that worked and reuses it on later calls, including calls to new shelters.

## Team ownership

| Owner | Area | Reads next |
|---|---|---|
| Kenil | XTrace memory, learned procedures, contested beliefs | [README_KENIL_XTRACE.md](./README_KENIL_XTRACE.md) |
| Ali | Frontend, screens, routes, API integration | [README_ALI_FRONTEND.md](./README_ALI_FRONTEND.md) |
| Shresth | Backend orchestration, database, Vapi calls and webhooks | [README_SHRESTH_BACKEND_VAPI.md](./README_SHRESTH_BACKEND_VAPI.md) |

## System architecture

```mermaid
flowchart LR
    U["Restaurant operator"] --> FE["Ali: Frontend"]
    FE -->|"REST + event stream"| BE["Shresth: Backend"]
    BE -->|"Search/store memory"| XT["Kenil: XTrace"]
    BE -->|"Start outbound call"| VA["Vapi"]
    VA -->|"Phone call"| SH["Shelter staff"]
    VA -->|"Status, transcript, tool calls"| BE
    BE -->|"Observations and outcomes"| XT
    BE --> DB[("App database")]
```

### Connection rule

The frontend does not call Vapi or XTrace directly. It calls the backend. This keeps private keys off the browser and gives the backend one place to join call state, business data, and memory.

## Main demo flow

1. The frontend creates a surplus recovery case.
2. The backend asks XTrace for useful procedures and beliefs.
3. The backend builds a Vapi call using the food details and XTrace guidance.
4. Vapi calls the shelter and sends events to the backend.
5. The backend updates the frontend and records the result in XTrace.
6. If the call fails, XTrace extracts the blocker and updates the procedure.
7. The next call starts with the learned information, such as temperature and off-line time.

The demo should show **call one fails, XTrace learns why, call two succeeds**. Inventory analytics are the trigger, not the main memory claim.

## Shared data model

All IDs are strings. All timestamps are ISO 8601 UTC strings.

| Object | Purpose |
|---|---|
| `recovery_case` | One batch of surplus food that needs a destination |
| `receiver` | A shelter or other organization |
| `call` | One Vapi call attempt |
| `observation` | Something learned from a source |
| `procedure` | A reusable strategy for running a call |
| `belief` | A claim that may agree or conflict with other claims |

## Canonical API flow

### 1. Frontend creates a recovery case

`POST /api/v1/recovery-cases`

```json
{
  "restaurantId": "rest_123",
  "food": {
    "description": "20 boxed chicken and rice meals",
    "quantity": 20,
    "unit": "meal",
    "allergens": ["dairy"],
    "preparedAt": "2026-07-25T18:30:00Z",
    "safeUntil": "2026-07-26T02:30:00Z",
    "temperatureF": 39
  },
  "pickup": {
    "address": "123 Market St, San Francisco, CA",
    "readyAt": "2026-07-26T01:00:00Z",
    "latestAt": "2026-07-26T02:00:00Z"
  }
}
```

Response:

```json
{
  "id": "rc_123",
  "status": "draft",
  "createdAt": "2026-07-25T23:10:00Z"
}
```

### 2. Frontend starts recovery

`POST /api/v1/recovery-cases/rc_123/start`

```json
{
  "receiverIds": ["recv_st_anthonys", "recv_harbor_house"],
  "mode": "sequential"
}
```

Response:

```json
{
  "recoveryCaseId": "rc_123",
  "status": "calling",
  "activeCallId": "call_123"
}
```

### 3. Backend requests XTrace guidance

`POST /xtrace/v1/guidance/search`

```json
{
  "task": "secure_food_donation_pickup",
  "receiver": {
    "id": "recv_st_anthonys",
    "name": "St. Anthony's",
    "type": "shelter",
    "isFirstContact": false
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
      "instruction": "Open with current temperature, preparation time, and safe-until time before asking about acceptance.",
      "confidence": 0.88,
      "scope": "shelter",
      "evidenceCount": 6
    }
  ],
  "beliefs": [
    {
      "id": "belief_kitchen_contact",
      "claim": "Ask for the kitchen directly after 5 PM.",
      "confidence": 0.77,
      "source": "call_091"
    }
  ]
}
```

### 4. Backend creates a Vapi call

The backend maps the case and XTrace guidance to Vapi. The exact external Vapi shape can stay inside the backend; this is the internal request used by our app:

```json
{
  "callId": "call_123",
  "receiver": {
    "id": "recv_st_anthonys",
    "name": "St. Anthony's",
    "phone": "+14155550100"
  },
  "openingContext": {
    "foodDescription": "20 boxed chicken and rice meals",
    "temperatureF": 39,
    "preparedAt": "2026-07-25T18:30:00Z",
    "safeUntil": "2026-07-26T02:30:00Z",
    "latestPickupAt": "2026-07-26T02:00:00Z"
  },
  "guidance": [
    "Open with current temperature, preparation time, and safe-until time.",
    "Ask for the kitchen directly after 5 PM."
  ],
  "callbackUrl": "https://api.example.com/api/v1/webhooks/vapi"
}
```

### 5. Vapi sends call results to backend

The backend must verify the webhook signature and immediately return `200`.

```json
{
  "eventId": "evt_vapi_123",
  "type": "call.ended",
  "call": {
    "id": "vapi_call_abc",
    "metadata": {
      "internalCallId": "call_123",
      "recoveryCaseId": "rc_123",
      "receiverId": "recv_st_anthonys"
    },
    "status": "ended",
    "endedReason": "customer-ended-call",
    "startedAt": "2026-07-25T23:12:00Z",
    "endedAt": "2026-07-25T23:14:03Z",
    "transcript": "..."
  }
}
```

### 6. Backend records the outcome in XTrace

`POST /xtrace/v1/episodes`

```json
{
  "idempotencyKey": "vapi:evt_vapi_123",
  "task": "secure_food_donation_pickup",
  "recoveryCaseId": "rc_123",
  "callId": "call_123",
  "receiverId": "recv_st_anthonys",
  "outcome": {
    "status": "accepted",
    "pickupConfirmed": true,
    "pickupWindow": {
      "start": "2026-07-26T01:15:00Z",
      "end": "2026-07-26T01:45:00Z"
    }
  },
  "observations": [
    {
      "statement": "The kitchen accepted after hearing the temperature and preparation time.",
      "sourceType": "call_transcript",
      "sourceId": "call_123",
      "observedAt": "2026-07-25T23:14:03Z"
    }
  ],
  "procedureFeedback": [
    {
      "procedureId": "proc_food_safety_first",
      "result": "helped"
    }
  ]
}
```

## Live frontend events

Use Server-Sent Events at `GET /api/v1/recovery-cases/:id/events`. WebSocket is also acceptable if already implemented.

```json
{
  "type": "call.updated",
  "recoveryCaseId": "rc_123",
  "call": {
    "id": "call_123",
    "receiverId": "recv_st_anthonys",
    "status": "accepted",
    "summary": "Pickup confirmed for 6:15–6:45 PM."
  },
  "occurredAt": "2026-07-25T23:14:04Z"
}
```

## Integration rules

- Use `camelCase` JSON keys.
- Never expose XTrace or Vapi secret keys to the frontend.
- Pass `recoveryCaseId`, `receiverId`, and `internalCallId` in Vapi metadata.
- Make webhook processing idempotent using `eventId`.
- Store raw Vapi events before transforming them.
- Store source and time for every XTrace observation.
- Do not overwrite conflicting claims; keep each claim with attribution.
- Return errors as:

```json
{
  "error": {
    "code": "RECEIVER_UNREACHABLE",
    "message": "The receiver did not answer.",
    "retryable": true,
    "requestId": "req_123"
  }
}
```

## Suggested repository layout

```text
/
├── README.md
├── README_KENIL_XTRACE.md
├── README_ALI_FRONTEND.md
├── README_SHRESTH_BACKEND_VAPI.md
├── frontend/
├── backend/
├── xtrace/
└── shared/
    └── contracts/
```

## Demo success checklist

- A user can create a recovery case.
- The call timeline updates live.
- A failed call produces a visible learned blocker.
- The next call receives that guidance before it starts.
- An accepted call shows a confirmed pickup window.
- Conflicting reports remain visible with their sources.


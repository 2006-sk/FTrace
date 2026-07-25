# Kenil → Shresth: XTrace is ready to integrate

The memory service is done, tested and running. You are its only client.

```bash
cd xtrace
cp .env.example .env      # paste XTRACE_API_KEY — ask Kenil, it is not in git
node server.js            # http://localhost:7070
node test/smoke.js        # 18/18 offline
node test/live.js         # confirms the hosted XTrace key still works
```

`GET /health` tells you whether hosted XTrace is wired: `"hostedXTrace":"connected"`.

## Don't hand-roll the calls

Copy [`xtraceClient.backend.js`](./xtraceClient.backend.js) into the backend:

```js
const xtrace = require('./xtraceClient.backend');

// 1. before you dial
const { procedures, searchId } = await xtrace.guidance({ receiver, food });
systemPrompt += '\n' + xtrace.toPromptBlock(procedures);

// 2. on Vapi call.ended
await xtrace.episode({
  idempotencyKey: `vapi:${event.eventId}`,
  callId, receiverId, receiver,
  guidanceSearchId: searchId,
  outcome: { status: 'rejected', reason: 'food_safety_information_missing' },
  observations: [{
    statement: 'The receiver asked when the meals came off the line.',
    sourceType: 'call_transcript', sourceId: callId, speaker: 'receiver',
  }],
  procedureFeedback: [{ procedureId: 'proc_intro_basics', result: 'not_used' }],
});
```

Point it at the service with `XTRACE_SERVICE_URL` and `XTRACE_SERVICE_TOKEN`.
Every method fails soft — if memory is down you get an empty-but-valid shape and
`ok: false`, so the call still goes out.

## The four things that actually matter

1. **Keep `searchId`.** Pass it back as `guidanceSearchId` on the episode. That
   link is how we tell which guidance produced which outcome.
2. **`idempotencyKey: "vapi:<eventId>"`.** Vapi redelivers webhooks. Replays
   return the original result and double-count nothing — but only if you send
   the key.
3. **Send `procedureFeedback`.** `helped` on acceptance, `hurt` if a procedure
   backfired, `not_used` otherwise. This is the only thing that moves
   confidence. Without it nothing ever learns.
4. **`outcome.reason` on failures drives extraction.** Known values:
   `food_safety_information_missing`, `allergen_information_missing`,
   `wrong_contact`, `pickup_window_too_late`, `capacity_unknown`, `no_transport`.
   An unknown reason falls back to keyword extraction from the observations, so
   an unexpected rejection still teaches us something.

## What Ali needs from your responses

Pass these through — they are already on every procedure:

- `isLearned: true` → badge it **LEARNED FROM CALL 1**
- `confidence` → `0.50` proposed, `0.67` after one success
- `origin` → `seed` | `learned` | `xtrace`

`origin: "xtrace"` rows come from hosted XTrace and carry `confidence: null` with
a separate `relevance` number. That is deliberate — the API returns retrieval
relevance, not evidence-backed confidence. Render null as "—", not 0.

## Before every demo take

```bash
curl -X POST localhost:7070/xtrace/v1/admin/reset -H 'Authorization: Bearer dev-token'
```

Without this, call 1 already knows the answer and the demo has no punchline.

## Two things to know

- With a key set, guidance search makes a network call to hosted XTrace on every
  request, bounded at 6s (`XTRACE_TIMEOUT_MS`). If the venue wifi is bad on
  stage, unset `XTRACE_API_KEY` — everything still works on local memory and the
  learning demo is unaffected.
- XTrace scopes memory by `user_id`, defaulting to `restaurant_demo`. If you
  start passing a real `restaurantId`, pass it on **both** guidance search and
  episodes or we write to one bucket and read from another.

'use strict';

/**
 * Proves the "Done when" checklist from README_KENIL_XTRACE.md.
 *
 * Runs the real HTTP surface the backend will call -- no mocks, no stubs. If
 * this passes, Shresth can integrate against it.
 *
 *   node test/smoke.js
 */

process.env.XTRACE_PERSIST = 'false';
process.env.XTRACE_REQUIRE_AUTH = 'false';
process.env.XTRACE_PORT = process.env.XTRACE_PORT || '7079';

// Pin local-only memory. Defining this (even empty) stops .env from supplying a
// real key, which would make these assertions depend on the network and on
// whatever the hosted account happens to remember. test/live.js covers hosted.
process.env.XTRACE_API_KEY = '';

const { server } = require('../server');
const store = require('../src/store');
const { seed } = require('../src/seed');

const PORT = Number(process.env.XTRACE_PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const TASK = 'secure_food_donation_pickup';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

const ST_ANTHONYS = { id: 'recv_st_anthonys', name: "St. Anthony's", type: 'shelter', isFirstContact: false };
const HARBOR_HOUSE = { id: 'recv_harbor_house', name: 'Harbor House', type: 'shelter', isFirstContact: true };
const FOOD = {
  allergens: ['dairy'],
  preparedAt: '2026-07-25T18:30:00Z',
  temperatureF: 39,
  safeUntil: '2026-07-26T02:30:00Z',
};

async function run() {
  console.log('\nXTrace memory service — smoke test\n');

  // ---------------------------------------------------------------- call one
  console.log('CALL 1 — St. Anthony\'s, no food-safety knowledge yet');

  const g1 = await post('/xtrace/v1/guidance/search', {
    task: TASK,
    receiver: ST_ANTHONYS,
    food: FOOD,
    limit: 5,
  });

  check('guidance returns a searchId', Boolean(g1.searchId));
  check(
    'only the generic seeded procedure is known',
    g1.procedures.length === 1 && g1.procedures[0].id === 'proc_intro_basics',
    `got ${JSON.stringify(g1.procedures.map((p) => p.id))}`
  );
  check(
    'nothing about food safety exists yet',
    !g1.procedures.some((p) => /temperature/i.test(p.instruction))
  );

  // The call fails: the shelter asks when the food came off the line.
  const e1 = await post('/xtrace/v1/episodes', {
    idempotencyKey: 'vapi:evt_call_1',
    task: TASK,
    recoveryCaseId: 'rc_123',
    callId: 'call_1',
    receiverId: ST_ANTHONYS.id,
    receiver: ST_ANTHONYS,
    guidanceSearchId: g1.searchId,
    outcome: { status: 'rejected', pickupConfirmed: false, reason: 'food_safety_information_missing' },
    observations: [
      {
        statement: 'The receiver asked when the meals came off the line.',
        sourceType: 'call_transcript',
        sourceId: 'call_1',
        speaker: 'receiver',
        observedAt: '2026-07-25T23:14:03Z',
      },
    ],
    procedureFeedback: [{ procedureId: 'proc_intro_basics', result: 'not_used' }],
  });

  check('failed call created a candidate procedure', e1.candidateProcedures.length === 1);
  const learnedId = e1.candidateProcedures[0] && e1.candidateProcedures[0].id;
  check(
    'the candidate is about food safety',
    /temperature/i.test((e1.candidateProcedures[0] || {}).instruction || ''),
    JSON.stringify(e1.candidateProcedures)
  );

  // Idempotency: Vapi redelivers the same webhook.
  const e1replay = await post('/xtrace/v1/episodes', {
    idempotencyKey: 'vapi:evt_call_1',
    task: TASK,
    callId: 'call_1',
    receiverId: ST_ANTHONYS.id,
    outcome: { status: 'rejected', reason: 'food_safety_information_missing' },
    observations: [],
  });
  check('replayed webhook is idempotent', e1replay.episodeId === e1.episodeId && e1replay.duplicate === true);
  check(
    'replay created no duplicate procedure',
    store.state.procedures.filter((p) => p.origin === 'learned').length === 1,
    `procedures: ${store.state.procedures.length}`
  );

  // ---------------------------------------------------------------- call two
  console.log('\nCALL 2 — Harbor House, never contacted before');

  const g2 = await post('/xtrace/v1/guidance/search', {
    task: TASK,
    receiver: HARBOR_HOUSE,
    food: FOOD,
    limit: 5,
  });

  const transferred = g2.procedures.find((p) => p.id === learnedId);
  check(
    'a first-time receiver inherits knowledge learned elsewhere',
    Boolean(transferred),
    `got ${JSON.stringify(g2.procedures.map((p) => p.id))}`
  );
  check(
    'the learned procedure outranks the generic one',
    g2.procedures[0] && g2.procedures[0].id === learnedId,
    `top was ${g2.procedures[0] && g2.procedures[0].id}`
  );
  check('it is flagged as learned for the UI', transferred && transferred.isLearned === true);
  check(
    'unproven knowledge is honestly scored at 0.5',
    transferred && transferred.confidence === 0.5,
    `confidence ${transferred && transferred.confidence}`
  );

  // This call succeeds because it led with temperature.
  const e2 = await post('/xtrace/v1/episodes', {
    idempotencyKey: 'vapi:evt_call_2',
    task: TASK,
    recoveryCaseId: 'rc_123',
    callId: 'call_2',
    receiverId: HARBOR_HOUSE.id,
    receiver: HARBOR_HOUSE,
    guidanceSearchId: g2.searchId,
    outcome: {
      status: 'accepted',
      pickupConfirmed: true,
      pickupWindow: { start: '2026-07-26T01:15:00Z', end: '2026-07-26T01:45:00Z' },
    },
    observations: [
      {
        statement: 'The kitchen accepted after hearing the temperature and preparation time.',
        sourceType: 'call_transcript',
        sourceId: 'call_2',
        speaker: 'receiver',
        observedAt: '2026-07-26T00:02:00Z',
      },
    ],
    procedureFeedback: [{ procedureId: learnedId, result: 'helped' }],
  });

  check(
    'accepted call strengthened the procedure',
    e2.strengthened.length === 1 && e2.strengthened[0].confidence > 0.5,
    JSON.stringify(e2.strengthened)
  );

  const g3 = await post('/xtrace/v1/guidance/search', {
    task: TASK,
    receiver: ST_ANTHONYS,
    food: FOOD,
    limit: 5,
  });
  const proven = g3.procedures.find((p) => p.id === learnedId);
  check(
    'confidence rose to 0.67 after one success',
    proven && proven.confidence === 0.67,
    `confidence ${proven && proven.confidence}`
  );

  // ------------------------------------------------------------ attribution
  console.log('\nATTRIBUTION & CONFLICTS');

  const episode = store.state.episodes.find((e) => e.id === e1.episodeId);
  check(
    'every observation carries a source and a timestamp',
    episode.observations.every((o) => o.sourceType && o.sourceId && o.observedAt)
  );

  await post('/xtrace/v1/beliefs', {
    recoveryCaseId: 'rc_123',
    subject: 'pickup_attempt_789',
    claim: 'The food was bagged and ready at 9:30 PM.',
    source: { type: 'person', id: 'kitchen_manager_12', role: 'kitchen' },
    observedAt: '2026-07-25T21:35:00Z',
    confidence: 0.9,
  });
  await post('/xtrace/v1/beliefs', {
    recoveryCaseId: 'rc_123',
    subject: 'pickup_attempt_789',
    claim: 'The back door was locked at 9:45 PM.',
    source: { type: 'person', id: 'driver_33', role: 'driver' },
    observedAt: '2026-07-25T21:47:00Z',
    confidence: 0.9,
  });
  await post('/xtrace/v1/beliefs', {
    recoveryCaseId: 'rc_123',
    subject: 'pickup_attempt_789',
    claim: 'Nobody came.',
    source: { type: 'org', id: 'recv_st_anthonys', role: 'shelter' },
    observedAt: '2026-07-25T22:05:00Z',
    confidence: 0.8,
  });

  const conflicts = await get('/xtrace/v1/cases/rc_123/conflicts');
  check('conflicting accounts stay separately queryable', conflicts.conflicts.length === 1);
  check(
    'all three accounts survive intact',
    conflicts.conflicts[0].beliefs.length === 3,
    JSON.stringify(conflicts.conflicts[0].beliefs.map((b) => b.sourceRole))
  );
  check(
    'each claim keeps its source role',
    ['kitchen', 'driver', 'shelter'].every((role) =>
      conflicts.conflicts[0].beliefs.some((b) => b.sourceRole === role)
    )
  );
  check('conflict is flagged unresolved', conflicts.conflicts[0].status === 'unresolved');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

server.listen(PORT, async () => {
  seed();
  let ok = false;
  try {
    ok = await run();
  } catch (err) {
    console.error('\nsmoke test crashed:', err);
  } finally {
    server.close();
    process.exit(ok ? 0 : 1);
  }
});

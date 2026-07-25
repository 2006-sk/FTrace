import { getConfig, loadEnv } from './config.js';
import { XTraceClient } from './xtrace-client.js';

loadEnv();
const config = getConfig();
const client = new XTraceClient({
  baseUrl: config.xtraceServiceUrl,
  token: config.xtraceServiceToken,
  timeoutMs: config.xtraceServiceTimeoutMs
});

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function log(step, detail) {
  console.log(JSON.stringify({ step, ok: true, ...detail }));
}

const reset = await client.reset();
check(reset.ok, 'XTrace reset failed.');
log('reset', { procedures: reset.procedures });

const firstGuidance = await client.guidance({
  receiver: {
    id: 'recv_live_first',
    name: 'Live Test Shelter One',
    type: 'shelter',
    isFirstContact: true
  },
  food: {
    description: 'Chicken biryani',
    allergens: ['dairy'],
    temperatureF: 39
  },
  restaurantId: 'rest_live'
});
check(firstGuidance.ok, 'Initial guidance failed.');
check(
  !firstGuidance.procedures.some((item) =>
    item.instruction.toLowerCase().includes('temperature')
  ),
  'Food-safety guidance should not exist before the failed episode.'
);
log('call_1_guidance', {
  searchId: firstGuidance.searchId,
  procedures: firstGuidance.procedures.length
});

const rejectedEpisode = await client.episode({
  idempotencyKey: 'live-integration:rejected:1',
  recoveryCaseId: 'rc_live',
  callId: 'call_live_1',
  receiverId: 'recv_live_first',
  receiver: {
    id: 'recv_live_first',
    name: 'Live Test Shelter One',
    type: 'shelter'
  },
  restaurantId: 'rest_live',
  guidanceSearchId: firstGuidance.searchId,
  outcome: {
    status: 'rejected',
    reason: 'food_safety_information_missing'
  },
  observations: [
    {
      statement:
        'The receiver needed the current temperature and preparation time.',
      sourceType: 'call_transcript',
      sourceId: 'call_live_1',
      speaker: 'receiver'
    }
  ],
  procedureFeedback: []
});
check(rejectedEpisode.ok, 'Rejected episode ingestion failed.');
check(
  rejectedEpisode.candidateProcedures.length === 1,
  'Rejected episode did not create one candidate procedure.'
);
const learnedId = rejectedEpisode.candidateProcedures[0].id;
log('call_1_learned', { procedureId: learnedId });

const secondGuidance = await client.guidance({
  receiver: {
    id: 'recv_live_second',
    name: 'Live Test Shelter Two',
    type: 'shelter',
    isFirstContact: true
  },
  food: {
    description: 'Chicken biryani',
    allergens: ['dairy'],
    temperatureF: 39
  },
  restaurantId: 'rest_live'
});
check(secondGuidance.ok, 'Transferred guidance failed.');
check(
  secondGuidance.procedures[0]?.id === learnedId,
  'Learned procedure did not transfer to the new receiver.'
);
check(
  secondGuidance.procedures[0]?.isLearned === true,
  'Transferred procedure is missing its learned marker.'
);
log('call_2_transfer', {
  procedureId: learnedId,
  confidence: secondGuidance.procedures[0].confidence
});

const acceptedEpisode = await client.episode({
  idempotencyKey: 'live-integration:accepted:2',
  recoveryCaseId: 'rc_live',
  callId: 'call_live_2',
  receiverId: 'recv_live_second',
  receiver: {
    id: 'recv_live_second',
    name: 'Live Test Shelter Two',
    type: 'shelter'
  },
  restaurantId: 'rest_live',
  guidanceSearchId: secondGuidance.searchId,
  outcome: {
    status: 'accepted',
    reason: null
  },
  observations: [
    {
      statement: 'The receiver accepted after hearing the food-safety facts.',
      sourceType: 'call_transcript',
      sourceId: 'call_live_2',
      speaker: 'receiver'
    }
  ],
  procedureFeedback: [
    {
      procedureId: learnedId,
      result: 'helped'
    }
  ]
});
check(acceptedEpisode.ok, 'Accepted episode ingestion failed.');
check(
  acceptedEpisode.strengthened[0]?.confidence === 0.67,
  'Learned procedure confidence did not rise to 0.67.'
);
log('call_2_strengthened', {
  procedureId: learnedId,
  confidence: acceptedEpisode.strengthened[0].confidence
});

const publicMemory = await fetch(
  `${config.publicBaseUrl.replace(/\/$/, '')}/api/v1/memory/procedures`
);
check(publicMemory.ok, 'Public backend memory proxy failed.');
const publicBody = await publicMemory.json();
check(
  publicBody.procedures.some((item) => item.id === learnedId),
  'Learned procedure is missing from the public backend route.'
);
log('public_memory_route', {
  procedures: publicBody.procedures.length,
  learnedProcedureVisible: true
});

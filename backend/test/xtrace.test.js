import assert from 'node:assert/strict';
import test from 'node:test';
import { XTraceClient } from '../src/xtrace-client.js';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('XTrace guidance preserves searchId and promptable procedures', async () => {
  let requestBody;
  const client = new XTraceClient({
    baseUrl: 'http://xtrace.test',
    token: 'token',
    logger: { warn() {} },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({
        searchId: 'search_123',
        procedures: [
          {
            id: 'proc_123',
            instruction: 'Lead with temperature.',
            confidence: 0.5
          }
        ],
        beliefs: []
      });
    }
  });

  const result = await client.guidance({
    receiver: { id: 'recv_123', type: 'shelter' },
    food: { description: 'Biryani' },
    restaurantId: 'rest_123'
  });

  assert.equal(result.ok, true);
  assert.equal(result.searchId, 'search_123');
  assert.equal(requestBody.restaurantId, 'rest_123');
  assert.match(client.toPromptBlock(result.procedures), /temperature/);
});

test('XTrace episode is idempotency-ready and reports learned procedures', async () => {
  let requestBody;
  const client = new XTraceClient({
    baseUrl: 'http://xtrace.test',
    token: 'token',
    logger: { warn() {} },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({
        episodeId: 'episode_123',
        candidateProcedures: [
          {
            id: 'proc_learned',
            instruction: 'State preparation time first.'
          }
        ]
      });
    }
  });

  const result = await client.episode({
    idempotencyKey: 'vapi:evt_123',
    callId: 'call_123',
    outcome: {
      status: 'rejected',
      reason: 'food_safety_information_missing'
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidateProcedures.length, 1);
  assert.equal(requestBody.task, 'secure_food_donation_pickup');
  assert.equal(requestBody.idempotencyKey, 'vapi:evt_123');
});

test('XTrace client fails soft when memory service is unavailable', async () => {
  const client = new XTraceClient({
    baseUrl: 'http://xtrace.test',
    timeoutMs: 10,
    logger: { warn() {} },
    fetchImpl: async () => {
      throw new Error('offline');
    }
  });

  const guidance = await client.guidance({
    receiver: { id: 'recv_123', type: 'shelter' },
    food: {}
  });

  assert.equal(guidance.ok, false);
  assert.deepEqual(guidance.procedures, []);
  assert.equal(guidance.error.code, 'XTRACE_UNREACHABLE');
});

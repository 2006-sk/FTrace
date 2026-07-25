import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecoveryAssistantConfig,
  VapiClient
} from '../src/vapi-client.js';

test('recovery assistant contains dynamic variables and structured outcome', () => {
  const config = buildRecoveryAssistantConfig({
    serverUrl: 'https://example.com/api/v1/webhooks/vapi'
  });

  assert.equal(config.name, 'XTrace Surplus Recovery');
  assert.match(config.firstMessage, /\{\{restaurantName\}\}/);
  assert.match(
    config.model.messages[0].content,
    /\{\{temperatureF\}\}/
  );
  assert.equal(config.analysisPlan.structuredDataPlan.enabled, true);
  assert.equal(
    config.backgroundSpeechDenoisingPlan.smartDenoisingPlan.enabled,
    true
  );
  assert.equal(
    config.backgroundSpeechDenoisingPlan.fourierDenoisingPlan.baselineOffsetDb,
    -10
  );
  assert.equal(config.stopSpeakingPlan.numWords, 2);
  assert.ok(
    config.analysisPlan.structuredDataPlan.schema.properties.status.enum.includes(
      'accepted'
    )
  );
  assert.equal(
    config.server.url,
    'https://example.com/api/v1/webhooks/vapi'
  );
});

test('saved assistant call sends metadata separately from dynamic variables', async () => {
  let requestBody;
  const client = new VapiClient({
    apiKey: 'test',
    phoneNumberId: 'phone_123',
    assistantId: 'assistant_123',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ id: 'call_123', status: 'queued' }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  });

  await client.createOutboundCall({
    destination: '+14085550123',
    metadata: {
      recoveryCaseId: 'rc_123',
      receiverId: 'recv_123'
    },
    variableValues: {
      receiverName: 'Demo Shelter',
      foodDescription: 'Chicken biryani'
    }
  });

  assert.equal(requestBody.assistantId, 'assistant_123');
  assert.equal(requestBody.metadata.recoveryCaseId, 'rc_123');
  assert.equal(
    requestBody.assistantOverrides.variableValues.receiverName,
    'Demo Shelter'
  );
  assert.equal(
    requestBody.assistantOverrides.variableValues.recoveryCaseId,
    undefined
  );
});

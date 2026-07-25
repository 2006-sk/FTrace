import { randomUUID } from 'node:crypto';
import { getConfig, loadEnv } from './config.js';
import { buildTestCallPrompt, VapiClient } from './vapi-client.js';

loadEnv();
const config = getConfig();
const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});

if (!config.vapiTestDestination) {
  throw new Error('VAPI_TEST_DESTINATION is required.');
}

const prompt = buildTestCallPrompt();
const call = await client.createOutboundCall({
  destination: config.vapiTestDestination,
  firstMessage: prompt.firstMessage,
  systemPrompt: prompt.systemPrompt,
  metadata: {
    internalCallId: `call_${randomUUID()}`,
    purpose: 'inventory-demo'
  }
});

console.log(
  JSON.stringify(
    {
      id: call.id,
      status: call.status,
      createdAt: call.createdAt
    },
    null,
    2
  )
);


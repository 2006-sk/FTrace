import { getConfig, loadEnv } from './config.js';
import { VapiClient } from './vapi-client.js';

loadEnv();
const callId = process.argv[2];
if (!callId) throw new Error('Call ID argument is required.');

const config = getConfig();
const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});
const call = await client.getCall(callId);

console.log(
  JSON.stringify(
    {
      id: call.id,
      status: call.status,
      endedReason: call.endedReason ?? null,
      startedAt: call.startedAt ?? null,
      endedAt: call.endedAt ?? null
    },
    null,
    2
  )
);


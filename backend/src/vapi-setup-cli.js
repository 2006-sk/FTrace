import { getConfig, loadEnv } from './config.js';
import { VapiClient } from './vapi-client.js';

loadEnv();
const config = getConfig();
const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});

const existing = await client.listPhoneNumbers();
const phoneNumber =
  existing[0] ??
  (await client.createFreePhoneNumber({
    areaCode: '408',
    name: 'XTrace Surplus Demo'
  }));

console.log(
  JSON.stringify(
    {
      created: existing.length === 0,
      id: phoneNumber.id,
      number: phoneNumber.number,
      status: phoneNumber.status,
      provider: phoneNumber.provider
    },
    null,
    2
  )
);


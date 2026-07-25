import { getConfig, loadEnv } from './config.js';
import { VapiClient } from './vapi-client.js';

loadEnv();
const config = getConfig();
const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});

const [phoneNumbers, assistants] = await Promise.all([
  client.listPhoneNumbers(),
  client.listAssistants()
]);

console.log(
  JSON.stringify(
    {
      phoneNumbers: phoneNumbers.map((item) => ({
        id: item.id,
        number: item.number,
        name: item.name,
        provider: item.provider
      })),
      assistants: assistants.map((item) => ({
        id: item.id,
        name: item.name
      }))
    },
    null,
    2
  )
);


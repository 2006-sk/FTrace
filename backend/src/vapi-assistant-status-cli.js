import { getConfig, loadEnv } from './config.js';
import { VapiClient } from './vapi-client.js';

loadEnv();
const config = getConfig();
if (!config.vapiAssistantId) {
  throw new Error('VAPI_ASSISTANT_ID is required.');
}

const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});
const assistant = await client.getAssistant(config.vapiAssistantId);

console.log(
  JSON.stringify(
    {
      id: assistant.id,
      name: assistant.name,
      model: assistant.model?.model,
      voice: assistant.voice?.voiceId,
      smartDenoising:
        assistant.backgroundSpeechDenoisingPlan?.smartDenoisingPlan?.enabled ===
        true,
      fourierDenoising:
        assistant.backgroundSpeechDenoisingPlan?.fourierDenoisingPlan
          ?.enabled === true,
      interruptionWords: assistant.stopSpeakingPlan?.numWords ?? null,
      structuredDataEnabled:
        assistant.analysisPlan?.structuredDataPlan?.enabled === true,
      serverMessages: assistant.serverMessages ?? [],
      serverUrl: assistant.server?.url ?? null
    },
    null,
    2
  )
);

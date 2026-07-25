import { getConfig, loadEnv } from './config.js';
import {
  buildRecoveryAssistantConfig,
  VapiClient
} from './vapi-client.js';

loadEnv();
const config = getConfig();
const client = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});

const assistants = await client.listAssistants();
const configured = config.vapiAssistantId
  ? assistants.find((assistant) => assistant.id === config.vapiAssistantId)
  : null;
const existing =
  configured ??
  assistants.find(
    (assistant) =>
      assistant.name === 'FTrace Surplus Recovery' ||
      assistant.name === 'XTrace Surplus Recovery'
  );
const serverUrl = config.publicBaseUrl
  ? `${config.publicBaseUrl.replace(/\/$/, '')}/api/v1/webhooks/vapi`
  : '';
const assistantConfig = buildRecoveryAssistantConfig({ serverUrl });
const assistant = existing
  ? await client.updateAssistant(existing.id, assistantConfig)
  : await client.createAssistant(assistantConfig);

console.log(
  JSON.stringify(
    {
      created: !existing,
      id: assistant.id,
      name: assistant.name,
      serverUrl: assistant.server?.url ?? null
    },
    null,
    2
  )
);

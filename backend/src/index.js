import { createApp } from './app.js';
import { getConfig, loadEnv } from './config.js';
import { openDatabase, seedDatabase } from './database.js';
import { VapiClient } from './vapi-client.js';
import { XTraceClient } from './xtrace-client.js';

loadEnv();
const config = getConfig();
const db = openDatabase(config.databasePath);
seedDatabase(db);

const vapiClient = new VapiClient({
  apiKey: config.vapiApiKey,
  phoneNumberId: config.vapiPhoneNumberId,
  assistantId: config.vapiAssistantId
});

const xtraceClient = new XTraceClient({
  baseUrl: config.xtraceServiceUrl,
  token: config.xtraceServiceToken,
  timeoutMs: config.xtraceServiceTimeoutMs
});

const server = createApp({ db, config, vapiClient, xtraceClient });
server.listen(config.port, () => {
  console.log(`XTrace backend listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

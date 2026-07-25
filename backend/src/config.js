import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(filePath = path.resolve('.env')) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function getConfig(overrides = {}) {
  return {
    port: Number(overrides.port ?? process.env.PORT ?? 8000),
    databasePath:
      overrides.databasePath ??
      process.env.DATABASE_PATH ??
      'backend/data/xtrace.db',
    frontendOrigin:
      overrides.frontendOrigin ??
      process.env.FRONTEND_ORIGIN ??
      'http://localhost:3000',
    vapiApiKey: overrides.vapiApiKey ?? process.env.VAPI_API_KEY ?? '',
    vapiPhoneNumberId:
      overrides.vapiPhoneNumberId ?? process.env.VAPI_PHONE_NUMBER_ID ?? '',
    vapiAssistantId:
      overrides.vapiAssistantId ?? process.env.VAPI_ASSISTANT_ID ?? '',
    vapiTestDestination:
      overrides.vapiTestDestination ??
      process.env.VAPI_TEST_DESTINATION ??
      '',
    vapiWebhookToken:
      overrides.vapiWebhookToken ?? process.env.VAPI_WEBHOOK_TOKEN ?? '',
    publicBaseUrl:
      overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '',
    xtraceBaseUrl:
      overrides.xtraceBaseUrl ??
      process.env.XTRACE_BASE_URL ??
      'http://localhost:8100',
    xtraceServiceToken:
      overrides.xtraceServiceToken ??
      process.env.XTRACE_SERVICE_TOKEN ??
      ''
  };
}

import { getConfig, loadEnv } from '../backend/src/config.js';
import { XTraceClient } from '../backend/src/xtrace-client.js';

loadEnv();
const config = getConfig();
const client = new XTraceClient({
  baseUrl: config.xtraceServiceUrl,
  token: config.xtraceServiceToken,
  timeoutMs: config.xtraceServiceTimeoutMs
});
const result = await client.reset();
if (!result.ok) {
  console.error(JSON.stringify(result.error));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result, null, 2));
}

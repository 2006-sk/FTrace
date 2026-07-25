'use strict';

/**
 * Live check against the hosted XTrace Memory API.
 *
 * Unlike smoke.js (offline, deterministic, 18 assertions) this one needs
 * XTRACE_API_KEY and real network. Run it once before the demo to confirm the
 * key still works and the two endpoints we depend on are reachable:
 *
 *   node test/live.js
 *
 * It never asserts on recall content — extraction is asynchronous and a fresh
 * key legitimately has an empty memory. It fails only if the API rejects us.
 */

require('../src/env').loadEnv();
const xtrace = require('../src/xtraceClient');

const CONV = `live_check_${Date.now()}`;

async function main() {
  if (!xtrace.isEnabled()) {
    console.log('XTRACE_API_KEY not set — service runs on local memory only.');
    console.log('That is a supported mode; smoke.js covers it. Nothing to check here.');
    return;
  }

  console.log(`XTrace live check -> ${xtrace.BASE_URL}`);
  console.log(`agent_id=${xtrace.AGENT_ID}  app_id=${xtrace.APP_ID}\n`);

  // 1. Ingest a failed call.
  const job = await xtrace.ingestEpisode({
    messages: [
      { role: 'assistant', content: "Outbound donation call to St. Anthony's offering 20 boxed chicken and rice meals." },
      { role: 'user', content: 'We need the current holding temperature and when the meals came off the line before we can accept.' },
      { role: 'assistant', content: 'Those details were not on hand, so the shelter declined.' },
      { role: 'user', content: 'Lead with current temperature, preparation time and safe-until time before asking a shelter to accept prepared food.' },
    ],
    convId: CONV,
  });

  if (!job || !job.id) {
    console.error('FAIL  ingest rejected. Check XTRACE_API_KEY.');
    process.exitCode = 1;
    return;
  }
  console.log(`PASS  ingest accepted -> ${job.id} (${job.status})`);

  // 2. Poll the extraction job.
  let status = job.status;
  for (let i = 0; i < 8 && status !== 'completed' && status !== 'failed'; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await xtrace.jobStatus(job.id);
    status = (s && s.status) || status;
  }
  console.log(`      extraction job: ${status}`);

  // 3. Recall.
  const res = await xtrace.recallProcedures({
    task: 'secure_food_donation_pickup',
    receiver: { id: 'recv_harbor_house', name: 'Harbor House', type: 'shelter' },
  });

  if (!res) {
    console.error('FAIL  recall rejected.');
    process.exitCode = 1;
    return;
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  const promptable = rows.filter(xtrace.isPromptable);
  console.log(`PASS  recall returned ${rows.length} row(s), ${promptable.length} promptable\n`);

  for (const row of promptable.slice(0, 5)) {
    const p = xtrace.directiveToProcedure(row);
    console.log(`  • ${p.instruction}`);
    console.log(`    relevance ${p.relevance}  origin ${p.origin}`);
  }

  if (!promptable.length) {
    console.log('  (memory still extracting — recall is live, content will fill in)');
  }
  console.log('\nHosted XTrace reachable. Guidance search will merge these with local procedures.');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exitCode = 1;
});

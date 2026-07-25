import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase, seedDatabase } from '../src/database.js';

async function setup(t) {
  const db = openDatabase(':memory:');
  seedDatabase(db);
  const vapiCalls = [];
  const vapiClient = {
    async createOutboundCall(input) {
      vapiCalls.push(input);
      return {
        id:
          vapiCalls.length === 1
            ? 'vapi_call_test'
            : `vapi_call_test_${vapiCalls.length}`,
        status: 'queued'
      };
    }
  };
  const config = {
    frontendOrigin: 'http://localhost:3000',
    vapiApiKey: 'test',
    vapiTestDestination: '+14085550123',
    vapiWebhookToken: 'webhook-test-token'
  };
  const server = createApp({ db, config, vapiClient });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  return { baseUrl, db, vapiCalls };
}

test('health endpoint reports service state', async (t) => {
  const { baseUrl } = await setup(t);
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    database: 'connected',
    vapiConfigured: true
  });
});

test('order API deducts recipe ingredients', async (t) => {
  const { baseUrl } = await setup(t);
  const response = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipeId: 'recipe_biryani',
      quantity: 10
    })
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.deductions.length, 4);

  const ingredientsResponse = await fetch(
    `${baseUrl}/api/v1/ingredients`
  );
  const ingredients = (await ingredientsResponse.json()).items;
  assert.equal(
    ingredients.find((item) => item.id === 'ing_rice').stock,
    23
  );
});

test('test call endpoint uses configured destination and safe prompt', async (t) => {
  const { baseUrl, vapiCalls } = await setup(t);
  const response = await fetch(`${baseUrl}/api/v1/vapi/test-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.providerCallId, 'vapi_call_test');
  assert.equal(vapiCalls.length, 1);
  assert.equal(vapiCalls[0].destination, '+14085550123');
  assert.match(vapiCalls[0].systemPrompt, /ten chicken biryanis/i);
});

test('Vapi webhook requires authentication and is idempotent', async (t) => {
  const { baseUrl } = await setup(t);
  const payload = {
    eventId: 'evt_test_1',
    type: 'status-update',
    call: {
      id: 'vapi_call_test',
      status: 'ended'
    }
  };

  const unauthorized = await fetch(
    `${baseUrl}/api/v1/webhooks/vapi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  assert.equal(unauthorized.status, 401);

  const send = () =>
    fetch(`${baseUrl}/api/v1/webhooks/vapi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer webhook-test-token'
      },
      body: JSON.stringify(payload)
    });

  const first = await send();
  const second = await send();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    received: true,
    duplicate: false
  });
  assert.deepEqual(await second.json(), {
    received: true,
    duplicate: true
  });
});

test('recovery workflow advances after rejection and stops after acceptance', async (t) => {
  const { baseUrl, vapiCalls } = await setup(t);

  const createReceiver = async (name, phone) => {
    const response = await fetch(`${baseUrl}/api/v1/receivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'shelter', phone })
    });
    assert.equal(response.status, 201);
    return response.json();
  };

  const firstReceiver = await createReceiver(
    'First Shelter',
    '+14085550111'
  );
  const secondReceiver = await createReceiver(
    'Second Shelter',
    '+14085550112'
  );

  const caseResponse = await fetch(`${baseUrl}/api/v1/recovery-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId: 'rest_123',
      restaurantName: 'Demo Kitchen',
      food: {
        description: 'Chicken biryani',
        quantity: 10,
        unit: 'meals',
        allergens: ['dairy'],
        preparedAt: '2026-07-25T18:30:00Z',
        safeUntil: '2026-07-26T02:30:00Z',
        temperatureF: 39
      },
      pickup: {
        address: '123 Market St',
        readyAt: '2026-07-26T01:00:00Z',
        latestAt: '2026-07-26T02:00:00Z'
      }
    })
  });
  const recoveryCase = await caseResponse.json();

  const startResponse = await fetch(
    `${baseUrl}/api/v1/recovery-cases/${recoveryCase.id}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverIds: [firstReceiver.id, secondReceiver.id]
      })
    }
  );
  assert.equal(startResponse.status, 202);
  assert.equal(vapiCalls.length, 1);
  assert.equal(vapiCalls[0].destination, '+14085550111');
  assert.equal(vapiCalls[0].variableValues.restaurantName, 'Demo Kitchen');
  assert.equal(
    vapiCalls[0].variableValues.foodDescription,
    'Chicken biryani'
  );

  const sendWebhook = (payload) =>
    fetch(`${baseUrl}/api/v1/webhooks/vapi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer webhook-test-token'
      },
      body: JSON.stringify(payload)
    });

  const rejected = await sendWebhook({
    eventId: 'evt_rejected',
    message: {
      type: 'end-of-call-report',
      call: { id: 'vapi_call_test' },
      analysis: {
        structuredData: {
          status: 'rejected',
          pickupConfirmed: false,
          blockers: ['No refrigerator space'],
          observations: [],
          summary: 'Shelter could not accept tonight.'
        }
      }
    }
  });
  assert.equal(rejected.status, 200);
  assert.equal(vapiCalls.length, 2);
  assert.equal(vapiCalls[1].destination, '+14085550112');

  const accepted = await sendWebhook({
    eventId: 'evt_accepted',
    message: {
      type: 'end-of-call-report',
      call: { id: 'vapi_call_test_2' },
      analysis: {
        structuredData: {
          status: 'accepted',
          pickupConfirmed: true,
          pickupStart: '2026-07-26T01:15:00Z',
          pickupEnd: '2026-07-26T01:45:00Z',
          blockers: [],
          observations: ['Use the back kitchen door'],
          summary: 'Pickup confirmed.'
        }
      }
    }
  });
  assert.equal(accepted.status, 200);
  assert.equal(vapiCalls.length, 2);

  const stateResponse = await fetch(
    `${baseUrl}/api/v1/recovery-cases/${recoveryCase.id}`
  );
  const state = await stateResponse.json();
  assert.equal(state.status, 'accepted');
  assert.equal(state.attempts[0].status, 'rejected');
  assert.equal(state.attempts[1].status, 'accepted');
  assert.equal(state.attempts[1].result.pickupConfirmed, true);
});

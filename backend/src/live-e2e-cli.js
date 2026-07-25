import { getConfig, loadEnv } from './config.js';

loadEnv();
const config = getConfig();
const baseUrl = config.publicBaseUrl.replace(/\/$/, '');
if (!baseUrl) throw new Error('PUBLIC_BASE_URL is required.');
if (!config.vapiTestDestination) {
  throw new Error('VAPI_TEST_DESTINATION is required.');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`
    );
  }
  return body;
}

function log(step, detail) {
  console.log(JSON.stringify({ step, ok: true, ...detail }));
}

const health = await request('/health');
log('health', { status: health.status });

const recipes = await request('/api/v1/recipes');
const biryani = recipes.items.find((item) => item.id === 'recipe_biryani');
if (!biryani || biryani.ingredients.length !== 4) {
  throw new Error('Biryani recipe mapping is invalid.');
}
log('recipes', { biryaniIngredients: biryani.ingredients.length });

const ingredientsBefore = await request('/api/v1/ingredients');
const stockBefore = new Map(
  ingredientsBefore.items.map((item) => [item.id, item.stock])
);
const order = await request('/api/v1/orders', {
  method: 'POST',
  body: JSON.stringify({ recipeId: 'recipe_biryani', quantity: 1 })
});
if (order.deductions.length !== 4) {
  throw new Error('Order did not deduct four ingredients.');
}
log('order', { deductions: order.deductions.length });

for (const deduction of order.deductions) {
  await request(`/api/v1/ingredients/${deduction.ingredientId}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: stockBefore.get(deduction.ingredientId) })
  });
}
log('inventory_restore', { restoredIngredients: order.deductions.length });

const deal = await request('/api/v1/deals/recommend', {
  method: 'POST',
  body: JSON.stringify({
    inventoryCount: 20,
    hoursToExpiry: 4,
    demandLevel: 'normal'
  })
});
if (deal.action !== 'create_deal' || deal.discountPercent !== 30) {
  throw new Error('Deal recommendation did not match expected decision.');
}
log('deal', {
  action: deal.action,
  discountPercent: deal.discountPercent
});

const receiverList = await request('/api/v1/receivers');
let receiver = receiverList.items.find(
  (item) => item.phone === config.vapiTestDestination
);
if (!receiver) {
  receiver = await request('/api/v1/receivers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E Test Receiver',
      type: 'shelter',
      phone: config.vapiTestDestination
    })
  });
}
log('receiver', { receiverId: receiver.id });

const recoveryCase = await request('/api/v1/recovery-cases', {
  method: 'POST',
  body: JSON.stringify({
    restaurantId: 'rest_e2e',
    restaurantName: 'XTrace Demo Kitchen',
    food: {
      description: 'fresh chicken biryani',
      quantity: 10,
      unit: 'meals',
      allergens: ['dairy'],
      preparedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      safeUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      temperatureF: 39
    },
    pickup: {
      address: '123 Demo Market Street',
      readyAt: new Date().toISOString(),
      latestAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    }
  })
});
log('recovery_create', { recoveryCaseId: recoveryCase.id });

const started = await request(
  `/api/v1/recovery-cases/${recoveryCase.id}/start`,
  {
    method: 'POST',
    body: JSON.stringify({ receiverIds: [receiver.id] })
  }
);
log('recovery_start', {
  activeCallId: started.activeCallId,
  providerCallId: started.providerCallId
});

let finalState;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  finalState = await request(`/api/v1/recovery-cases/${recoveryCase.id}`);
  const attemptState = finalState.attempts[0]?.status ?? 'waiting';
  console.log(
    JSON.stringify({
      step: 'recovery_poll',
      status: finalState.status,
      attemptStatus: attemptState
    })
  );
  if (['accepted', 'exhausted', 'failed'].includes(finalState.status)) break;
}

if (!finalState || !['accepted', 'exhausted'].includes(finalState.status)) {
  throw new Error('Recovery did not reach a terminal state within 90 seconds.');
}

log('complete', {
  recoveryCaseId: finalState.id,
  status: finalState.status,
  attemptStatus: finalState.attempts[0]?.status,
  summary: finalState.attempts[0]?.summary ?? null
});


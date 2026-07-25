import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { recommendDeal } from './deal-service.js';
import { AppError, errorBody } from './errors.js';
import { readJson, routeMatch, sendJson } from './http-utils.js';
import {
  createOrder,
  listIngredients,
  listOrders,
  listRecipes,
  updateIngredientStock
} from './inventory-service.js';
import {
  createRecoveryCase,
  getRecoveryCaseDetails,
  getRecoveryCase,
  listRecoveryCases
} from './recovery-service.js';
import {
  createReceiver,
  getReceiver,
  listReceivers
} from './receiver-service.js';
import {
  advanceRecoveryFromEvent,
  startRecovery
} from './orchestration-service.js';
import { buildTestCallPrompt } from './vapi-client.js';
import {
  normalizeVapiEvent,
  processVapiWebhook,
  verifyWebhookToken
} from './webhook-service.js';

function validateE164(number) {
  return /^\+[1-9]\d{7,14}$/.test(number);
}

export function createApp({ db, config, vapiClient }) {
  return createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] ?? `req_${randomUUID()}`;
    const origin = config.frontendOrigin;
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Request-Id'
    );
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, OPTIONS'
    );
    response.setHeader('X-Request-Id', requestId);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, 'http://localhost');
      const { pathname } = url;

      if (request.method === 'GET' && pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          database: 'connected',
          vapiConfigured: Boolean(config.vapiApiKey)
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/v1/ingredients') {
        sendJson(response, 200, { items: listIngredients(db) });
        return;
      }

      const ingredientParams = routeMatch(
        pathname,
        '/api/v1/ingredients/:ingredientId'
      );
      if (request.method === 'PATCH' && ingredientParams) {
        const { value } = await readJson(request);
        sendJson(
          response,
          200,
          updateIngredientStock(db, ingredientParams.ingredientId, value.stock)
        );
        return;
      }

      if (request.method === 'GET' && pathname === '/api/v1/recipes') {
        sendJson(response, 200, { items: listRecipes(db) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/receivers') {
        const { value } = await readJson(request);
        sendJson(response, 201, createReceiver(db, value));
        return;
      }

      if (request.method === 'GET' && pathname === '/api/v1/receivers') {
        sendJson(response, 200, { items: listReceivers(db) });
        return;
      }

      const receiverParams = routeMatch(
        pathname,
        '/api/v1/receivers/:receiverId'
      );
      if (request.method === 'GET' && receiverParams) {
        sendJson(
          response,
          200,
          getReceiver(db, receiverParams.receiverId)
        );
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/orders') {
        const { value } = await readJson(request);
        sendJson(response, 201, createOrder(db, value));
        return;
      }

      if (request.method === 'GET' && pathname === '/api/v1/orders') {
        sendJson(response, 200, { items: listOrders(db) });
        return;
      }

      if (
        request.method === 'POST' &&
        pathname === '/api/v1/deals/recommend'
      ) {
        const { value } = await readJson(request);
        sendJson(response, 200, recommendDeal(value));
        return;
      }

      if (
        request.method === 'POST' &&
        pathname === '/api/v1/recovery-cases'
      ) {
        const { value } = await readJson(request);
        sendJson(response, 201, createRecoveryCase(db, value));
        return;
      }

      if (
        request.method === 'GET' &&
        pathname === '/api/v1/recovery-cases'
      ) {
        sendJson(response, 200, { items: listRecoveryCases(db) });
        return;
      }

      const recoveryParams = routeMatch(
        pathname,
        '/api/v1/recovery-cases/:caseId'
      );
      if (request.method === 'GET' && recoveryParams) {
        sendJson(
          response,
          200,
          getRecoveryCaseDetails(db, recoveryParams.caseId)
        );
        return;
      }

      const recoveryStartParams = routeMatch(
        pathname,
        '/api/v1/recovery-cases/:caseId/start'
      );
      if (request.method === 'POST' && recoveryStartParams) {
        const { value } = await readJson(request);
        const result = await startRecovery(
          db,
          vapiClient,
          recoveryStartParams.caseId,
          value.receiverIds
        );
        sendJson(response, 202, result);
        return;
      }

      if (
        request.method === 'POST' &&
        pathname === '/api/v1/vapi/test-call'
      ) {
        const { value } = await readJson(request);
        const destination =
          value.destination ?? config.vapiTestDestination;
        if (!validateE164(destination)) {
          throw new AppError(
            400,
            'INVALID_PHONE_NUMBER',
            'Destination must use E.164 format, for example +14085551234.'
          );
        }

        const internalCallId = `call_${randomUUID()}`;
        const now = new Date().toISOString();
        const prompt = buildTestCallPrompt();
        const call = await vapiClient.createOutboundCall({
          destination,
          firstMessage: prompt.firstMessage,
          systemPrompt: prompt.systemPrompt,
          variableValues: {
            purpose: 'inventory-demo'
          },
          metadata: {
            internalCallId,
            purpose: 'inventory-demo'
          }
        });

        db.prepare(`
          INSERT INTO calls
            (id, vapi_call_id, destination, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          internalCallId,
          call.id,
          destination,
          call.status ?? 'queued',
          now,
          now
        );

        sendJson(response, 201, {
          id: internalCallId,
          providerCallId: call.id,
          status: call.status ?? 'queued'
        });
        return;
      }

      if (
        request.method === 'POST' &&
        pathname === '/api/v1/webhooks/vapi'
      ) {
        if (!verifyWebhookToken(request.headers, config.vapiWebhookToken)) {
          throw new AppError(
            401,
            'INVALID_WEBHOOK_TOKEN',
            'Webhook authentication failed.'
          );
        }
        const { value, rawBody } = await readJson(request);
        const event = normalizeVapiEvent(value, rawBody);
        const webhookResult = processVapiWebhook(db, event, rawBody);
        if (!webhookResult.duplicate) {
          await advanceRecoveryFromEvent(db, vapiClient, event);
        }
        sendJson(response, 200, webhookResult);
        return;
      }

      throw new AppError(404, 'NOT_FOUND', 'Route not found.');
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              500,
              'INTERNAL_ERROR',
              'Unexpected server error.',
              false
            );
      if (!(error instanceof AppError)) {
        console.error(`[${requestId}]`, error);
      }
      sendJson(
        response,
        appError.status ?? 500,
        errorBody(appError, requestId)
      );
    }
  });
}

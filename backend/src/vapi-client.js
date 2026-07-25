import { AppError } from './errors.js';

const API_BASE = 'https://api.vapi.ai';

export class VapiClient {
  constructor({ apiKey, phoneNumberId, assistantId, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.phoneNumberId = phoneNumberId;
    this.assistantId = assistantId;
    this.fetchImpl = fetchImpl;
  }

  async request(path, options = {}) {
    if (!this.apiKey) {
      throw new AppError(
        503,
        'VAPI_NOT_CONFIGURED',
        'Vapi API key is not configured.'
      );
    }

    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }

    if (!response.ok) {
      throw new AppError(
        response.status,
        'VAPI_REQUEST_FAILED',
        body?.message ?? body?.error ?? 'Vapi request failed.',
        response.status >= 500,
        { providerStatus: response.status }
      );
    }
    return body;
  }

  listPhoneNumbers() {
    return this.request('/phone-number');
  }

  listAssistants() {
    return this.request('/assistant');
  }

  getAssistant(assistantId) {
    return this.request(`/assistant/${encodeURIComponent(assistantId)}`);
  }

  createAssistant(configuration) {
    return this.request('/assistant', {
      method: 'POST',
      body: JSON.stringify(configuration)
    });
  }

  updateAssistant(assistantId, configuration) {
    return this.request(`/assistant/${encodeURIComponent(assistantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(configuration)
    });
  }

  getCall(callId) {
    return this.request(`/call/${encodeURIComponent(callId)}`);
  }

  createFreePhoneNumber({
    areaCode = '408',
    name = 'XTrace Surplus Demo'
  } = {}) {
    return this.request('/phone-number', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'vapi',
        numberDesiredAreaCode: areaCode,
        name
      })
    });
  }

  async createOutboundCall({
    destination,
    metadata = {},
    firstMessage,
    systemPrompt,
    variableValues = {},
    phoneNumberId = this.phoneNumberId,
    assistantId = this.assistantId
  }) {
    if (!phoneNumberId) {
      throw new AppError(
        503,
        'VAPI_PHONE_NUMBER_REQUIRED',
        'A Vapi phone number ID is required for outbound calls.'
      );
    }

    const payload = {
      phoneNumberId,
      customer: { number: destination },
      metadata
    };

    if (assistantId) {
      payload.assistantId = assistantId;
      payload.assistantOverrides = {
        ...(firstMessage ? { firstMessage } : {}),
        variableValues
      };
    } else {
      payload.assistant = {
        name: 'XTrace Surplus Recovery Demo',
        firstMessage,
        firstMessageMode: 'assistant-speaks-first',
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }]
        },
        voice: {
          provider: 'vapi',
          voiceId: 'Elliot',
          version: 2
        },
        maxDurationSeconds: 180
      };
    }

    return this.request('/call', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

export function buildTestCallPrompt() {
  return {
    firstMessage:
      'Hi, this is the XTrace restaurant inventory demo. Is now a good time for a very short test?',
    systemPrompt: [
      'You are demonstrating XTrace Surplus Recovery to the project owner.',
      'Explain briefly that ordering ten chicken biryanis deducts basmati rice, chicken, onion, and yogurt from inventory.',
      'Then explain that inventory intelligence can create a time-limited deal when meals may expire, while XTrace remembers why earlier promotions or shelter calls worked.',
      'Keep the entire call under two minutes.',
      'Do not ask for sensitive information.',
      'End politely after answering one or two questions.'
    ].join(' ')
  };
}

export function buildRecoveryAssistantConfig({ serverUrl = '' } = {}) {
  const systemPrompt = [
    'You are a food donation recovery coordinator calling {{receiverName}} for {{restaurantName}}.',
    'The available food is {{quantityText}} of {{foodDescription}}.',
    'Allergens: {{allergens}}.',
    'It was prepared at {{preparedAt}}, is currently {{temperatureF}} degrees Fahrenheit, and is safe until {{safeUntil}}.',
    'Pickup is available at {{pickupAddress}} from {{readyAt}} until {{latestAt}}.',
    'Use this guidance learned from earlier calls when it is relevant: {{memoryGuidance}}.',
    'Your goal is to get a clear yes or no tonight.',
    'Start with food-safety facts before asking whether they can accept.',
    'Never invent information.',
    'If they can accept, confirm the pickup window, entrance, contact name, and callback number.',
    'If the person cannot decide, ask for the correct person or best callback time.',
    'Keep the call concise, polite, and under four minutes.',
    'Before ending, repeat the final agreement or blocker in one sentence.'
  ].join(' ');

  return {
    name: 'XTrace Surplus Recovery',
    firstMessage:
      'Hi, this is the food recovery assistant calling for {{restaurantName}}. We have {{quantityText}} of {{foodDescription}} available tonight. Is this the right person to discuss accepting it?',
    firstMessageMode: 'assistant-speaks-first',
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }]
    },
    voice: {
      provider: 'vapi',
      voiceId: 'Elliot',
      version: 2
    },
    backgroundSpeechDenoisingPlan: {
      smartDenoisingPlan: {
        enabled: true
      },
      fourierDenoisingPlan: {
        enabled: true,
        mediaDetectionEnabled: true,
        baselineOffsetDb: -10,
        windowSizeMs: 2000,
        baselinePercentile: 90
      }
    },
    stopSpeakingPlan: {
      numWords: 2,
      backoffSeconds: 1
    },
    maxDurationSeconds: 240,
    serverMessages: ['end-of-call-report', 'status-update'],
    artifactPlan: {
      recordingEnabled: false
    },
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        timeoutSeconds: 10
      },
      structuredDataPlan: {
        enabled: true,
        timeoutSeconds: 15,
        schema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: [
                'accepted',
                'rejected',
                'callback_requested',
                'no_answer',
                'unknown'
              ]
            },
            pickupConfirmed: { type: 'boolean' },
            pickupStart: { type: ['string', 'null'] },
            pickupEnd: { type: ['string', 'null'] },
            entrance: { type: ['string', 'null'] },
            contactName: { type: ['string', 'null'] },
            contactPhone: { type: ['string', 'null'] },
            blockers: {
              type: 'array',
              items: { type: 'string' }
            },
            observations: {
              type: 'array',
              items: { type: 'string' }
            },
            summary: { type: 'string' }
          },
          required: [
            'status',
            'pickupConfirmed',
            'blockers',
            'observations',
            'summary'
          ]
        }
      }
    },
    ...(serverUrl ? { server: { url: serverUrl, timeoutSeconds: 20 } } : {})
  };
}

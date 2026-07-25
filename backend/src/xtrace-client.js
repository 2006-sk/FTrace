const TASK = 'secure_food_donation_pickup';

export class XTraceClient {
  constructor({
    baseUrl = 'http://localhost:7070',
    token = 'dev-token',
    timeoutMs = 5000,
    fetchImpl = fetch,
    logger = console
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        this.logger.warn?.(
          `[xtrace] ${method} ${path} returned ${response.status}`
        );
        return {
          ok: false,
          error: payload?.error ?? {
            code: 'XTRACE_REQUEST_FAILED',
            message: 'XTrace request failed.'
          }
        };
      }
      return { ok: true, ...payload };
    } catch (error) {
      this.logger.warn?.(`[xtrace] ${method} ${path} unavailable`);
      return {
        ok: false,
        error: {
          code: 'XTRACE_UNREACHABLE',
          message: error.message
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    return this.request('GET', '/health');
  }

  async guidance({ receiver, food, restaurantId, limit = 5 }) {
    const result = await this.request(
      'POST',
      '/xtrace/v1/guidance/search',
      {
        task: TASK,
        receiver,
        food,
        restaurantId,
        limit
      }
    );
    return {
      ok: result.ok,
      procedures: result.procedures ?? [],
      beliefs: result.beliefs ?? [],
      searchId: result.searchId ?? null,
      error: result.error
    };
  }

  async episode(payload) {
    const result = await this.request('POST', '/xtrace/v1/episodes', {
      task: TASK,
      ...payload
    });
    return {
      ok: result.ok,
      episodeId: result.episodeId ?? null,
      candidateProcedures: result.candidateProcedures ?? [],
      strengthened: result.strengthened ?? [],
      duplicate: Boolean(result.duplicate),
      error: result.error
    };
  }

  async conflicts(recoveryCaseId) {
    const result = await this.request(
      'GET',
      `/xtrace/v1/cases/${encodeURIComponent(recoveryCaseId)}/conflicts`
    );
    return {
      ok: result.ok,
      conflicts: result.conflicts ?? [],
      error: result.error
    };
  }

  async procedures() {
    const result = await this.request('GET', '/xtrace/v1/procedures');
    return {
      ok: result.ok,
      procedures: result.procedures ?? [],
      error: result.error
    };
  }

  async reset() {
    return this.request('POST', '/xtrace/v1/admin/reset');
  }

  toPromptBlock(procedures) {
    if (!procedures?.length) return 'No prior call guidance is available.';
    return procedures
      .map((procedure) => `- ${procedure.instruction}`)
      .join('\n');
  }
}

export { TASK as XTRACE_TASK };

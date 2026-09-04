import { errorFromResponse, SessionExpiredError, SessionRotatedError } from "../errors";
import type { SessionManager } from "../session/session-manager";
import { apiUrl, type ClientConfig } from "./config";
import { createRetryPolicy, type RetryPolicy } from "./retry";

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface HttpClient {
  request(path: string, options?: RequestOptions): Promise<unknown>;
}

interface HttpClientOptions {
  config: ClientConfig;
  fetch: typeof globalThis.fetch;
  sessions: SessionManager;
  retry?: RetryPolicy;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const retry = options.retry ?? createRetryPolicy();
  return {
    async request(path, request = {}) {
      const method = request.method ?? "GET";
      const send = async (token: string) => {
        const headers: Record<string, string> = { "Bu-Payment-Session": token };
        if (request.body !== undefined) headers["Content-Type"] = "application/json";
        if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;
        const response = await retry.run(
          { method, hasIdempotencyKey: Boolean(request.idempotencyKey), signal: request.signal },
          () =>
            options.fetch(apiUrl(options.config.apiBaseUrl, path), {
              method,
              credentials: "omit",
              headers,
              ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
              ...(request.signal ? { signal: request.signal } : {}),
            }),
        );
        if (!response.ok) throw await errorFromResponse(response);
        return response.json();
      };
      const token = await options.sessions.getToken(request.signal);
      try {
        return await send(token);
      } catch (error) {
        if (!(error instanceof SessionExpiredError || error instanceof SessionRotatedError))
          throw error;
        options.sessions.invalidate(token);
        return send(await options.sessions.getToken(request.signal));
      }
    },
  };
}

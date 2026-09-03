export interface RetryContext {
  method: string;
  hasIdempotencyKey: boolean;
  signal?: AbortSignal | undefined;
}

export interface RetryPolicyOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface RetryPolicy {
  run(context: RetryContext, operation: () => Promise<Response>): Promise<Response>;
}

const retryableStatuses = new Set([429, 502, 503, 504]);

export function createRetryPolicy(options: RetryPolicyOptions = {}): RetryPolicy {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
  const sleep = options.sleep ?? wait;

  return {
    async run(context, operation) {
      const safeToRetry = context.method === "GET" || context.hasIdempotencyKey;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await operation();
        } catch (error) {
          if (!safeToRetry || attempt === maxAttempts || isAbort(error, context.signal))
            throw error;
          await sleep(baseDelayMs * 2 ** (attempt - 1), context.signal);
          continue;
        }
        if (!safeToRetry || !retryableStatuses.has(response.status) || attempt === maxAttempts) {
          return response;
        }
        await sleep(retryDelay(response, baseDelayMs * 2 ** (attempt - 1)), context.signal);
      }
      throw new Error("Retry policy exhausted unexpectedly");
    },
  };
}

function retryDelay(response: Response, fallback: number): number {
  const header = response.headers.get("Retry-After");
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
  const dateDelay = Date.parse(header) - Date.now();
  return Number.isFinite(dateDelay) && dateDelay > 0 ? Math.min(dateDelay, 30_000) : fallback;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

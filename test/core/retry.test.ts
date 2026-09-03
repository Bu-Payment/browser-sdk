import { describe, expect, it, vi } from "vitest";
import { createRetryPolicy } from "../../src/core/retry";

describe("createRetryPolicy", () => {
  it("retries a safe GET after a transient response", async () => {
    const sleep = vi.fn(async () => undefined);
    const policy = createRetryPolicy({ maxAttempts: 2, baseDelayMs: 10, sleep });
    let attempts = 0;

    const result = await policy.run({ method: "GET", hasIdempotencyKey: false }, async () => {
      attempts += 1;
      return attempts === 1 ? new Response(null, { status: 503 }) : new Response("ok");
    });

    expect(await result.text()).toBe("ok");
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("does not retry an unsafe mutation without idempotency", async () => {
    const policy = createRetryPolicy({ maxAttempts: 3, sleep: async () => undefined });
    const operation = vi.fn(async () => new Response(null, { status: 503 }));

    await policy.run({ method: "POST", hasIdempotencyKey: false }, operation);

    expect(operation).toHaveBeenCalledOnce();
  });

  it("retries a network failure for an idempotent operation", async () => {
    const policy = createRetryPolicy({ maxAttempts: 2, sleep: async () => undefined });
    let attempts = 0;

    const response = await policy.run({ method: "GET", hasIdempotencyKey: false }, async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network unavailable");
      return new Response("ok");
    });

    expect(await response.text()).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("honours Retry-After seconds", async () => {
    const sleep = vi.fn(async () => undefined);
    const policy = createRetryPolicy({ maxAttempts: 2, baseDelayMs: 10, sleep });
    let attempts = 0;

    await policy.run({ method: "GET", hasIdempotencyKey: false }, async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
        : new Response("ok");
    });

    expect(sleep).toHaveBeenCalledWith(2_000, undefined);
  });

  it("never retries an aborted operation", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const operation = vi.fn(async () => {
      throw controller.signal.reason;
    });
    const policy = createRetryPolicy({ maxAttempts: 3, sleep: async () => undefined });

    await expect(
      policy.run({ method: "GET", hasIdempotencyKey: false, signal: controller.signal }, operation),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).toHaveBeenCalledOnce();
  });
});

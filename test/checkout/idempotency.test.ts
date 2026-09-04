import { describe, expect, it, vi } from "vitest";
import { createCheckoutIdempotency } from "../../src/checkout/idempotency-store";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";
import { parseClientConfig } from "../../src/core/config";
import { BuPaymentError } from "../../src/errors";

const session = {
  token: "session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const created = {
  reference: "checkout_public",
  type: "payment",
  status: "pending",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://pay.example.test/session" },
  actions: { status: { method: "GET", url: "/public/v1/checkouts/checkout_public" } },
  checkoutUrl: "https://pay.example.test/session",
  createdAt: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  entries() {
    return [...this.values.entries()];
  }
}

function ready(client: ReturnType<typeof createBuPaymentClient>, email = "buyer@example.com") {
  return client.checkout.priceId("price_1").email(email).quantity(1).destinationKey("default");
}

describe("checkout idempotency", () => {
  it("shares one request for concurrent equal intent", async () => {
    let checkoutRequests = 0;
    let releaseCheckout: (() => void) | undefined;
    const checkoutGate = new Promise<void>((resolve) => {
      releaseCheckout = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      checkoutRequests += 1;
      await checkoutGate;
      return Response.json(created);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const firstPromise = ready(client).create();
    const secondPromise = ready(client).create();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(checkoutRequests).toBe(1);
    releaseCheckout?.();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.reference).toBe(second.reference);
  });

  it("retains a key after an ambiguous failure and clears it after confirmed success", async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];
    let fail = true;
    const cause = new TypeError("network unavailable");
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      if (fail) throw cause;
      return Response.json(created);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    const error = await ready(client)
      .create()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BuPaymentError);
    expect(error).toMatchObject({ code: ErrorCode.NETWORK_UNAVAILABLE, cause });
    const retained = storage
      .entries()
      .map(([, value]) => value)
      .join(" ");
    expect(retained).not.toContain("buyer@example.com");
    expect(retained).not.toContain("session");
    fail = false;
    await ready(client).create();

    expect(new Set(keys).size).toBe(1);
    expect(storage.entries().filter(([key]) => key.includes("idempotency"))).toHaveLength(0);
  });

  it("retains a key when checkout creation is cancelled after dispatch", async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    let markRequestStarted: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      if (keys.length === 1) {
        markRequestStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject;
        });
      }
      return Response.json(created);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const controller = new AbortController();
    const first = ready(client).signal(controller.signal).create();
    await requestStarted;
    const cause = new DOMException("cancelled", "AbortError");
    controller.abort(cause);
    rejectRequest?.(cause);

    await expect(first).rejects.toMatchObject({ code: ErrorCode.OPERATION_CANCELLED, cause });
    await ready(client).create();

    expect(new Set(keys).size).toBe(1);
  });

  it("retains a key when checkout creation times out after dispatch", async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];
    const now = () => new Date("2030-01-01T00:00:00.000Z");
    const idempotency = createCheckoutIdempotency(
      parseClientConfig({
        publishableKey: "bup_pk_test_example",
        apiBaseUrl: "https://api.example.test",
      }),
      storage,
      now,
    );
    const input = {
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 1,
      destinationKey: "default",
    };
    const create = async (idempotencyKey: string) => {
      keys.push(idempotencyKey);
      if (keys.length === 1) {
        throw new BuPaymentError("Checkout creation timed out", {
          code: ErrorCode.OPERATION_TIMED_OUT,
        });
      }
      return created;
    };

    await expect(idempotency.run(input, create)).rejects.toMatchObject({
      code: ErrorCode.OPERATION_TIMED_OUT,
    });
    await idempotency.run(input, create);

    expect(new Set(keys).size).toBe(1);
  });

  it("uses distinct keys for changed intent and tolerates unavailable storage", async () => {
    const keys: string[] = [];
    const storage = {
      get length(): number {
        throw new DOMException("blocked", "SecurityError");
      },
      clear() {
        throw new DOMException("blocked", "SecurityError");
      },
      getItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      key() {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("blocked", "SecurityError");
      },
    } satisfies Storage;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return Response.json(created);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
    });

    await ready(client).create();
    await ready(client, "other@example.com").create();

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("rejects expired and malformed recovery records", async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];
    let currentTime = "2030-01-01T00:00:00.000Z";
    let fail = true;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      if (fail) throw new TypeError("ambiguous");
      return Response.json(created);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
      now: () => new Date(currentTime),
    });

    await ready(client)
      .create()
      .catch(() => undefined);
    currentTime = "2030-01-01T00:16:00.000Z";
    fail = false;
    await ready(client).create();
    expect(new Set(keys).size).toBe(2);

    fail = true;
    await ready(client, "malformed@example.com")
      .create()
      .catch(() => undefined);
    for (const [key] of storage.entries()) storage.setItem(key, "{");
    fail = false;
    await ready(client, "malformed@example.com").create();
    expect(new Set(keys.slice(-4)).size).toBe(2);
  });

  it("clears recovery after a definite API rejection", async () => {
    const storage = new MemoryStorage();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith("application-sessions")) return Response.json(session);
      return Response.json({ error: "idempotency_conflict", message: "conflict" }, { status: 409 });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
    });

    await expect(ready(client).create()).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(storage.entries().filter(([key]) => key.includes("idempotency"))).toHaveLength(0);
  });
});

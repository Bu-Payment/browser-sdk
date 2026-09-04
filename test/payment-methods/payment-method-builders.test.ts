import { describe, expect, test, vi } from "vitest";
import { createBuPaymentClient, type PaymentMethodSetup } from "../../src";

const session = {
  token: "session-token",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};

const pendingSetup: PaymentMethodSetup = {
  id: "setup_opaque",
  status: "requires_action",
  expiresAt: "2030-01-01T00:30:00.000Z",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://vault.example.test/1.8.0/token" },
  actions: {
    status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
    confirm: { method: "POST", url: "/public/v1/payment-method-setups/setup_opaque/confirm" },
  },
};

const failedSetup = {
  id: "setup_opaque",
  status: "failed",
  expiresAt: "2030-01-01T00:30:00.000Z",
  actions: {
    status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
  },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function fetchForTerminalSetup() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/application-sessions")) return json(session, 201);
    if (path.endsWith("/confirm")) return json(pendingSetup);
    return json(failedSetup);
  });
}

function client(fetch: ReturnType<typeof vi.fn>, storage?: Storage) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    ...(storage ? { storage } : {}),
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
}

function hasConfirmation(fetch: ReturnType<typeof vi.fn>) {
  return fetch.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/confirm"));
}

describe("payment method builders", () => {
  test("exposes immutable terminal builders instead of imperative operations", () => {
    const paymentMethods = client(vi.fn()).paymentMethods;
    const referenced = paymentMethods.reference("setup_opaque");

    expect(referenced).not.toBe(paymentMethods);
    expect(Object.isFrozen(paymentMethods)).toBe(true);
    expect(Object.isFrozen(referenced)).toBe(true);
    expect("getStatus" in paymentMethods).toBe(false);
    expect("confirm" in paymentMethods).toBe(false);
    expect("start" in paymentMethods).toBe(false);
  });

  test("removes status after configuring resume-only state", () => {
    const paymentMethods = client(vi.fn()).paymentMethods;
    const referenced = paymentMethods.reference("setup_opaque");
    const withQuery = paymentMethods.returnQuery("?status=success").reference("setup_opaque");
    const withTimeout = paymentMethods.timeoutMs(1_000).reference("setup_opaque");

    expect("status" in referenced).toBe(true);
    expect("status" in withQuery).toBe(false);
    expect("status" in withTimeout).toBe(false);
    expect(Object.isFrozen(withQuery)).toBe(true);
  });

  test("does not let an active presentation skip return confirmation", async () => {
    const fetch = fetchForTerminalSetup();
    const paymentMethods = client(fetch).paymentMethods;
    const presenting = paymentMethods
      .setup(pendingSetup)
      .navigate(vi.fn())
      .pollIntervalMs(0)
      .present();
    const resumed = paymentMethods
      .reference("setup_opaque")
      .returnQuery("?status=success")
      .pollIntervalMs(0)
      .resume();

    await Promise.all([presenting.completion, resumed.completion]);

    expect(resumed).not.toBe(presenting);
    expect(hasConfirmation(fetch)).toBe(true);
  });

  test("does not let active polling skip return confirmation", async () => {
    const fetch = fetchForTerminalSetup();
    const paymentMethods = client(fetch).paymentMethods;
    const polling = paymentMethods.reference("setup_opaque").pollIntervalMs(0).resume();
    const confirming = paymentMethods
      .reference("setup_opaque")
      .returnQuery("?status=success")
      .pollIntervalMs(0)
      .resume();

    await Promise.all([polling.completion, confirming.completion]);

    expect(confirming).not.toBe(polling);
    expect(hasConfirmation(fetch)).toBe(true);
  });

  test("confirms a return using the setup reference saved by presentation", async () => {
    const storage = new MemoryStorage();
    const firstFetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      return path.endsWith("/application-sessions") ? json(session, 201) : json(pendingSetup);
    });
    const firstClient = client(firstFetch, storage);
    const presenting = firstClient.paymentMethods
      .setup(pendingSetup)
      .navigate(vi.fn())
      .pollIntervalMs(10_000)
      .present();
    const secondFetch = fetchForTerminalSetup();
    const secondClient = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: secondFetch,
      storage,
      now: () => new Date("2030-01-01T00:00:01.000Z"),
    });

    const resumed = secondClient.paymentMethods
      .returnQuery("?status=success")
      .pollIntervalMs(0)
      .resume();

    await expect(resumed.completion).resolves.toMatchObject({ status: "failed" });
    expect(hasConfirmation(secondFetch)).toBe(true);
    presenting.cancel();
    await expect(presenting.completion).rejects.toMatchObject({ name: "AbortError" });
  });
});

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
}

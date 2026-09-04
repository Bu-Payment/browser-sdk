import { describe, expect, test, vi } from "vitest";
import {
  type CheckoutCreated,
  type CheckoutLifecycle,
  createBuPaymentClient,
  type PresentationEvent,
  type PresentationHandle,
} from "../../src";

const session = {
  token: "session-token",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const checkout: CheckoutCreated = {
  reference: "checkout_public",
  type: "payment",
  status: "pending",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://pay.example.test/session" },
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
  },
  checkoutUrl: "https://pay.example.test/session",
  createdAt: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function lifecycle(status: string) {
  const active = status === "pending" || status === "processing";
  return {
    reference: "checkout_public",
    type: "payment",
    status,
    actions: {
      status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
    },
    ...(active
      ? {
          presentationVersion: 1,
          presentation: { kind: "redirect", url: "https://pay.example.test/session" },
        }
      : {}),
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:01:00.000Z",
    expiresAt: "2030-01-01T00:30:00.000Z",
  };
}

function makeClient(fetch: ReturnType<typeof vi.fn>) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
}

describe("presentation lifecycle", () => {
  test("redirects but reports completion only after canonical polling", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(lifecycle("pending")))
      .mockResolvedValueOnce(json(lifecycle("completed")));
    const navigate = vi.fn();
    const events: PresentationEvent[] = [];

    const handle = makeClient(fetch)
      .checkout.presentation(checkout)
      .navigate(navigate)
      .pollIntervalMs(0)
      .onEvent((event) => events.push(event))
      .start();
    expect(navigate).toHaveBeenCalledWith("https://pay.example.test/session");
    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
    expect(events).toEqual([
      { type: "opening", flow: "checkout_redirect" },
      { type: "opened", flow: "checkout_redirect" },
      { type: "polling", flow: "checkout_redirect", status: "pending" },
      { type: "completed", flow: "checkout_redirect", status: "completed" },
    ]);
    expect(JSON.stringify(events)).not.toContain("checkout_public");
  });

  test("deduplicates concurrent launches of one checkout", () => {
    const fetch = vi.fn().mockResolvedValue(json(session, 201));
    const sdk = makeClient(fetch);
    const first = sdk.checkout
      .presentation(checkout)
      .navigate(vi.fn())
      .pollIntervalMs(1_000)
      .start();
    const second = sdk.checkout
      .presentation(checkout)
      .navigate(vi.fn())
      .pollIntervalMs(1_000)
      .start();

    expect(second).toBe(first);
    first.cancel();
    return expect(first.completion).rejects.toMatchObject({ name: "AbortError" });
  });

  test("cancel aborts local work without manufacturing a server status", async () => {
    const fetch = vi.fn().mockResolvedValue(json(session, 201));
    const events: PresentationEvent[] = [];
    const handle = makeClient(fetch)
      .checkout.resume()
      .reference("checkout_public")
      .pollIntervalMs(1_000)
      .onEvent((event) => events.push(event))
      .start();

    handle.cancel();

    await expect(handle.completion).rejects.toMatchObject({ name: "AbortError" });
    expect(events.at(-1)).toEqual({ type: "cancelled", flow: "checkout_resume" });
    expect(events.some((event) => event.type === "completed")).toBe(false);
  });

  test("timeout is local and never emits completed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockImplementation(() => Promise.resolve(json(lifecycle("processing"))));
    const events: PresentationEvent[] = [];
    const handle = makeClient(fetch)
      .checkout.resume()
      .reference("checkout_public")
      .timeoutMs(10)
      .pollIntervalMs(1_000)
      .onEvent((event) => events.push(event))
      .start();

    await expect(handle.completion).rejects.toMatchObject({ name: "TimeoutError" });
    expect(events.at(-1)).toEqual({ type: "timed_out", flow: "checkout_resume" });
    expect(events.some((event) => event.type === "completed")).toBe(false);
  });

  test("fails closed before navigation when a redirect was tampered", () => {
    const malicious = {
      ...checkout,
      presentation: { kind: "redirect", url: "javascript:alert(1)" },
      checkoutUrl: "javascript:alert(1)",
    } as CheckoutCreated;
    const navigate = vi.fn();

    expect(() =>
      makeClient(vi.fn()).checkout.presentation(malicious).navigate(navigate).start(),
    ).toThrow(TypeError);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("rejects a redirect fragment before navigation", () => {
    const navigate = vi.fn();
    const tampered = {
      ...checkout,
      presentation: { kind: "redirect", url: "https://pay.example.test/session#javascript" },
      checkoutUrl: "https://pay.example.test/session#javascript",
    } as CheckoutCreated;

    expect(() =>
      makeClient(vi.fn()).checkout.presentation(tampered).navigate(navigate).start(),
    ).toThrow(TypeError);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("a new client resumes a redirect from minimal scoped session state", async () => {
    const storage = new MemoryStorage();
    const firstFetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValue(json(lifecycle("pending")));
    const firstClient = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: firstFetch,
      storage,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const first = firstClient.checkout
      .presentation(checkout)
      .navigate(vi.fn())
      .pollIntervalMs(1_000)
      .start();
    const persisted = storage.value();

    const wrongApplication = createBuPaymentClient({
      publishableKey: "bup_pk_test_other",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
      storage,
    });
    expect(() => wrongApplication.checkout.resume().start()).toThrow(/No resumable/);

    const secondFetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(lifecycle("completed")));
    const secondClient = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: secondFetch,
      storage,
      now: () => new Date("2030-01-01T00:00:01.000Z"),
    });
    const resumed = secondClient.checkout.resume().pollIntervalMs(0).start();

    await expect(resumed.completion).resolves.toMatchObject({ status: "completed" });
    expect(persisted).toContain("checkout_public");
    expect(persisted).not.toContain("session-token");
    expect(persisted).not.toContain("pay.example.test");
    first.cancel();
    await expect(first.completion).rejects.toMatchObject({ name: "AbortError" });
  });

  test("continues without persistence when session storage throws", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn().mockResolvedValue(json(session, 201)),
      storage: new ThrowingStorage(),
    });

    let handle: PresentationHandle<CheckoutLifecycle> | undefined;
    expect(() => {
      handle = client.checkout
        .presentation(checkout)
        .navigate(vi.fn())
        .pollIntervalMs(1_000)
        .start();
    }).not.toThrow();
    handle?.cancel();
    return expect(handle?.completion).rejects.toMatchObject({ name: "AbortError" });
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
  value() {
    return [...this.values.values()].join("");
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    throw new DOMException("unavailable", "SecurityError");
  }
  clear(): void {
    throw new DOMException("unavailable", "SecurityError");
  }
  getItem(): string | null {
    throw new DOMException("unavailable", "SecurityError");
  }
  key(): string | null {
    throw new DOMException("unavailable", "SecurityError");
  }
  removeItem(): void {
    throw new DOMException("unavailable", "SecurityError");
  }
  setItem(): void {
    throw new DOMException("unavailable", "SecurityError");
  }
}

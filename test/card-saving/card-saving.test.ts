import { afterEach, describe, expect, test, vi } from "vitest";
import { createBuPaymentClient, type PaymentMethodSetup } from "../../src";

const applicationSession = {
  token: "application-session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const challenge = {
  reference: `bup_cec_test_${"a".repeat(43)}`,
  expiresAt: "2030-01-01T00:10:00.000Z",
};
const customerSession = {
  token: `bup_cs_test_${"a".repeat(43)}`,
  expiresAt: "2030-01-01T00:20:00.000Z",
};
const setup: PaymentMethodSetup = {
  id: "setup_opaque",
  status: "requires_action",
  expiresAt: "2030-01-01T00:15:00.000Z",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://vault.example.test/card" },
  actions: {
    status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
    confirm: { method: "POST", url: "/public/v1/payment-method-setups/setup_opaque/confirm" },
  },
};
const succeeded: PaymentMethodSetup = {
  id: "setup_opaque",
  status: "succeeded",
  expiresAt: "2030-01-01T00:15:00.000Z",
  actions: { status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" } },
  paymentMethod: {
    id: "pm_public",
    status: "active",
    createdAt: "2030-01-01T00:02:00.000Z",
    updatedAt: "2030-01-01T00:02:00.000Z",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("card saving", () => {
  test("starts email verification without exposing or storing email", async () => {
    const storage = new MemoryStorage();
    stubLocation("https://shop.example/account/cards?old=value#section");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(challenge, 201));

    const base = client(fetch, storage).cardSaving;
    const withEmail = base.email("buyer@example.com");

    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(withEmail)).toBe(true);
    expect(withEmail).not.toBe(base);
    expect("start" in base).toBe(false);
    expect("start" in withEmail).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    const ready = withEmail.currency("eur").consent(true);
    expect(Object.isFrozen(ready)).toBe(true);
    expect("start" in ready).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    const result = await ready.start();
    expect(result).toEqual({ expiresAt: challenge.expiresAt });
    expect(request(fetch, 1)).toMatchObject({
      path: "/public/v1/customer-email-challenges",
      body: { email: "buyer@example.com", returnUrl: "https://shop.example/account/cards" },
    });
    expect(storage.serialized()).toContain(challenge.reference);
    expect(storage.serialized()).toContain("EUR");
    expect(storage.serialized()).not.toContain("buyer@example.com");
  });

  test("verifies the URL token, creates the setup with both sessions, and navigates", async () => {
    const storage = new MemoryStorage();
    stubLocation("https://shop.example/account/cards");
    const startingFetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(challenge, 201));
    await client(startingFetch, storage)
      .cardSaving.consent(true)
      .currency("EUR")
      .email("buyer@example.com")
      .start();
    const verificationToken = `bup_cvt_test_${"a".repeat(43)}`;
    const navigate = vi.fn();
    stubLocation(
      `https://shop.example/account/cards?bu_customer_verification_token=${verificationToken}`,
      navigate,
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(customerSession, 201))
      .mockResolvedValueOnce(json(setup, 201))
      .mockResolvedValueOnce(json(succeeded));

    const handle = client(fetch, storage).cardSaving.resume();
    await expect(handle.completion).resolves.toMatchObject({ status: "succeeded" });

    expect(request(fetch, 1)).toMatchObject({
      path: `/public/v1/customer-email-challenges/${challenge.reference}/verify`,
      body: { verificationToken },
    });
    const creation = request(fetch, 2);
    expect(creation.headers.get("Bu-Payment-Session")).toBe("application-session");
    expect(creation.headers.get("Bu-Payment-Customer-Session")).toBe(customerSession.token);
    expect(creation.headers.get("Idempotency-Key")).toHaveLength(36);
    expect(creation.body).toEqual({
      currency: "EUR",
      returnUrl: "https://shop.example/account/cards",
      consent: { type: "merchant_initiated_future_payments", accepted: true },
    });
    expect(navigate).toHaveBeenCalledWith("https://vault.example.test/card");
    expect(storage.serialized()).not.toContain(verificationToken);
  });

  test("status uses unexpired stored setup and customer sessions", async () => {
    const storage = await storedActiveFlow();
    stubLocation("https://shop.example/account/cards");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(succeeded));

    await expect(client(fetch, storage).cardSaving.status()).resolves.toEqual(succeeded);
    expect(request(fetch, 1).headers.get("Bu-Payment-Customer-Session")).toBe(
      customerSession.token,
    );
  });

  test("removes the verification secret from the address bar before exchange", async () => {
    const storage = new MemoryStorage();
    stubLocation("https://shop.example/account/cards");
    const startFetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(challenge, 201));
    await client(startFetch, storage)
      .cardSaving.returnUrl("https://shop.example/account/cards")
      .email("buyer@example.com")
      .consent(true)
      .currency("EUR")
      .start();
    const token = `bup_cvt_test_${"a".repeat(43)}`;
    stubLocation(
      `https://shop.example/account/cards?keep=1&bu_customer_verification_token=${token}`,
    );
    const replaceState = vi.fn();
    vi.stubGlobal("history", { state: { page: "cards" }, replaceState });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(customerSession, 201))
      .mockResolvedValueOnce(json(setup, 201))
      .mockResolvedValueOnce(json(succeeded));

    await client(fetch, storage).cardSaving.resume().completion;

    expect(replaceState).toHaveBeenCalledWith(
      { page: "cards" },
      "",
      "https://shop.example/account/cards?keep=1",
    );
  });

  test("confirms the complete provider query using both sessions", async () => {
    const storage = await storedActiveFlow();
    stubLocation("https://shop.example/account/cards?opaque=provider&status=untrusted");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(applicationSession, 201))
      .mockResolvedValueOnce(json(setup))
      .mockResolvedValueOnce(json(succeeded));

    const result = await client(fetch, storage).cardSaving.resume().completion;

    expect(result.status).toBe("succeeded");
    const confirmation = request(fetch, 1);
    expect(confirmation.path).toBe("/public/v1/payment-method-setups/setup_opaque/confirm");
    expect(confirmation.body).toEqual({ returnQuery: "?opaque=provider&status=untrusted" });
    expect(confirmation.headers.get("Bu-Payment-Customer-Session")).toBe(customerSession.token);
  });
});

async function storedActiveFlow(): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  stubLocation("https://shop.example/account/cards");
  const startFetch = vi
    .fn()
    .mockResolvedValueOnce(json(applicationSession, 201))
    .mockResolvedValueOnce(json(challenge, 201));
  await client(startFetch, storage)
    .cardSaving.currency("EUR")
    .email("buyer@example.com")
    .consent(true)
    .start();
  const token = `bup_cvt_test_${"a".repeat(43)}`;
  stubLocation(
    `https://shop.example/account/cards?bu_customer_verification_token=${token}`,
    vi.fn(),
  );
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json(applicationSession, 201))
    .mockResolvedValueOnce(json(customerSession, 201))
    .mockResolvedValueOnce(json(setup, 201))
    .mockResolvedValue(json(setup));
  const handle = client(fetch, storage).cardSaving.resume();
  await vi.waitFor(() => expect(storage.serialized()).toContain(setup.id));
  handle.cancel();
  await handle.completion.catch(() => undefined);
  return storage;
}

function client(fetch: ReturnType<typeof vi.fn>, storage: Storage) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    storage,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
}

function stubLocation(href: string, assign = vi.fn()) {
  const url = new URL(href);
  vi.stubGlobal("location", {
    href: url.href,
    origin: url.origin,
    search: url.search,
    hash: url.hash,
    assign,
  });
}

function request(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [input, init] = fetch.mock.calls[index] ?? [];
  return {
    path: new URL(String(input)).pathname,
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

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
  serialized() {
    return JSON.stringify([...this.values]);
  }
}

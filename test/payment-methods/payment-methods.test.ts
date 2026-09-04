import { describe, expect, test, vi } from "vitest";
import { createBuPaymentClient, type PaymentMethodSetup, type PresentationEvent } from "../../src";

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
    status: {
      method: "GET",
      url: "/public/v1/payment-method-setups/setup_opaque",
    },
    confirm: {
      method: "POST",
      url: "/public/v1/payment-method-setups/setup_opaque/confirm",
    },
  },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(fetch: ReturnType<typeof vi.fn>) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
}

describe("payment method setups", () => {
  test("polls and parses the exact canonical setup contract", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(
        json({
          id: "setup_opaque",
          status: "succeeded",
          expiresAt: "2030-01-01T00:30:00.000Z",
          actions: {
            status: {
              method: "GET",
              url: "/public/v1/payment-method-setups/setup_opaque",
            },
          },
          paymentMethod: {
            id: "pm_public",
            status: "active",
            brand: "visa",
            lastDigits: "4242",
            expiry: { month: 12, year: 2031 },
            createdAt: "2030-01-01T00:01:00.000Z",
            updatedAt: "2030-01-01T00:01:00.000Z",
          },
        }),
      );

    const result = await client(fetch).paymentMethods.getStatus("setup_opaque");

    expect(result.status).toBe("succeeded");
    expect(result.paymentMethod?.id).toBe("pm_public");
    expect(fetch.mock.calls[1]?.[0].toString()).toBe(
      "https://api.example.test/public/v1/payment-method-setups/setup_opaque",
    );
  });

  test("relays the opaque return query without parsing it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(pendingSetup));
    const returnQuery = "?transaction_id=untrusted&status=success&hash=untrusted";

    const result = await client(fetch).paymentMethods.confirm("setup_opaque", returnQuery);

    expect(result.status).toBe("requires_action");
    expect(JSON.parse(fetch.mock.calls[1]?.[1]?.body as string)).toEqual({ returnQuery });
  });

  test.each([
    { ...pendingSetup, providerTransactionId: "must-not-escape" },
    { ...pendingSetup, status: "complete" },
    { ...pendingSetup, presentation: { kind: "script", url: "https://evil.test/x.js" } },
    { ...pendingSetup, presentation: { ...pendingSetup.presentation, config: "alert(1)" } },
    {
      ...pendingSetup,
      presentation: { kind: "redirect", url: `https://vault.example/${"x".repeat(4090)}` },
    },
  ])("fails closed for malformed setup %#", async (malformed) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(malformed));

    await expect(client(fetch).paymentMethods.getStatus("setup_opaque")).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  test("opens a vault redirect but waits for canonical success", async () => {
    const succeeded = {
      id: "setup_opaque",
      status: "succeeded",
      expiresAt: "2030-01-01T00:30:00.000Z",
      actions: {
        status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
      },
      paymentMethod: {
        id: "pm_public",
        status: "active",
        createdAt: "2030-01-01T00:01:00.000Z",
        updatedAt: "2030-01-01T00:01:00.000Z",
      },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(succeeded));
    const navigate = vi.fn();
    const events: PresentationEvent[] = [];

    const handle = client(fetch).paymentMethods.present(pendingSetup, {
      navigate,
      pollIntervalMs: 0,
      onEvent: (event) => events.push(event),
    });

    expect(navigate).toHaveBeenCalledWith("https://vault.example.test/1.8.0/token");
    await expect(handle.completion).resolves.toMatchObject({ status: "succeeded" });
    expect(events.at(-1)).toEqual({
      type: "completed",
      flow: "payment_method_setup",
      status: "succeeded",
    });
  });

  test("resume relays an untrusted query then polls instead of trusting it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(pendingSetup))
      .mockResolvedValueOnce(
        json({
          id: "setup_opaque",
          status: "failed",
          expiresAt: "2030-01-01T00:30:00.000Z",
          actions: {
            status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
          },
        }),
      );
    const events: PresentationEvent[] = [];

    const handle = client(fetch).paymentMethods.resume("setup_opaque", {
      returnQuery: "?status=success&transaction_id=fake",
      pollIntervalMs: 0,
      onEvent: (event) => events.push(event),
    });

    await expect(handle.completion).resolves.toMatchObject({ status: "failed" });
    expect(events.map((event) => event.type)).toEqual([
      "opening",
      "callback_received",
      "confirming",
      "failed",
    ]);
    expect(events.some((event) => event.type === "completed")).toBe(false);
  });

  test("rejects an unsafe vault URL before navigation", () => {
    const navigate = vi.fn();
    const unsafe = {
      ...pendingSetup,
      presentation: { kind: "redirect", url: "javascript:alert(1)" },
    };

    expect(() =>
      client(vi.fn()).paymentMethods.present(unsafe as PaymentMethodSetup, { navigate }),
    ).toThrow(TypeError);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("accepts API-valid empty brand and integer expiry metadata", async () => {
    const succeeded = {
      id: "setup_opaque",
      status: "succeeded",
      expiresAt: "2030-01-01T00:30:00.000Z",
      actions: {
        status: { method: "GET", url: "/public/v1/payment-method-setups/setup_opaque" },
      },
      paymentMethod: {
        id: "pm_public",
        status: "active",
        brand: "",
        expiry: { month: 99, year: 1 },
        createdAt: "2030-01-01T00:01:00.000Z",
        updatedAt: "2030-01-01T00:01:00.000Z",
      },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(json(succeeded));

    await expect(client(fetch).paymentMethods.getStatus("setup_opaque")).resolves.toMatchObject({
      paymentMethod: { brand: "", expiry: { month: 99, year: 1 } },
    });
  });

  test("accepts an opaque setup reference longer than 200 characters", async () => {
    const reference = `setup_${"x".repeat(220)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session, 201))
      .mockResolvedValueOnce(
        json({
          id: reference,
          status: "processing",
          expiresAt: "2030-01-01T00:30:00.000Z",
          actions: {
            status: { method: "GET", url: `/public/v1/payment-method-setups/${reference}` },
          },
        }),
      );

    await expect(client(fetch).paymentMethods.getStatus(reference)).resolves.toMatchObject({
      id: reference,
    });
  });
});

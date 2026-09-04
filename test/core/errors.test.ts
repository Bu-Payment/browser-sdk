import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import {
  CapabilityDeniedError,
  CheckoutUnavailableError,
  CustomerSessionExpiredError,
  CustomerSessionMalformedError,
  CustomerSessionUnavailableError,
  CustomerVerificationInvalidError,
  errorFromResponse,
  IdempotencyConflictError,
  SessionInvalidError,
} from "../../src/errors";

describe("typed API errors", () => {
  it.each([
    [400, "customer_session_malformed", CustomerSessionMalformedError],
    [401, "customer_verification_invalid", CustomerVerificationInvalidError],
    [401, "customer_session_expired", CustomerSessionExpiredError],
    [503, "customer_session_unavailable", CustomerSessionUnavailableError],
  ])("maps customer error %s to its public type", async (status, code, ErrorType) => {
    const error = await errorFromResponse(
      Response.json({ error: code, message: code }, { status }),
    );

    expect(error).toBeInstanceOf(ErrorType);
  });

  it("maps capability denial without leaking request credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json({
          token: "secret-session-token",
          expiresAt: "2026-09-03T12:10:00.000Z",
          renewAfter: "2026-09-03T12:08:00.000Z",
          capabilities: ["checkout:create"],
        });
      }
      return Response.json(
        {
          statusCode: 403,
          error: "application_capability_denied",
          message: "missing capability",
          requestId: "7c38a433-15ce-42ce-8095-02c60fe66718",
          timestamp: "2026-09-03T12:00:00.000Z",
        },
        { status: 403 },
      );
    });
    const client = createBuPaymentClient({
      publishableKey: "secret-publishable-key",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const error = await client.catalogue
      .list()
      .get()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CapabilityDeniedError);
    expect(error).toMatchObject({ code: "application_capability_denied", status: 403 });
    expect(JSON.stringify(error)).not.toContain("secret-");
  });

  it("represents revoked, wrong-origin, and wrong-environment responses as session invalid", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          statusCode: 401,
          error: "application_session_invalid",
          message: "invalid",
          requestId: "7c38a433-15ce-42ce-8095-02c60fe66718",
          timestamp: "2026-09-03T12:00:00.000Z",
        },
        { status: 401 },
      ),
    );
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.list().get()).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it.each([
    [409, "idempotency_conflict", IdempotencyConflictError],
    [503, "checkout_unavailable", CheckoutUnavailableError],
  ])("maps HTTP %i %s to a domain error", async (status, code, ErrorType) => {
    let requestCount = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json({
          token: "session",
          expiresAt: "2026-09-03T12:10:00.000Z",
          renewAfter: "2026-09-03T12:08:00.000Z",
          capabilities: ["checkout:create"],
        });
      }
      requestCount += 1;
      return Response.json(
        {
          statusCode: status,
          error: code,
          message: code,
          requestId: "7c38a433-15ce-42ce-8095-02c60fe66718",
          timestamp: "2026-09-03T12:00:00.000Z",
        },
        { status },
      );
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const promise = client.checkout
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .create();

    await expect(promise).rejects.toBeInstanceOf(ErrorType);
    expect(requestCount).toBe(status === 503 ? 3 : 1);
  });
});

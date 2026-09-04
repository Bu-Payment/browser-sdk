import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";

describe("createBuPaymentClient", () => {
  it("rejects a base URL containing credentials, query, or fragment", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();

    expect(() =>
      createBuPaymentClient({
        publishableKey: "bup_pk_test_sample",
        apiBaseUrl: "https://user@example.test/api?secret=yes",
        fetch,
      }),
    ).toThrowError(/API base URL/);
  });

  it("allows HTTP only for loopback development APIs", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();

    expect(() =>
      createBuPaymentClient({
        publishableKey: "bup_pk_test_sample",
        apiBaseUrl: "http://api.example.test",
        fetch,
      }),
    ).toThrowError(/HTTPS or loopback/);
    expect(() =>
      createBuPaymentClient({
        publishableKey: "bup_pk_test_sample",
        apiBaseUrl: "http://127.0.0.1:3000",
        fetch,
      }),
    ).not.toThrow();
  });

  it("shares one session bootstrap across concurrent public requests", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/application-sessions")) {
        return Response.json(
          {
            token: "bup_bs_test_token",
            expiresAt: "2026-09-03T12:10:00.000Z",
            renewAfter: "2026-09-03T12:08:00.000Z",
            capabilities: ["catalogue:read", "checkout:create"],
          },
          { status: 201 },
        );
      }
      return Response.json({ data: [], nextCursor: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
      now: () => new Date("2026-09-03T12:00:00.000Z"),
    });

    await Promise.all([client.catalogue.list().get(), client.catalogue.listPrices()]);

    expect(
      fetch.mock.calls.filter(([input]) => String(input).endsWith("application-sessions")),
    ).toHaveLength(1);
    const bootstrapHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(bootstrapHeaders.has("Origin")).toBe(false);
    expect(fetch.mock.calls.every(([, init]) => init?.credentials === "omit")).toBe(true);
  });
});

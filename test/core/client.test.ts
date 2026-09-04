import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";

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

  it.each([
    ["", "https://api.example.test"],
    ["pk_test_wrong", "https://api.example.test"],
    ["bup_pk_test_valid", "ftp://api.example.test"],
    ["bup_pk_live_valid", "https://test.api.example.com"],
    ["bup_pk_test_valid", "https://live.api.example.com"],
  ])("reports invalid configuration without exposing values", (publishableKey, apiBaseUrl) => {
    let caught: unknown;
    try {
      createBuPaymentClient({ publishableKey, apiBaseUrl, fetch: vi.fn() });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BuPaymentError);
    expect(caught).toMatchObject({ code: ErrorCode.CONFIGURATION_INVALID });
    expect(JSON.stringify(caught)).not.toContain(publishableKey || "impossible-empty-secret");
  });

  it("normalizes raw configuration before issuing the application session", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.example.test/base/public/v1/application-sessions");
      expect(JSON.parse(String(init?.body))).toEqual({ publishableKey: "bup_pk_test_example" });
      return Response.json({
        token: "session",
        expiresAt: "2030-01-01T01:00:00.000Z",
        renewAfter: "2030-01-01T00:30:00.000Z",
        capabilities: ["catalogue:read"],
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "  bup_pk_test_example  ",
      apiBaseUrl: "https://api.example.test/base",
      fetch,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    await client.catalogue
      .list()
      .get()
      .catch(() => undefined);

    expect(fetch).toHaveBeenCalled();
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

    await Promise.all([client.catalogue.list().get(), client.catalogue.prices().get()]);

    expect(
      fetch.mock.calls.filter(([input]) => String(input).endsWith("application-sessions")),
    ).toHaveLength(1);
    const bootstrapHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(bootstrapHeaders.has("Origin")).toBe(false);
    expect(fetch.mock.calls.every(([, init]) => init?.credentials === "omit")).toBe(true);
  });
});

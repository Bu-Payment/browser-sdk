import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";

function session(token: string, renewAfter: string) {
  return {
    token,
    expiresAt: "2026-09-03T12:20:00.000Z",
    renewAfter,
    capabilities: ["catalogue:read", "checkout:create"],
  };
}

describe("browser application session renewal", () => {
  it("shares one early renewal across concurrent requests", async () => {
    let now = new Date("2026-09-03T12:00:00.000Z");
    let renewCalls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/application-sessions")) {
        return Response.json(session("initial", "2026-09-03T12:08:00.000Z"), { status: 201 });
      }
      if (path.endsWith("/application-sessions/renew")) {
        renewCalls += 1;
        expect(new Headers(init?.headers).get("Bu-Payment-Session")).toBe("initial");
        return Response.json(session("renewed", "2026-09-03T12:18:00.000Z"), { status: 201 });
      }
      expect(new Headers(init?.headers).get("Bu-Payment-Session")).toBe(
        now.getTime() >= Date.parse("2026-09-03T12:08:00.000Z") ? "renewed" : "initial",
      );
      return Response.json({ data: [], nextCursor: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
      now: () => now,
    });
    await client.catalogue.list().get();
    now = new Date("2026-09-03T12:08:00.000Z");

    await Promise.all([client.catalogue.list().get(), client.catalogue.prices().get()]);

    expect(renewCalls).toBe(1);
  });

  it("bootstraps again when another actor already rotated the source token", async () => {
    let now = new Date("2026-09-03T12:00:00.000Z");
    let issueCalls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/application-sessions/renew")) {
        return Response.json(
          {
            statusCode: 409,
            error: "application_session_rotated",
            message: "rotated",
            requestId: "7c38a433-15ce-42ce-8095-02c60fe66718",
            timestamp: "2026-09-03T12:08:00.000Z",
          },
          { status: 409 },
        );
      }
      if (path.endsWith("/application-sessions")) {
        issueCalls += 1;
        return Response.json(
          session(
            issueCalls === 1 ? "initial" : "replacement",
            issueCalls === 1 ? "2026-09-03T12:08:00.000Z" : "2026-09-03T12:18:00.000Z",
          ),
          { status: 201 },
        );
      }
      return Response.json({ data: [], nextCursor: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
      now: () => now,
    });
    await client.catalogue.list().get();
    now = new Date("2026-09-03T12:10:00.000Z");

    await client.catalogue.list().get();

    expect(issueCalls).toBe(2);
  });

  it("recovers when a protected request observes expiration before renewAfter", async () => {
    let issueCalls = 0;
    let catalogueCalls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/application-sessions")) {
        issueCalls += 1;
        return Response.json(
          session(issueCalls === 1 ? "initial" : "replacement", "2026-09-03T12:08:00.000Z"),
          { status: 201 },
        );
      }
      catalogueCalls += 1;
      if (new Headers(init?.headers).get("Bu-Payment-Session") === "initial") {
        return Response.json(
          {
            statusCode: 401,
            error: "application_session_expired",
            message: "expired",
            requestId: "7c38a433-15ce-42ce-8095-02c60fe66718",
            timestamp: "2026-09-03T12:00:00.000Z",
          },
          { status: 401 },
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

    await client.catalogue.list().get();

    expect(issueCalls).toBe(2);
    expect(catalogueCalls).toBe(2);
  });

  it("fails closed when session timestamps are malformed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        token: "session",
        expiresAt: "not-a-date",
        renewAfter: "also-not-a-date",
        capabilities: ["catalogue:read"],
      }),
    );
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.list().get()).rejects.toMatchObject({ code: "response_invalid" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not let one caller abort a shared bootstrap for other callers", async () => {
    const controller = new AbortController();
    let resolveBootstrap: ((response: Response) => void) | undefined;
    const bootstrap = new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        if (init?.signal) {
          return new Promise<Response>((resolve, reject) => {
            bootstrap.then(resolve, reject);
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          });
        }
        return bootstrap;
      }
      return Response.json({ data: [], nextCursor: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const aborted = client.catalogue.list().signal(controller.signal).get();
    const active = client.catalogue.list().get();
    const cause = new DOMException("cancelled", "AbortError");
    controller.abort(cause);
    resolveBootstrap?.(
      Response.json(session("shared", "2026-09-03T12:08:00.000Z"), { status: 201 }),
    );

    await expect(aborted).rejects.toMatchObject({
      code: ErrorCode.OPERATION_CANCELLED,
      cause,
    });
    await expect(active).resolves.toEqual({
      products: [],
      pagination: { nextCursor: null },
    });
    expect(
      fetch.mock.calls.filter(([input]) => String(input).endsWith("application-sessions")),
    ).toHaveLength(1);
  });
});

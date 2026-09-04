import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  CheckoutClient,
  CheckoutPresentationBuilder,
  CheckoutResumeBuilder,
  CheckoutStatusBuilder,
} from "../../src/checkout/client";
import type { CheckoutLifecycle } from "../../src/checkout/types";
import { createBuPaymentClient } from "../../src/client";
import type { PresentationHandle } from "../../src/presentation/types";

const session = {
  token: "session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};

const checkout = {
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
} as const;

const completed = {
  reference: "checkout_public",
  type: "payment",
  status: "completed",
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
  },
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:01:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
} as const;

function createFetch() {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
      return Response.json(session);
    }
    return Response.json(completed);
  });
}

describe("checkout operation builders", () => {
  it("gets canonical status from an immutable builder", async () => {
    const fetch = createFetch();
    const controller = new AbortController();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const base = client.checkout.status("opaque/reference");
    const signalled = base.signal(controller.signal);

    await expect(signalled.get()).resolves.toMatchObject({ status: "completed" });
    expect(base).not.toBe(signalled);
    expect(Object.isFrozen(base)).toBe(true);
    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).pathname).toContain("opaque%2Freference");
    expect(fetch.mock.calls.at(-1)?.[1]?.signal).toBe(controller.signal);
  });

  it("starts a configured presentation and exposes canonical completion", async () => {
    const fetch = createFetch();
    const navigate = vi.fn();
    const events: string[] = [];
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const base = client.checkout.presentation(checkout);
    const configured = base
      .navigate(navigate)
      .pollIntervalMs(0)
      .timeoutMs(1_000)
      .onEvent((event) => events.push(event.type));

    const handle = configured.start();

    await expect(handle.completion).resolves.toMatchObject({ status: "completed" });
    expect(base).not.toBe(configured);
    expect(Object.isFrozen(base)).toBe(true);
    expect(navigate).toHaveBeenCalledWith("https://pay.example.test/session");
    expect(events).toEqual(["opening", "opened", "completed"]);
  });

  it("resumes by explicit reference and keeps cancellation on the returned handle", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json(session);
      }
      return new Promise<Response>(() => undefined);
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const handle = client.checkout.resume().reference("checkout_public").pollIntervalMs(0).start();

    handle.cancel();

    await expect(handle.completion).rejects.toMatchObject({ name: "AbortError" });
  });

  it("exports precise terminal result types and no imperative operations", () => {
    type StatusResult = ReturnType<CheckoutStatusBuilder["get"]>;
    type PresentationResult = ReturnType<CheckoutPresentationBuilder["start"]>;
    type ResumeResult = ReturnType<CheckoutResumeBuilder["start"]>;

    expectTypeOf<StatusResult>().toEqualTypeOf<Promise<CheckoutLifecycle>>();
    expectTypeOf<PresentationResult>().toEqualTypeOf<PresentationHandle<CheckoutLifecycle>>();
    expectTypeOf<ResumeResult>().toEqualTypeOf<PresentationHandle<CheckoutLifecycle>>();
    expectTypeOf<"getStatus" extends keyof CheckoutClient ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"present" extends keyof CheckoutClient ? true : false>().toEqualTypeOf<false>();

    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
    });
    expect(client.checkout).not.toHaveProperty("getStatus");
    expect(client.checkout).not.toHaveProperty("present");
    expect(client.checkout).not.toHaveProperty("redirect");
  });
});

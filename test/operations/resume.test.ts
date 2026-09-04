import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode, OperationKind } from "../../src/constants";
import { parseClientConfig } from "../../src/core/config";
import { createPresentationResumeStore } from "../../src/presentation/resume-store";

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

const session = {
  token: "session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const challenge = {
  reference: `bup_cec_test_${"a".repeat(43)}`,
  expiresAt: "2030-01-01T00:10:00.000Z",
};
const completed = {
  reference: "checkout_public",
  type: "payment",
  status: "completed",
  actions: { status: { method: "GET", url: "/public/v1/checkouts/checkout_public" } },
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:01:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("operation resumption", () => {
  it("returns undefined when no operation is pending", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
      storage: new MemoryStorage(),
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(client.operations.resume()).toBeUndefined();
  });

  it("scrubs an email verification query before network work and routes card saving", async () => {
    const storage = new MemoryStorage();
    const replaceState = vi.fn();
    let locationHref = "https://shop.example.test/return";
    vi.stubGlobal("location", {
      get href() {
        return locationHref;
      },
      get origin() {
        return "https://shop.example.test";
      },
      get search() {
        return new URL(locationHref).search;
      },
      assign: vi.fn(),
    });
    vi.stubGlobal("history", {
      state: null,
      replaceState: vi.fn((_state, _title, href: string) => {
        replaceState(href);
        locationHref = href;
      }),
    });
    let challengeStarted = false;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (locationHref.includes("bu_customer_verification_token")) {
        throw new Error("query was not scrubbed before fetch");
      }
      const path = new URL(String(input)).pathname;
      if (path.endsWith("application-sessions")) return Response.json(session);
      if (path.endsWith("customer-email-challenges")) {
        challengeStarted = true;
        return Response.json(challenge);
      }
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    await client.cardSaving.email("buyer@example.com").currency("EUR").consent(true).start();
    expect(challengeStarted).toBe(true);
    locationHref = `https://shop.example.test/return?bu_customer_verification_token=bup_cvt_test_${"b".repeat(43)}`;

    const operation = client.operations.resume();

    expect(operation?.kind).toBe(OperationKind.CARD_SAVING);
    expect(locationHref).toBe("https://shop.example.test/return");
    expect(replaceState).toHaveBeenCalledTimes(1);
    operation?.cancel();
    await expect(operation?.completion).rejects.toMatchObject({
      code: ErrorCode.OPERATION_CANCELLED,
    });
  });

  it("scrubs an owned verification query when recovery state is missing", async () => {
    const replaceState = vi.fn();
    let locationHref = `https://shop.example.test/return?bu_customer_verification_token=bup_cvt_test_${"b".repeat(43)}`;
    vi.stubGlobal("location", {
      get href() {
        return locationHref;
      },
      get search() {
        return new URL(locationHref).search;
      },
    });
    vi.stubGlobal("history", {
      state: null,
      replaceState: vi.fn((_state, _title, href: string) => {
        replaceState(href);
        locationHref = href;
      }),
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
      storage: new MemoryStorage(),
    });

    const operation = client.operations.resume();

    expect(locationHref).toBe("https://shop.example.test/return");
    expect(replaceState).toHaveBeenCalledTimes(1);
    await expect(operation?.completion).rejects.toMatchObject({ code: ErrorCode.RESUME_FAILED });
  });

  it("routes a stored checkout and deduplicates concurrent resume calls", async () => {
    const storage = new MemoryStorage();
    const now = () => new Date("2030-01-01T00:00:00.000Z");
    createPresentationResumeStore(
      parseClientConfig({
        publishableKey: "bup_pk_test_example",
        apiBaseUrl: "https://api.example.test",
      }),
      storage,
      now,
    ).save("checkout", "checkout_public", "2030-01-01T00:30:00.000Z");
    const responses = [session, completed];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()));
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      storage,
      now,
    });

    const first = client.operations.resume();
    const second = client.operations.resume();

    expect(first).toBe(second);
    expect(first?.kind).toBe(OperationKind.CHECKOUT);
    await expect(first?.completion).resolves.toMatchObject({ status: "completed" });
    expect(storage.length).toBe(0);
  });

  it("does not expose legacy domain resume methods", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
      storage: new MemoryStorage(),
    });

    expect(client.checkout).not.toHaveProperty("resume");
    expect(client.cardSaving).not.toHaveProperty("resume");
  });
});

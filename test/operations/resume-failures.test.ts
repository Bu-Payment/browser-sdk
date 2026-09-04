import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardSavingOperations } from "../../src/card-saving/client";
import type { CheckoutOperations } from "../../src/checkout/client";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode, OperationKind } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";
import { createOperationsClient } from "../../src/operations/client";

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
    return [...this.values.values()].join("\n");
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("operation resume failures", () => {
  it("returns a rejected card-saving handle for a malformed verification token", async () => {
    const token = "malformed-verification-token";
    const storage = new MemoryStorage();
    let locationHref = `https://shop.example.test/return?bu_customer_verification_token=${token}`;
    vi.stubGlobal(
      "location",
      location(locationHref, () => locationHref),
    );
    vi.stubGlobal("history", {
      state: null,
      replaceState: vi.fn((_state, _title, href: string) => {
        locationHref = href;
      }),
    });
    const client = clientWith(storage, vi.fn());

    const operation = client.operations.resume();

    expect(operation?.kind).toBe(OperationKind.CARD_SAVING);
    expect(locationHref).toBe("https://shop.example.test/return");
    await expect(operation?.completion).rejects.toMatchObject({
      name: "BuPaymentError",
      code: ErrorCode.RESUME_INVALID,
    });
    expect(storage.serialized()).not.toContain(token);
  });

  it("returns a safe rejected handle when a sensitive query cannot be scrubbed", async () => {
    const token = `bup_cvt_test_${"s".repeat(43)}`;
    const storage = new MemoryStorage();
    const fetch = vi.fn();
    const locationHref = `https://shop.example.test/return?bu_customer_verification_token=${token}`;
    vi.stubGlobal(
      "location",
      location(locationHref, () => locationHref),
    );
    vi.stubGlobal("history", {});
    const client = clientWith(storage, fetch);

    const operation = client.operations.resume();

    expect(operation?.kind).toBe(OperationKind.CARD_SAVING);
    const failure = await operation?.completion.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BuPaymentError);
    expect(failure).toMatchObject({ code: ErrorCode.RESUME_FAILED });
    expect(JSON.stringify(failure)).not.toContain(token);
    expect(storage.serialized()).not.toContain(token);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("converts a card-saving identification failure and reuses its active handle", async () => {
    const token = `bup_cvt_test_${"i".repeat(43)}`;
    let locationHref = `https://shop.example.test/return?bu_customer_verification_token=${token}`;
    vi.stubGlobal(
      "location",
      location(locationHref, () => locationHref),
    );
    vi.stubGlobal("history", {
      state: null,
      replaceState: vi.fn((_state, _title, href: string) => {
        locationHref = href;
      }),
    });
    const failure = new TypeError("card-saving state unavailable");
    const operations = createOperationsClient(
      checkoutOperations(() => undefined),
      cardSavingOperations(() => {
        throw failure;
      }),
    );

    const first = operations.resume();
    const second = operations.resume();

    expect(first).toBe(second);
    expect(first?.kind).toBe(OperationKind.CARD_SAVING);
    expect(locationHref).toBe("https://shop.example.test/return");
    await expect(first?.completion).rejects.toMatchObject({ code: ErrorCode.RESUME_FAILED });
  });

  it("converts a synchronous checkout resume failure", async () => {
    const operations = createOperationsClient(
      checkoutOperations(() => {
        throw new BuPaymentError("checkout state unavailable", {
          code: ErrorCode.VALIDATION_FAILED,
        });
      }),
      cardSavingOperations(() => false),
    );

    const operation = operations.resume();

    expect(operation?.kind).toBe(OperationKind.CHECKOUT);
    await expect(operation?.completion).rejects.toMatchObject({ code: ErrorCode.RESUME_FAILED });
  });
});

function clientWith(storage: Storage, fetch: typeof globalThis.fetch) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    storage,
  });
}

function location(initialHref: string, currentHref: () => string) {
  return {
    get href() {
      return currentHref();
    },
    get origin() {
      return new URL(initialHref).origin;
    },
    get search() {
      return new URL(currentHref()).search;
    },
    assign: vi.fn(),
  };
}

function checkoutOperations(resume: CheckoutOperations["resume"]): CheckoutOperations {
  return { client: Object.freeze({}) as CheckoutOperations["client"], resume };
}

function cardSavingOperations(canResume: CardSavingOperations["canResume"]): CardSavingOperations {
  return {
    client: Object.freeze({}) as CardSavingOperations["client"],
    canResume,
    resume: () => {
      throw new TypeError("unexpected card-saving resume");
    },
  };
}

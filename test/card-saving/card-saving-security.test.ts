import { afterEach, describe, expect, test, vi } from "vitest";
import { createBuPaymentClient } from "../../src";

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

afterEach(() => vi.unstubAllGlobals());

describe("card saving state security", () => {
  test("rejects a malformed customer session before persisting or creating a setup", async () => {
    const storage = new MemoryStorage();
    location("https://shop.example/cards");
    await sdk(
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(applicationSession, { status: 201 }))
        .mockResolvedValueOnce(Response.json(challenge, { status: 201 })),
      storage,
    )
      .cardSaving.email("buyer@example.com")
      .currency("EUR")
      .consent(true)
      .start();
    const token = `bup_cvt_test_${"a".repeat(43)}`;
    location(`https://shop.example/cards?bu_customer_verification_token=${token}`);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(applicationSession, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json(
          { token: "not-a-customer-session", expiresAt: "2030-01-01T00:20:00.000Z" },
          { status: 201 },
        ),
      );

    await expect(sdk(fetch, storage).operations.resume()?.completion).rejects.toMatchObject({
      code: "response_invalid",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(storage.serialized()).not.toContain("not-a-customer-session");
  });

  test("scrubs and rejects an expired verification return without a request", async () => {
    const storage = new MemoryStorage();
    location("https://shop.example/cards");
    const startFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(applicationSession, { status: 201 }))
      .mockResolvedValueOnce(Response.json(challenge, { status: 201 }));
    await sdk(startFetch, storage)
      .cardSaving.email("buyer@example.com")
      .currency("EUR")
      .consent(true)
      .start();
    const token = `bup_cvt_test_${"a".repeat(43)}`;
    location(`https://shop.example/cards?bu_customer_verification_token=${token}`);
    const fetch = vi.fn();

    await expect(
      sdk(fetch, storage, "2030-01-01T00:11:00.000Z").operations.resume()?.completion,
    ).rejects.toMatchObject({ code: "resume_failed" });
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

function sdk(fetch: ReturnType<typeof vi.fn>, storage: Storage, now = "2030-01-01T00:00:00.000Z") {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    storage,
    now: () => new Date(now),
  });
}

function location(href: string) {
  const url = new URL(href);
  vi.stubGlobal("location", {
    href: url.href,
    origin: url.origin,
    search: url.search,
    hash: url.hash,
    assign: vi.fn(),
  });
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
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

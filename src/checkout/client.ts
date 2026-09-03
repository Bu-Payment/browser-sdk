import type { HttpClient } from "../core/http";
import type { CheckoutCreated, CheckoutLifecycle, CreateCheckoutInput } from "./types";
import {
  parseCheckoutCreated,
  parseCheckoutLifecycle,
  parseCreateCheckoutInput,
} from "./validation";

export interface CheckoutRequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface CheckoutClient {
  create(input: CreateCheckoutInput, options?: CheckoutRequestOptions): Promise<CheckoutCreated>;
  getStatus(reference: string, options?: { signal?: AbortSignal }): Promise<CheckoutLifecycle>;
  redirect(checkout: CheckoutCreated, navigate?: (url: string) => void): void;
}

export function createCheckoutClient(http: HttpClient): CheckoutClient {
  return {
    async create(input, options = {}) {
      const body = parseCreateCheckoutInput(input);
      const idempotencyKey = options.idempotencyKey ?? generateIdempotencyKey();
      assertIdempotencyKey(idempotencyKey);
      const value = await http.request("public/v1/checkouts", {
        method: "POST",
        body,
        idempotencyKey,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return parseCheckoutCreated(value);
    },
    async getStatus(reference, options = {}) {
      if (!reference) throw new TypeError("Checkout reference must not be empty");
      const value = await http.request(`public/v1/checkouts/${encodeURIComponent(reference)}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return parseCheckoutLifecycle(value);
    },
    redirect(checkout, navigate = defaultNavigate) {
      if (checkout.presentation.kind !== "redirect") {
        throw new TypeError("Checkout presentation is not a redirect");
      }
      const url = new URL(checkout.presentation.url);
      if (url.protocol !== "https:") throw new TypeError("Checkout redirect must use HTTPS");
      navigate(url.href);
    },
  };
}

function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("crypto.randomUUID is required to generate an idempotency key");
  }
  return globalThis.crypto.randomUUID();
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 16 || value.length > 200 || !/^[!-~]+$/.test(value)) {
    throw new TypeError("Idempotency key must be 16 to 200 printable ASCII characters");
  }
}

function defaultNavigate(url: string): void {
  globalThis.location.assign(url);
}

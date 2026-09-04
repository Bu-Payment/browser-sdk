import type { HttpClient } from "../core/http";
import { asObject, asString, assertExactKeys } from "../core/validation";
import { parsePaymentMethodSetup } from "../payment-methods/validation";
import { createPresentationHandle } from "../presentation/handle";
import { pollCanonical } from "../presentation/poll";
import { type CardSavingStartState, createCardSavingBuilders } from "./builders";
import type { CardSavingStore, ChallengeState } from "./store";
import type { CardSavingChallenge, CardSavingClient } from "./types";

const verificationParameter = "bu_customer_verification_token";
const terminals = new Set(["succeeded", "failed", "expired"]);
const successes = new Set(["succeeded"]);

export function createCardSavingClient(http: HttpClient, store: CardSavingStore): CardSavingClient {
  const getStatus = async (signal?: AbortSignal) => {
    const setup = requiredSetup(store);
    const customer = requiredCustomer(store);
    const value = await http.request(path(setup.reference), {
      customerSessionToken: customer.token,
      ...(signal ? { signal } : {}),
    });
    return parsePaymentMethodSetup(value);
  };
  return createCardSavingBuilders({
    start: (input) => start(http, store, input),
    status: () => getStatus(),
    resume: () =>
      createPresentationHandle("payment_method_resume", {}, async (signal, emit) => {
        const search = browserLocation().search;
        const verificationToken = new URLSearchParams(search).get(verificationParameter);
        if (verificationToken !== null) {
          assertVerificationToken(verificationToken);
          removeVerificationToken();
          const setup = await verifyAndCreate(http, store, verificationToken, signal);
          store.saveSetup({ reference: setup.id, expiresAt: setup.expiresAt });
          if (setup.status === "requires_action" && setup.presentation) {
            defaultNavigate(safeRedirect(setup.presentation.url));
            emit({ type: "opened" });
          }
        }
        if (verificationToken === null && search) {
          emit({ type: "callback_received" });
          emit({ type: "confirming" });
          await confirm(http, store, search, signal);
        }
        const result = await pollCanonical(
          getStatus,
          signal,
          emit,
          terminals,
          successes,
          undefined,
        );
        if (terminals.has(result.status)) store.clearSetup();
        return result;
      }),
  });
}

async function start(
  http: HttpClient,
  store: CardSavingStore,
  input: CardSavingStartState,
): Promise<CardSavingChallenge> {
  const body = parseStartInput(input);
  const request = challengeRequestSignal(input.signal, input.timeoutMs);
  let value: unknown;
  try {
    value = await http.request("public/v1/customer-email-challenges", {
      method: "POST",
      body,
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } finally {
    request.cleanup();
  }
  const response = parseChallenge(value);
  store.clearCustomer();
  store.clearSetup();
  store.saveChallenge({
    reference: response.reference,
    expiresAt: response.expiresAt,
    currency: body.currency,
    returnUrl: body.returnUrl,
  });
  return { expiresAt: response.expiresAt };
}

function challengeRequestSignal(signal?: AbortSignal, timeoutMs?: number) {
  if (timeoutMs === undefined) return { signal, cleanup: () => undefined };
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive number");
  }
  const controller = new AbortController();
  const externalAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", externalAbort, { once: true });
  if (signal?.aborted) externalAbort();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Card saving start timed out", "TimeoutError")),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", externalAbort);
    },
  };
}

async function verifyAndCreate(
  http: HttpClient,
  store: CardSavingStore,
  verificationToken: string,
  signal: AbortSignal,
) {
  const challenge = requiredChallenge(store);
  let customer = store.readCustomer();
  if (!customer) {
    const value = await http.request(
      `public/v1/customer-email-challenges/${encodeURIComponent(challenge.reference)}/verify`,
      { method: "POST", body: { verificationToken }, signal },
    );
    customer = parseCustomerSession(value);
    store.saveCustomer(customer);
  }
  const idempotencyKey = challenge.idempotencyKey ?? generateIdempotencyKey();
  if (!challenge.idempotencyKey) store.saveChallenge({ ...challenge, idempotencyKey });
  const value = await http.request("public/v1/payment-method-setups", {
    method: "POST",
    customerSessionToken: customer.token,
    idempotencyKey,
    signal,
    body: {
      currency: challenge.currency,
      returnUrl: challenge.returnUrl,
      consent: { type: "merchant_initiated_future_payments", accepted: true },
    },
  });
  const setup = parsePaymentMethodSetup(value);
  store.clearChallenge();
  return setup;
}

async function confirm(
  http: HttpClient,
  store: CardSavingStore,
  returnQuery: string,
  signal: AbortSignal,
) {
  if (returnQuery.length > 8_192) throw new TypeError("Return query is too long");
  const setup = requiredSetup(store);
  const customer = requiredCustomer(store);
  const value = await http.request(`${path(setup.reference)}/confirm`, {
    method: "POST",
    body: { returnQuery },
    customerSessionToken: customer.token,
    signal,
  });
  return parsePaymentMethodSetup(value);
}

function parseStartInput(input: CardSavingStartState) {
  if (!input || typeof input !== "object") throw new TypeError("Card saving input is required");
  if (input.consent !== true) throw new TypeError("Explicit card saving consent is required");
  const email = input.email?.trim();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new TypeError("A valid email is required");
  }
  const currency = input.currency?.toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/u.test(currency)) throw new TypeError("Currency must be a three-letter code");
  const location = browserLocation();
  const returnUrl = new URL(input.returnUrl ?? location.href);
  if (returnUrl.origin !== location.origin || !/^https?:$/u.test(returnUrl.protocol)) {
    throw new TypeError("Card saving return URL must use the current origin");
  }
  if (!input.returnUrl) {
    returnUrl.search = "";
    returnUrl.hash = "";
  }
  return { email, currency, returnUrl: returnUrl.href };
}

function parseChallenge(value: unknown) {
  const object = asObject(value, "Customer email challenge");
  assertExactKeys(object, ["reference", "expiresAt"], "Customer email challenge");
  const reference = asString(object.reference, "reference");
  if (!/^bup_cec_(?:live|test)_[A-Za-z0-9_-]{43}$/u.test(reference)) {
    throw new TypeError("Customer email challenge reference is invalid");
  }
  return { reference, expiresAt: date(object.expiresAt) };
}

function parseCustomerSession(value: unknown) {
  const object = asObject(value, "Customer session");
  assertExactKeys(object, ["token", "expiresAt"], "Customer session");
  const token = asString(object.token, "token");
  if (!/^bup_cs_(?:live|test)_[A-Za-z0-9_-]{43}$/u.test(token)) {
    throw new TypeError("Customer session token is invalid");
  }
  return { token, expiresAt: date(object.expiresAt) };
}

function date(value: unknown): string {
  const result = asString(value, "expiresAt");
  if (Number.isNaN(Date.parse(result))) throw new TypeError("expiresAt must be a date-time");
  return result;
}

function requiredChallenge(store: CardSavingStore): ChallengeState {
  const state = store.readChallenge();
  if (!state) throw new TypeError("No pending card saving verification was found");
  return state;
}

function requiredCustomer(store: CardSavingStore) {
  const state = store.readCustomer();
  if (!state) throw new TypeError("No active card saving customer session was found");
  return state;
}

function requiredSetup(store: CardSavingStore) {
  const state = store.readSetup();
  if (!state) throw new TypeError("No resumable card saving setup was found");
  return state;
}

function assertVerificationToken(value: string): void {
  if (!/^bup_cvt_(?:live|test)_[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new TypeError("Customer verification token is invalid");
  }
}

function removeVerificationToken(): void {
  const location = browserLocation();
  const url = new URL(location.href);
  url.searchParams.delete(verificationParameter);
  if (typeof globalThis.history?.replaceState === "function") {
    globalThis.history.replaceState(globalThis.history.state, "", url.href);
  }
}

function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new TypeError("crypto.randomUUID is required to save a card");
  }
  return globalThis.crypto.randomUUID();
}

function browserLocation(): Location {
  if (!globalThis.location) throw new TypeError("A browser location is required for card saving");
  return globalThis.location;
}

function safeRedirect(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TypeError("Card saving redirect must use HTTPS without credentials or fragment");
  }
  return url.href;
}

function defaultNavigate(url: string): void {
  globalThis.location.assign(url);
}

function path(reference: string): string {
  return `public/v1/payment-method-setups/${encodeURIComponent(reference)}`;
}

import { ErrorCode } from "../constants";
import type { HttpClient } from "../core/http";
import { BuPaymentError, toBuPaymentError } from "../errors";
import type { OperationHandle, OperationOptions } from "../operations/types";
import type { EmitPresentationEvent } from "../presentation/handle";
import { createPresentationHandle } from "../presentation/handle";
import { pollCanonical } from "../presentation/poll";
import type { PresentationResumeStore } from "../presentation/resume-store";
import { presentationSingleFlight } from "../presentation/single-flight";
import { type CheckoutClient, createCheckoutBuilders } from "./builders";
import type { CheckoutIdempotency } from "./idempotency-store";
import { runModal } from "./modal-runtime";
import { internalCheckout, publicCheckout, publicCheckoutResult } from "./public";
import type {
  CheckoutCreated,
  CheckoutLifecycle,
  CheckoutResult,
  CreateCheckoutInput,
} from "./types";
import {
  parseCheckoutCreated,
  parseCheckoutLifecycle,
  parseCreateCheckoutInput,
} from "./validation";

export type {
  CheckoutBuilder,
  CheckoutClient,
  CheckoutOpenBuilder,
  CheckoutReadyBuilder,
  CheckoutStatusBuilder,
} from "./builders";

export interface CheckoutOperations {
  client: CheckoutClient;
  resume(options?: OperationOptions): OperationHandle<CheckoutResult> | undefined;
}

export function createCheckoutOperations(
  http: HttpClient,
  resumeStore?: PresentationResumeStore,
  idempotency?: CheckoutIdempotency,
): CheckoutOperations {
  const flights = new Map<string, OperationHandle<CheckoutResult>>();
  const getStatus = async (reference: string, signal?: AbortSignal) => {
    if (!reference) throw validationError("Checkout reference must not be empty");
    const value = await http.request(`public/v1/checkouts/${encodeURIComponent(reference)}`, {
      ...(signal ? { signal } : {}),
    });
    try {
      return parseCheckoutLifecycle(value);
    } catch (error) {
      throw toBuPaymentError(error, ErrorCode.RESPONSE_INVALID, "Checkout response is invalid");
    }
  };

  const run = async (
    checkout: CheckoutCreated | CheckoutLifecycle,
    signal: AbortSignal,
    emit: EmitPresentationEvent,
    options: OperationOptions,
    handle: () => OperationHandle<CheckoutResult>,
  ): Promise<CheckoutResult> => {
    if (
      !checkout.presentation ||
      (checkout.status !== "pending" && checkout.status !== "processing")
    ) {
      throw validationError("Checkout does not have an active operation");
    }
    resumeStore?.save("checkout", checkout.reference, checkout.expiresAt);
    if (checkout.presentation.kind === "redirect") {
      (options.navigate ?? defaultNavigate)(validateRedirectUrl(checkout.presentation.url));
      emit({ type: "opened" });
      return publicCheckoutResult(
        await pollCheckout(getStatus, checkout.reference, signal, emit, options.pollIntervalMs),
      );
    }
    const document = globalThis.document;
    if (!document) throw validationError("A browser document is required for modal operations");
    const result = await runModal({
      http,
      checkout,
      presentation: checkout.presentation,
      document,
      signal,
      emit,
      ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
      cancel: () => handle().cancel(),
      poll: (pollSignal, pollEmit) =>
        pollCheckout(getStatus, checkout.reference, pollSignal, pollEmit, options.pollIntervalMs),
    });
    return publicCheckoutResult(result);
  };

  const openInternal = (checkout: CheckoutCreated, options: OperationOptions) =>
    presentationSingleFlight(flights, checkout.reference, () => {
      let handle: OperationHandle<CheckoutResult>;
      handle = createPresentationHandle("checkout_redirect", options, (signal, emit) =>
        run(checkout, signal, emit, options, () => handle),
      );
      return clearOnSuccess(resumeStore, handle);
    });

  const client = createCheckoutBuilders({
    create: async (input, signal) =>
      publicCheckout(
        await runCreate(idempotency, input, (idempotencyKey) =>
          createCheckout(http, input, idempotencyKey, signal),
        ),
      ),
    getStatus: async (reference, signal) =>
      publicCheckoutResult(await getStatus(reference, signal)),
    open: (checkout, options) => {
      const parsed = internalCheckout(checkout);
      if (!parsed) throw validationError("Checkout must be returned by this SDK client");
      return openInternal(parsed, options);
    },
    start: (input, options) => {
      let handle: OperationHandle<CheckoutResult>;
      handle = createPresentationHandle("checkout_redirect", options, async (signal, emit) => {
        const checkout = await runCreate(idempotency, input, (idempotencyKey) =>
          createCheckout(http, input, idempotencyKey, signal),
        );
        return run(checkout, signal, emit, options, () => handle);
      });
      return handle;
    },
  });

  return {
    client,
    resume(options = {}) {
      const reference = resumeStore?.read("checkout")?.reference;
      if (!reference) return undefined;
      return presentationSingleFlight(flights, reference, () => {
        let handle: OperationHandle<CheckoutResult>;
        handle = createPresentationHandle("checkout_resume", options, async (signal, emit) => {
          const current = await getStatus(reference, signal);
          if (checkoutTerminals.has(current.status)) return publicCheckoutResult(current);
          return run(current, signal, emit, options, () => handle);
        });
        return clearOnSuccess(resumeStore, handle);
      });
    },
  };
}

export function createCheckoutClient(
  http: HttpClient,
  resumeStore?: PresentationResumeStore,
): CheckoutClient {
  return createCheckoutOperations(http, resumeStore).client;
}

function clearOnSuccess(
  store: PresentationResumeStore | undefined,
  handle: OperationHandle<CheckoutResult>,
): OperationHandle<CheckoutResult> {
  handle.completion.then(
    () => store?.clear("checkout"),
    () => undefined,
  );
  return handle;
}

const checkoutTerminals = new Set(["completed", "failed", "expired", "cancelled"]);
const checkoutSuccess = new Set(["completed"]);

function pollCheckout(
  getStatus: (reference: string, signal?: AbortSignal) => Promise<CheckoutLifecycle>,
  reference: string,
  signal: AbortSignal,
  emit: Parameters<typeof pollCanonical>[2],
  interval?: number,
) {
  return pollCanonical(
    (requestSignal) => getStatus(reference, requestSignal),
    signal,
    emit,
    checkoutTerminals,
    checkoutSuccess,
    interval,
  );
}

function validateRedirectUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw validationError("Checkout redirect must use HTTPS without credentials or fragment");
  }
  return url.href;
}

async function createCheckout(
  http: HttpClient,
  input: CreateCheckoutInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CheckoutCreated> {
  let body: CreateCheckoutInput;
  try {
    body = parseCreateCheckoutInput(input);
  } catch (error) {
    throw toBuPaymentError(error, ErrorCode.VALIDATION_FAILED, "Checkout input is invalid");
  }
  const value = await http.request("public/v1/checkouts", {
    method: "POST",
    body,
    idempotencyKey,
    ...(signal ? { signal } : {}),
  });
  let checkout: CheckoutCreated;
  try {
    checkout = parseCheckoutCreated(value);
  } catch (error) {
    throw toBuPaymentError(error, ErrorCode.RESPONSE_INVALID, "Checkout response is invalid");
  }
  if (checkout.presentation?.kind === "redirect") validateRedirectUrl(checkout.presentation.url);
  return checkout;
}

function runCreate<T>(
  idempotency: CheckoutIdempotency | undefined,
  input: CreateCheckoutInput,
  create: (idempotencyKey: string) => Promise<T>,
): Promise<T> {
  if (idempotency) return idempotency.run(input, create);
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw validationError("Web Crypto UUID support is required to create a checkout");
  }
  return create(globalThis.crypto.randomUUID());
}

function validationError(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.VALIDATION_FAILED });
}

function defaultNavigate(url: string): void {
  globalThis.location.assign(url);
}

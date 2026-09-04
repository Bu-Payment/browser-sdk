import type { HttpClient } from "../core/http";
import { createPresentationHandle } from "../presentation/handle";
import { pollCanonical } from "../presentation/poll";
import type { PresentationResumeStore } from "../presentation/resume-store";
import { presentationSingleFlight } from "../presentation/single-flight";
import type { PresentationHandle, PresentationOptions } from "../presentation/types";
import { type CheckoutClient, createCheckoutBuilders } from "./builders";
import { runModal } from "./modal-runtime";
import type { CheckoutCreated, CheckoutLifecycle, CreateCheckoutInput } from "./types";
import {
  parseCheckoutCreated,
  parseCheckoutLifecycle,
  parseCreateCheckoutInput,
} from "./validation";

interface CheckoutRequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export type {
  CheckoutBuilder,
  CheckoutClient,
  CheckoutPresentationBuilder,
  CheckoutReadyBuilder,
  CheckoutResumeBuilder,
  CheckoutStatusBuilder,
} from "./builders";

export function createCheckoutClient(
  http: HttpClient,
  resumeStore?: PresentationResumeStore,
): CheckoutClient {
  const flights = new Map<string, PresentationHandle<CheckoutLifecycle>>();
  const getStatus = async (reference: string, signal?: AbortSignal) => {
    if (!reference) throw new TypeError("Checkout reference must not be empty");
    const value = await http.request(`public/v1/checkouts/${encodeURIComponent(reference)}`, {
      ...(signal ? { signal } : {}),
    });
    return parseCheckoutLifecycle(value);
  };
  const redirect = (checkout: CheckoutCreated, navigate = defaultNavigate) => {
    if (checkout.presentation?.kind !== "redirect") {
      throw new TypeError("Checkout presentation is not a redirect");
    }
    navigate(validateRedirectUrl(checkout.presentation.url));
  };
  const present = (checkout: CheckoutCreated, options: PresentationOptions) => {
    const parsed = parseCheckoutCreated(checkout);
    if (!parsed.presentation || (parsed.status !== "pending" && parsed.status !== "processing")) {
      throw new TypeError("Checkout does not have an active presentation");
    }
    if (parsed.presentation.kind === "redirect") {
      validateRedirectUrl(parsed.presentation.url);
      return presentationSingleFlight(flights, parsed.reference, () =>
        storedHandle(
          resumeStore,
          parsed.reference,
          parsed.expiresAt,
          createPresentationHandle("checkout_redirect", options, async (signal, emit) => {
            redirect(parsed, options.navigate);
            emit({ type: "opened" });
            return pollCheckout(getStatus, parsed.reference, signal, emit, options.pollIntervalMs);
          }),
        ),
      );
    }
    const document = globalThis.document;
    if (!document) throw new TypeError("A browser document is required for modal presentations");
    const presentation = parsed.presentation;
    return presentationSingleFlight(flights, parsed.reference, () => {
      let handle: PresentationHandle<CheckoutLifecycle>;
      handle = createPresentationHandle("checkout_modal", options, (signal, emit) =>
        runModal({
          http,
          checkout: parsed,
          presentation,
          document,
          signal,
          emit,
          ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
          cancel: () => handle.cancel(),
          poll: (pollSignal, pollEmit) =>
            pollCheckout(getStatus, parsed.reference, pollSignal, pollEmit, options.pollIntervalMs),
        }),
      );
      return storedHandle(resumeStore, parsed.reference, parsed.expiresAt, handle);
    });
  };
  const resume = (reference: string | undefined, options: PresentationOptions) => {
    const resolved = reference ?? resumeStore?.read("checkout")?.reference;
    if (!resolved) throw new TypeError("No resumable checkout presentation was found");
    return presentationSingleFlight(flights, resolved, () => {
      let handle: PresentationHandle<CheckoutLifecycle>;
      handle = createPresentationHandle("checkout_resume", options, async (signal, emit) => {
        const current = await getStatus(resolved, signal);
        if (checkoutTerminals.has(current.status)) {
          emit({
            type: checkoutSuccess.has(current.status) ? "completed" : "failed",
            status: current.status,
          });
          return current;
        }
        if (current.presentation?.kind === "modal") {
          const document = globalThis.document;
          if (!document)
            throw new TypeError("A browser document is required for modal presentations");
          return runModal({
            http,
            checkout: current,
            presentation: current.presentation,
            document,
            signal,
            emit,
            ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
            cancel: () => handle.cancel(),
            poll: (pollSignal, pollEmit) =>
              pollCheckout(getStatus, resolved, pollSignal, pollEmit, options.pollIntervalMs),
          });
        }
        return pollCheckout(getStatus, resolved, signal, emit, options.pollIntervalMs);
      });
      return clearCheckoutOnSuccess(resumeStore, handle);
    });
  };
  return createCheckoutBuilders({
    create: (input, options) => createCheckout(http, input, options),
    getStatus,
    present,
    resume,
  });
}

function storedHandle<T>(
  store: PresentationResumeStore | undefined,
  reference: string,
  expiresAt: string,
  handle: PresentationHandle<T>,
): PresentationHandle<T> {
  store?.save("checkout", reference, expiresAt);
  return clearCheckoutOnSuccess(store, handle);
}

function clearCheckoutOnSuccess<T>(
  store: PresentationResumeStore | undefined,
  handle: PresentationHandle<T>,
): PresentationHandle<T> {
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
    throw new TypeError("Checkout redirect must use HTTPS without credentials or fragment");
  }
  return url.href;
}

async function createCheckout(
  http: HttpClient,
  input: CreateCheckoutInput,
  options: CheckoutRequestOptions,
): Promise<CheckoutCreated> {
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

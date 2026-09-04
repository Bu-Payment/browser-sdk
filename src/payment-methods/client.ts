import type { HttpClient } from "../core/http";
import { createPresentationHandle } from "../presentation/handle";
import { pollCanonical } from "../presentation/poll";
import type { PresentationResumeStore } from "../presentation/resume-store";
import { presentationSingleFlight } from "../presentation/single-flight";
import type { PresentationHandle, PresentationOptions } from "../presentation/types";
import {
  createPaymentMethodBuilders,
  type PaymentMethodResumeOptions,
  type PaymentMethodsClient,
} from "./builders";
import type { PaymentMethodSetup } from "./types";
import { parsePaymentMethodSetup } from "./validation";

export type {
  PaymentMethodPresentationBuilder,
  PaymentMethodReferencedBuilder,
  PaymentMethodReferencedResumeBuilder,
  PaymentMethodResumeBuilder,
  PaymentMethodsClient,
} from "./builders";

export function createPaymentMethodsClient(
  http: HttpClient,
  resumeStore?: PresentationResumeStore,
): PaymentMethodsClient {
  const presentationFlights = new Map<string, PresentationHandle<PaymentMethodSetup>>();
  const resumeFlights = new Map<string, PresentationHandle<PaymentMethodSetup>>();
  const primitives = {
    async getStatus(reference: string, signal?: AbortSignal) {
      const value = await http.request(setupPath(reference), signalOptions(signal));
      return parsePaymentMethodSetup(value);
    },
    async confirm(reference: string, returnQuery: string, signal?: AbortSignal) {
      if (!returnQuery || returnQuery.length > 8_192) {
        throw new TypeError("returnQuery must contain 1 to 8192 characters");
      }
      const value = await http.request(`${setupPath(reference)}/confirm`, {
        method: "POST",
        body: { returnQuery },
        ...signalOptions(signal),
      });
      return parsePaymentMethodSetup(value);
    },
    present(setup: PaymentMethodSetup, options: PresentationOptions) {
      const parsed = parsePaymentMethodSetup(setup);
      if (parsed.status !== "requires_action" || !parsed.presentation) {
        throw new TypeError("Payment method setup does not require a presentation");
      }
      const url = redirectUrl(parsed.presentation.url);
      return presentationSingleFlight(presentationFlights, parsed.id, () =>
        storedSetupHandle(
          resumeStore,
          parsed,
          createPresentationHandle("payment_method_setup", options, async (signal, emit) => {
            (options.navigate ?? defaultNavigate)(url);
            emit({ type: "opened" });
            return pollSetup(primitives.getStatus, parsed.id, signal, emit, options.pollIntervalMs);
          }),
        ),
      );
    },
    resume(reference: string | undefined, options: PaymentMethodResumeOptions) {
      const resolved = reference ?? resumeStore?.read("payment_method")?.reference;
      if (!resolved) throw new TypeError("No resumable payment method setup was found");
      setupPath(resolved);
      return presentationSingleFlight(resumeFlights, resumeFlightKey(resolved, options), () =>
        clearSetupOnSuccess(
          resumeStore,
          createPresentationHandle("payment_method_resume", options, async (signal, emit) => {
            if (options.returnQuery !== undefined) {
              emit({ type: "callback_received" });
              emit({ type: "confirming" });
              await primitives.confirm(resolved, options.returnQuery, signal);
            }
            return pollSetup(primitives.getStatus, resolved, signal, emit, options.pollIntervalMs);
          }),
        ),
      );
    },
  };
  return createPaymentMethodBuilders(primitives);
}

function storedSetupHandle(
  store: PresentationResumeStore | undefined,
  setup: PaymentMethodSetup,
  handle: PresentationHandle<PaymentMethodSetup>,
): PresentationHandle<PaymentMethodSetup> {
  store?.save("payment_method", setup.id, setup.expiresAt);
  return clearSetupOnSuccess(store, handle);
}

function clearSetupOnSuccess(
  store: PresentationResumeStore | undefined,
  handle: PresentationHandle<PaymentMethodSetup>,
): PresentationHandle<PaymentMethodSetup> {
  handle.completion.then(
    () => store?.clear("payment_method"),
    () => undefined,
  );
  return handle;
}

const setupTerminals = new Set(["succeeded", "failed", "expired"]);
const setupSuccess = new Set(["succeeded"]);

function pollSetup(
  getStatus: (reference: string, signal?: AbortSignal) => Promise<PaymentMethodSetup>,
  reference: string,
  signal: AbortSignal,
  emit: Parameters<typeof pollCanonical>[2],
  interval?: number,
) {
  return pollCanonical(
    (requestSignal) => getStatus(reference, requestSignal),
    signal,
    emit,
    setupTerminals,
    setupSuccess,
    interval,
  );
}

function redirectUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TypeError("Payment method redirect must use HTTPS without credentials or fragment");
  }
  return url.href;
}

function defaultNavigate(url: string): void {
  globalThis.location.assign(url);
}

function setupPath(reference: string): string {
  if (!reference) {
    throw new TypeError("Payment method setup reference is invalid");
  }
  return `public/v1/payment-method-setups/${encodeURIComponent(reference)}`;
}

function signalOptions(signal?: AbortSignal) {
  return signal ? { signal } : {};
}

function resumeFlightKey(reference: string, options: PaymentMethodResumeOptions): string {
  return JSON.stringify([reference, options.returnQuery]);
}

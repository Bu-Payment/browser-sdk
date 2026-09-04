import type { ModalPresentation } from "../checkout/types";

export const TRUSTED_MODAL_SCRIPT =
  "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js" as const;

export interface TrustedModalInstance {
  on(event: string, callback: (payload: unknown) => void): void;
  closeModal(): void;
}

type TrustedModalConstructor = new (options: {
  path: string;
  environment: "test" | "live";
  data: Record<string, string | number | []>;
  verify: string[];
}) => TrustedModalInstance;

const loads = new WeakMap<Document, Promise<TrustedModalConstructor>>();

export function loadTrustedModalScript(
  presentation: ModalPresentation,
  document: Document,
  nonce: string | undefined,
  signal: AbortSignal,
): Promise<TrustedModalConstructor> {
  assertTrustedScript(presentation.resource.url, presentation.resource.version);
  const pending =
    loads.get(document) ??
    startLoad(document, nonce).catch((error: unknown) => {
      loads.delete(document);
      throw error;
    });
  loads.set(document, pending);
  return waitForCaller(pending, signal);
}

export function trustedModalOptions(presentation: ModalPresentation) {
  const { configuration, authorization } = presentation;
  const { booking, payer } = configuration;
  return {
    path: configuration.path,
    environment: configuration.environment,
    data: {
      booking_auth: authorization.value,
      booking_id: booking.id,
      channels: booking.channelId,
      currencies: booking.currency,
      total: booking.amount,
      allocations: booking.allocations,
      reference: booking.reference,
      payee_name: payer.name,
      payee_email: payer.email,
      payee_address: payer.address,
      payee_city: payer.city,
      payee_postcode: payer.postalCode,
      payee_country: payer.country,
      ...(configuration.description === undefined
        ? {}
        : { description: configuration.description }),
      ...(configuration.passengerCount === undefined ? {} : { pax: configuration.passengerCount }),
      ...(configuration.transactionType === undefined
        ? {}
        : { transactionType: configuration.transactionType }),
    },
    verify: [...authorization.verificationFields],
  };
}

function assertTrustedScript(value: string, version: string): void {
  const url = new URL(value);
  if (
    version !== "3.6.1" ||
    url.href !== TRUSTED_MODAL_SCRIPT ||
    url.protocol !== "https:" ||
    url.hostname !== "payment.tmtprotects.com" ||
    url.pathname !== "/tmt-payment-modal.3.6.1.js" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new TypeError("Modal script is not in the trusted presentation registry");
  }
}

function startLoad(document: Document, nonce?: string): Promise<TrustedModalConstructor> {
  const window = document.defaultView as TrustedModalWindow | null;
  if (!window) return Promise.reject(new TypeError("A browser document is required"));
  if (window.tmtPaymentModalReady) {
    return Promise.reject(new TypeError("Modal readiness callback is already registered"));
  }
  if (nonce !== undefined && (!nonce || nonce.length > 512)) {
    return Promise.reject(new TypeError("CSP nonce is invalid"));
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const cleanup = () => {
      window.tmtPaymentModalReady = undefined;
      script.onerror = null;
    };
    window.tmtPaymentModalReady = () => {
      const ModalConstructor = window.tmtPaymentModalSdk;
      cleanup();
      if (typeof ModalConstructor === "function") resolve(ModalConstructor);
      else reject(new TypeError("Trusted modal script did not register its SDK"));
    };
    script.src = TRUSTED_MODAL_SCRIPT;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    if (nonce !== undefined) script.nonce = nonce;
    script.onerror = () => {
      cleanup();
      loads.delete(document);
      reject(new TypeError("Trusted modal script failed to load"));
    };
    document.head.append(script);
  });
}

function waitForCaller<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

interface TrustedModalWindow extends Window {
  tmtPaymentModalReady?: (() => void) | undefined;
  tmtPaymentModalSdk?: TrustedModalConstructor | undefined;
}

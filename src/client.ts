import { type CatalogueClient, createCatalogueClient } from "./catalogue/client";
import { type CheckoutClient, createCheckoutClient } from "./checkout/client";
import { parseClientConfig } from "./core/config";
import { createHttpClient } from "./core/http";
import { createPaymentMethodsClient, type PaymentMethodsClient } from "./payment-methods/client";
import { browserSessionStorage, createPresentationResumeStore } from "./presentation/resume-store";
import { createSessionManager } from "./session/session-manager";

export interface BuPaymentClientOptions {
  publishableKey: string;
  apiBaseUrl: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  storage?: Storage;
}

export interface BuPaymentClient {
  catalogue: CatalogueClient;
  checkout: CheckoutClient;
  paymentMethods: PaymentMethodsClient;
}

export function createBuPaymentClient(options: BuPaymentClientOptions): BuPaymentClient {
  const config = parseClientConfig(options);
  const defaultFetch = globalThis.fetch;
  const fetch =
    options.fetch ??
    (typeof defaultFetch === "function" ? defaultFetch.bind(globalThis) : undefined);
  if (typeof fetch !== "function") throw new TypeError("A Fetch API implementation is required");
  const now = options.now ?? (() => new Date());
  const sessions = createSessionManager({ config, fetch, now });
  const http = createHttpClient({ config, fetch, sessions });
  const resumeStore = createPresentationResumeStore(
    config,
    options.storage ?? browserSessionStorage(),
    now,
  );
  return {
    catalogue: createCatalogueClient(http),
    checkout: createCheckoutClient(http, resumeStore),
    paymentMethods: createPaymentMethodsClient(http, resumeStore),
  };
}

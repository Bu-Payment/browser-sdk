import { type CatalogueClient, createCatalogueClient } from "./catalogue/client";
import { type CheckoutClient, createCheckoutClient } from "./checkout/client";
import { parseClientConfig } from "./core/config";
import { createHttpClient } from "./core/http";
import { createSessionManager } from "./session/session-manager";

export interface BuPaymentClientOptions {
  publishableKey: string;
  apiBaseUrl: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

export interface BuPaymentClient {
  catalogue: CatalogueClient;
  checkout: CheckoutClient;
}

export function createBuPaymentClient(options: BuPaymentClientOptions): BuPaymentClient {
  const config = parseClientConfig(options);
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") throw new TypeError("A Fetch API implementation is required");
  const sessions = createSessionManager({ config, fetch, now: options.now ?? (() => new Date()) });
  const http = createHttpClient({ config, fetch, sessions });
  return { catalogue: createCatalogueClient(http), checkout: createCheckoutClient(http) };
}
